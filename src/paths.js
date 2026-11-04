const os = require('node:os');
const path = require('node:path');
const { existsSync } = require('node:fs');

function getMountedDriveRoots(env) {
  const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || 'C:';
  return Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:`)
    .filter((drive) => existsSync(`${drive}\\`))
    .filter((drive) => drive.toLowerCase() !== systemDrive.toLowerCase());
}

function getSearchRoots(platform = process.platform, env = process.env, home = os.homedir(), mountedDrives = getMountedDriveRoots(env)) {
  if (platform === 'darwin') {
    return [
      '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/libs',
      '/Applications/微信开发者工具.app/Contents/Resources/package.nw/js/libs',
      path.join(home, 'Library', 'Application Support', '微信开发者工具')
    ];
  }

  if (platform === 'win32') {
    const winPath = path.win32;
    const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || 'C:';
    const localAppData = env.LOCALAPPDATA || winPath.join(systemDrive, 'Users', env.USERNAME || 'Default', 'AppData', 'Local');
    const appData = env.APPDATA || winPath.join(systemDrive, 'Users', env.USERNAME || 'Default', 'AppData', 'Roaming');
    const programFiles = env.ProgramFiles || winPath.join(systemDrive, 'Program Files');
    const programFilesX86 = env['ProgramFiles(x86)'] || winPath.join(systemDrive, 'Program Files (x86)');
    const candidates = [
      winPath.join(programFilesX86, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
      winPath.join(programFiles, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
      winPath.join(programFilesX86, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs'),
      winPath.join(programFiles, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs'),
      winPath.join(localAppData, '微信开发者工具'),
      winPath.join(appData, '微信开发者工具')
    ];

    for (const drive of mountedDrives) {
      const root = `${drive}\\`;
      for (const programDirectory of ['Program Files (x86)', 'Program Files']) {
        for (const codeDirectory of ['code', '']) {
          candidates.push(winPath.join(root, programDirectory, 'Tencent', '微信web开发者工具', codeDirectory, 'package.nw', 'js', 'libs'));
        }
      }
      for (const codeDirectory of ['code', '']) {
        candidates.push(winPath.join(root, 'Tencent', '微信web开发者工具', codeDirectory, 'package.nw', 'js', 'libs'));
      }
    }
    return [...new Set(candidates)];
  }

  return [
    path.join(home, '.config', '微信开发者工具')
  ];
}

module.exports = { getSearchRoots };
