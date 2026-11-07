const { open, readFile } = require('node:fs/promises');
const path = require('node:path');

// 地区库文件正常仅几百 KB，2 MB 上限用于防范超大异常文件引发 OOM
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// ASAR 索引是 JSON 格式，正常只有几十到几百 KB，64 MB 上限仅用于防御损坏或恶意构造的包
const MAX_ASAR_HEADER_BYTES = 64 * 1024 * 1024;

/**
 * 完整读取指定长度的字节流补齐 Buffer
 * 
 * Node.js 底层 fs.read 不保证单次读取能够填满 Buffer，
 * 通过循环推进 offset 确保完整读完所需字节，或在到达文件末尾（EOF）时退出。
 * 
 * @param {import('node:fs/promises').FileHandle} handle 文件句柄
 * @param {Buffer} buffer 接收数据的缓冲区
 * @param {number} position 文件中的起始物理偏移量
 * @returns {Promise<number>} 实际读取的字节数
 */
async function readFully(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset;
}

/**
 * 在 ASAR 头部的 JSON 虚拟目录树中递归查找指定名称的文件
 * 
 * ASAR 目录树结构示例：
 * { files: { "js": { files: { "libs": { files: { "region_sub_strict_third": { size: 100, offset: "0" } } } } } } }
 * 
 * @param {object} node 当前目录节点
 * @param {string} prefix 递归构建的虚拟路径前缀
 * @param {string} targetName 目标文件名
 * @returns {{ path: string, entry: object } | null}
 */
function findAsarEntry(node, prefix, targetName) {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const current = prefix ? `${prefix}/${name}` : name;
    if (value.files) {
      // 虚拟目录：继续深入递归
      const nested = findAsarEntry(value, current, targetName);
      if (nested) return nested;
    } else if (name === targetName) {
      // 命中目标文件条目
      return { path: current, entry: value };
    }
  }
  return null;
}

/**
 * 从 Electron / NW.js 的 .asar 二进制归档文件中提取目标数据
 * 
 * 读取机制（零依赖、免全量解压）：
 * 1. 读前 16 字节头部，第 12 偏移量处为 32 位小端整数，表示 JSON 目录清单的字节长度；
 * 2. 仅读取该长度的 Buffer 并 JSON.parse，获得包内虚拟文件目录树；
 * 3. 递归查出目标文件的 offset（相对数据区）与 size；
 * 4. 计算数据区起点（8 + prefix.readUInt32LE(4)），定点按需切片读取几百 KB 数据；
 * 5. 若目标被打包器标记为 unpacked，则回退读取 <asar>.unpacked 实体物理目录。
 * 
 * @param {string} asarPath .asar 文件的绝对物理路径
 * @param {string} targetName 目标源文件名
 * @returns {Promise<{ label: string, text: string } | null>} 提取结果；若包内不存在则返回 null
 */
async function readSourceFromAsar(asarPath, targetName) {
  const handle = await open(asarPath, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if (await readFully(handle, prefix, 0) < prefix.length) return null;
    const jsonLength = prefix.readUInt32LE(12);
    if (jsonLength <= 0 || jsonLength > MAX_ASAR_HEADER_BYTES) return null;

    const jsonBuffer = Buffer.alloc(jsonLength);
    if (await readFully(handle, jsonBuffer, 16) < jsonLength) return null;
    let header;
    try {
      header = JSON.parse(jsonBuffer.toString('utf8'));
    } catch {
      return null;
    }

    const hit = findAsarEntry(header, '', targetName);
    if (!hit) return null;
    const label = `${asarPath}!/${hit.path}`;

    // unpacked 条目不存放于 asar 数据区，而在同级 <asar>.unpacked 目录中存在真实物理文件
    if (hit.entry.unpacked) {
      const unpackedPath = path.join(`${asarPath}.unpacked`, ...hit.path.split('/'));
      return { label, text: await readFile(unpackedPath, 'utf8') };
    }

    const size = Number(hit.entry.size);
    if (!Number.isInteger(size) || size > MAX_FILE_BYTES) throw new Error('源文件超过 2 MB');

    // 数据区物理起点 = 8 字节头 + headerSize
    const dataStart = 8 + prefix.readUInt32LE(4);
    const buffer = Buffer.alloc(size);
    if (await readFully(handle, buffer, dataStart + Number(hit.entry.offset)) < size) {
      throw new Error('asar 内容读取不完整');
    }
    return { label, text: buffer.toString('utf8') };
  } finally {
    await handle.close();
  }
}

module.exports = {
  readSourceFromAsar
};

