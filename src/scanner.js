const { open, readdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { parseRegionSource } = require('./region.js');

const SOURCE_NAME = 'region_sub_strict_third';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// asar 索引是 JSON，正常只有几百 KB，上限仅用于防御损坏的文件。
const MAX_ASAR_HEADER_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 12;
// app.asar.unpacked 是 asar 的已解包内容，遍历它会和 asar 内条目重复。
const SKIP_DIRS = new Set([
  'node_modules', 'logs', 'log', 'gpucache', 'code cache', 'weappvendor',
  'app.asar.unpacked', 'vsextensions', 'locales', 'inspector_overlay'
]);

// fs.read 不保证一次读满，循环补齐到 buffer 长度或文件末尾。
async function readFully(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset;
}

// asar 的目录在索引里表示为 { files: { 名称: 节点 } }，叶子节点带 size/offset。
function findAsarEntry(node, prefix) {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const current = prefix ? `${prefix}/${name}` : name;
    if (value.files) {
      const nested = findAsarEntry(value, current);
      if (nested) return nested;
    } else if (name === SOURCE_NAME) {
      return { path: current, entry: value };
    }
  }
  return null;
}

// asar 布局：8 字节头（4 字节 size + 4 字节 headerSize）+ JSON 索引 + 数据区；
// JSON 长度在偏移 12 处，文件数据的 offset 相对数据区起点。
async function readSourceFromAsar(asarPath) {
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

    const hit = findAsarEntry(header, '');
    if (!hit) return null;
    const label = `${asarPath}!/${hit.path}`;

    // unpacked 条目不在 asar 数据区，而是在 <asar>.unpacked 下有实体文件。
    if (hit.entry.unpacked) {
      const unpackedPath = path.join(`${asarPath}.unpacked`, ...hit.path.split('/'));
      return { label, text: await readFile(unpackedPath, 'utf8') };
    }

    const size = Number(hit.entry.size);
    if (!Number.isInteger(size) || size > MAX_FILE_BYTES) throw new Error('源文件超过 2 MB');
    // 数据区起点 = 8 字节头 + headerSize。
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

async function scanRoots(roots) {
  const matches = [];
  const diagnostics = [];
  const visited = new Set();

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
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) await walk(fullPath, depth + 1, rootIndex);
        continue;
      }
      const isAsar = entry.isFile() && entry.name.toLowerCase().endsWith('.asar');
      if (!entry.isFile() || (!isAsar && entry.name !== SOURCE_NAME) || visited.has(fullPath)) continue;
      visited.add(fullPath);

      try {
        let text;
        let reportedPath = fullPath;
        if (isAsar) {
          const extracted = await readSourceFromAsar(fullPath);
          if (!extracted) {
            diagnostics.push({ file: fullPath, error: `asar 内未找到 ${SOURCE_NAME}` });
            continue;
          }
          text = extracted.text;
          reportedPath = extracted.label;
        } else {
          const fileStat = await stat(fullPath);
          if (fileStat.size > MAX_FILE_BYTES) throw new Error('源文件超过 2 MB');
          text = await readFile(fullPath, 'utf8');
        }
        matches.push({ file: reportedPath, ...parseRegionSource(text), rootIndex });
      } catch (error) {
        diagnostics.push({ file: fullPath, error: error.message });
      }
    }
  }

  for (let index = 0; index < roots.length; index += 1) {
    diagnostics.push({ root: roots[index] });
    await walk(roots[index], 0, index);
  }

  matches.sort((a, b) => a.rootIndex - b.rootIndex);
  return { matches, diagnostics };
}

module.exports = { scanRoots };
