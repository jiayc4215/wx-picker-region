const { readFile, stat } = require('node:fs/promises');

// 2 MB 大小上限限制，防范误读超大文件
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * 从物理磁盘普通文件中读取地区库数据
 * 
 * 适用于旧版微信开发者工具的散装目录，或用户通过 --root 显式指定的本地源文件。
 * 
 * @param {string} fullPath 文件绝对物理路径
 * @returns {Promise<{ label: string, text: string }>}
 */
async function readSourceFromFile(fullPath) {
  const fileStat = await stat(fullPath);
  if (fileStat.size > MAX_FILE_BYTES) {
    throw new Error('源文件超过 2 MB');
  }
  const text = await readFile(fullPath, 'utf8');
  return {
    label: fullPath,
    text
  };
}

module.exports = {
  readSourceFromFile
};

