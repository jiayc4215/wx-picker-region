const { readdir } = require('node:fs/promises');
const path = require('node:path');

const { parseRegionSource } = require('./region.js');
const { readSourceFromAsar } = require('./readers/asar.js');
const { readSourceFromFile } = require('./readers/plain.js');

// 微信官方地区库的核心数据源文件名
const SOURCE_NAME = 'region_sub_strict_third';
// 最大递归遍历深度，避免在超深文件系统中耗尽资源
const MAX_DEPTH = 12;
// 遍历目录时的剪枝黑名单：
// 1. node_modules, logs 等体积庞大且不包含业务资源的目录；
// 2. app.asar.unpacked 是 asar 的已解包目录，直接遍历会与 asar 包内条目重复。
const SKIP_DIRS = new Set([
  'node_modules', 'logs', 'log', 'gpucache', 'code cache', 'weappvendor',
  'app.asar.unpacked', 'vsextensions', 'locales', 'inspector_overlay'
]);

/**
 * 扫描指定的一组根目录，提取微信开发者工具的内置地区库
 * 
 * 架构流程：
 * 1. 递归向下遍历各搜索根目录（受到 MAX_DEPTH 和 SKIP_DIRS 约束）；
 * 2. 对每个遇到的条目进行类型分流：
 *    - 若是 .asar 文件：分流至 ASAR 封包读取器（readSourceFromAsar）；
 *    - 若是目标普通文件：分流至普通文件读取器（readSourceFromFile）；
 * 3. 提取成功后，通过 parseRegionSource 校验并解析成省市区树；
 * 4. 按根目录的初始优先级（rootIndex）排序输出，优先采用安装目录的官方版本。
 * 
 * @param {string[]} roots 待扫描的根目录路径列表
 * @returns {Promise<{ matches: Array<{ file: string, tree: Array<any>, counts: object, rootIndex: number }>, diagnostics: Array<object> }>}
 */
async function scanRoots(roots) {
  const matches = [];
  const diagnostics = [];
  const visited = new Set();

  /**
   * 递归遍历目录
   * @param {string} current 当前目录物理路径
   * @param {number} depth 当前递归深度
   * @param {number} rootIndex 当前来源在 roots 数组中的索引（表示优先级）
   */
  async function walk(current, depth, rootIndex) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      // 处理子目录（排除黑名单后继续递归）
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) {
          await walk(fullPath, depth + 1, rootIndex);
        }
        continue;
      }

      const isAsar = entry.isFile() && entry.name.toLowerCase().endsWith('.asar');
      // 仅处理未访问过的 .asar 归档文件 或 目标实体文件
      if (!entry.isFile() || (!isAsar && entry.name !== SOURCE_NAME) || visited.has(fullPath)) {
        continue;
      }
      visited.add(fullPath);

      try {
        let text;
        let reportedPath = fullPath;

        if (isAsar) {
          // 方式 A：从 ASAR 二进制归档中提取虚拟条目
          const extracted = await readSourceFromAsar(fullPath, SOURCE_NAME);
          if (!extracted) {
            diagnostics.push({ file: fullPath, error: `asar 内未找到 ${SOURCE_NAME}` });
            continue;
          }
          text = extracted.text;
          reportedPath = extracted.label;
        } else {
          // 方式 B：从普通物理磁盘文件中直接读取
          const extracted = await readSourceFromFile(fullPath);
          text = extracted.text;
          reportedPath = extracted.label;
        }

        // 解析并强校验文本数据
        matches.push({
          file: reportedPath,
          ...parseRegionSource(text),
          rootIndex
        });
      } catch (error) {
        diagnostics.push({ file: fullPath, error: error.message });
      }
    }
  }

  for (let index = 0; index < roots.length; index += 1) {
    diagnostics.push({ root: roots[index] });
    await walk(roots[index], 0, index);
  }

  // 按根目录顺序排序，确保安装目录版本排在用户缓存版本前面
  matches.sort((a, b) => a.rootIndex - b.rootIndex);
  return { matches, diagnostics };
}

module.exports = {
  scanRoots
};
