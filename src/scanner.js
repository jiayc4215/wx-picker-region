import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseRegionSource } from './region.js';

const SOURCE_NAME = 'region_sub_strict_third';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 12;
const SKIP_DIRS = new Set(['node_modules', 'logs', 'log', 'gpuCache', 'code cache', 'weappvendor']);

export async function scanRoots(roots) {
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
      if (!entry.isFile() || entry.name !== SOURCE_NAME || visited.has(fullPath)) continue;
      visited.add(fullPath);

      try {
        const fileStat = await stat(fullPath);
        if (fileStat.size > MAX_FILE_BYTES) throw new Error('源文件超过 2 MB');
        const parsed = parseRegionSource(await readFile(fullPath, 'utf8'));
        matches.push({ file: fullPath, ...parsed, rootIndex });
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
