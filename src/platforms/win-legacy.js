const path = require('node:path');

const BACKSLASH = '\\';

/**
 * 获取 Windows 旧版本（基于散装 package.nw/js/libs 目录结构）的系统盘常见安装路径
 * 
 * 微信开发者工具基于 NW.js/Electron，旧版本将核心资源以散装形式保存在 package.nw/js/libs 下。
 * 此处穷举 32位/64位 以及带 code / 不带 code 子目录的常见组合。
 * 
 * @param {NodeJS.ProcessEnv} env 环境变量
 * @returns {string[]}
 */
function getLegacySystemDriveRoots(env) {
  const winPath = path.win32;
  const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || 'C:';
  const programFiles = env.ProgramFiles || winPath.join(systemDrive, 'Program Files');
  const programFilesX86 = env['ProgramFiles(x86)'] || winPath.join(systemDrive, 'Program Files (x86)');

  return [
    winPath.join(programFilesX86, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
    winPath.join(programFiles, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
    winPath.join(programFilesX86, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs'),
    winPath.join(programFiles, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs')
  ];
}

/**
 * 遍历非系统盘（如 D:、E: 等）下的旧版散装安装目录变体
 * 
 * @param {string[]} mountedDrives 非系统盘盘符列表（如 ['D:', 'E:']）
 * @returns {string[]}
 */
function getLegacyMountedDriveRoots(mountedDrives) {
  const winPath = path.win32;
  const candidates = [];

  for (const drive of mountedDrives) {
    const root = `${drive}${BACKSLASH}`;
    for (const programDirectory of ['Program Files (x86)', 'Program Files']) {
      for (const codeDirectory of ['code', '']) {
        candidates.push(winPath.join(root, programDirectory, 'Tencent', '微信web开发者工具', codeDirectory, 'package.nw', 'js', 'libs'));
      }
    }
    for (const codeDirectory of ['code', '']) {
      candidates.push(winPath.join(root, 'Tencent', '微信web开发者工具', codeDirectory, 'package.nw', 'js', 'libs'));
    }
  }

  return candidates;
}

module.exports = {
  getLegacySystemDriveRoots,
  getLegacyMountedDriveRoots
};

