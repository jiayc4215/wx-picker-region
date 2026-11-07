const os = require('node:os');
const path = require('node:path');

const { getMacRoots } = require('./platforms/mac.js');
const { getLegacySystemDriveRoots, getLegacyMountedDriveRoots } = require('./platforms/win-legacy.js');
const {
  getModernUserDataRoots,
  getMountedDriveRoots,
  findDevtoolsInstallDirs,
  registryInstallDirs,
  discoverInstallDirs
} = require('./platforms/win-modern.js');

/**
 * 获取跨平台候选搜索根目录
 * 
 * 策略分流：
 * 1. macOS (darwin): 标准 /Applications 安装包及 Library/Application Support 缓存目录
 * 2. Windows (win32):
 *    - 旧版散装模式：Program Files 及各挂载盘下的 package.nw/js/libs 预设路径
 *    - 新版缓存/封包模式：AppData 缓存目录 + 注册表动态探测 + 受限文件系统遍历兜底
 * 3. Linux 及其他: ~/.config/微信开发者工具 默认路径
 * 
 * @param {string} platform 操作系统平台标识（默认 process.platform）
 * @param {NodeJS.ProcessEnv} env 环境变量对象（默认 process.env）
 * @param {string} home 用户主目录（默认 os.homedir()）
 * @param {string[]} mountedDrives 额外挂载的盘符列表（默认调用 getMountedDriveRoots(env)）
 * @param {string[]} [installDirs] 自定义或外部注入的安装目录列表
 * @returns {string[]}
 */
function getSearchRoots(
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  mountedDrives = getMountedDriveRoots(env),
  installDirs
) {
  if (platform === 'darwin') {
    return getMacRoots(home);
  }

  if (platform === 'win32') {
    const candidates = [
      ...getLegacySystemDriveRoots(env),
      ...getModernUserDataRoots(env),
      ...getLegacyMountedDriveRoots(mountedDrives)
    ];

    for (const installDir of installDirs ?? discoverInstallDirs()) {
      candidates.push(installDir);
    }
    return [...new Set(candidates)];
  }

  return [
    path.join(home, '.config', '微信开发者工具')
  ];
}

module.exports = {
  getSearchRoots,
  findDevtoolsInstallDirs,
  registryInstallDirs,
  discoverInstallDirs
};
