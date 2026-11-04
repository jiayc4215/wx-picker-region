#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSearchRoots } from './paths.js';
import { scanRoots } from './scanner.js';

function parseArgs(args) {
  const result = { output: path.resolve('region.json'), roots: [] };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--output' || args[i] === '-o') result.output = path.resolve(args[++i] ?? result.output);
    else if (args[i] === '--root') result.roots.push(path.resolve(args[++i] ?? '.'));
    else if (args[i] === '--help' || args[i] === '-h') result.help = true;
  }
  return result;
}

function help() {
  console.log(`微信 picker region 本地数据导出\n\n用法: wx-region-export [选项]\n\n选项:\n  -o, --output <文件>  输出 JSON 文件 (默认 ./region.json)\n      --root <目录>    额外扫描目录，可重复传入\n  -h, --help           显示帮助\n\n工具查找微信开发者工具内置的 region_sub_strict_third，只读取本机文件，不联网。`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  help();
  process.exit(0);
}

const roots = [...new Set([...getSearchRoots(), ...options.roots])];
console.log(`正在查找微信开发者工具内置地区库，共检查 ${roots.length} 个位置...`);
const result = await scanRoots(roots);

if (!result.matches.length) {
  console.error('\n没有找到有效的 region_sub_strict_third。已检查位置:');
  for (const item of result.diagnostics) {
    if (item.root) console.error(`  - ${item.root}`);
    if (item.file) console.error(`  - ${item.file}: ${item.error}`);
  }
  console.error('\n请确认微信开发者工具已安装。也可用 --root 指定包含该文件的目录。');
  process.exitCode = 1;
} else {
  const best = result.matches[0];
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(best.tree, null, 2)}\n`, 'utf8');
  console.log(`\n已导出 ${best.counts.total} 个行政区节点到: ${options.output}`);
  console.log(`省 ${best.counts.provinces} 个，市 ${best.counts.cities} 个，区县 ${best.counts.districts} 个`);
  console.log(`数据来源: ${best.file}`);
  if (result.matches.length > 1) console.log(`另发现 ${result.matches.length - 1} 个缓存副本，已优先使用排在前面的安装目录版本。`);
}
