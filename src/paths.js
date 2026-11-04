import os from 'node:os';
import path from 'node:path';

export function getSearchRoots(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'darwin') {
    return [
      '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/libs',
      '/Applications/微信开发者工具.app/Contents/Resources/package.nw/js/libs',
      path.join(home, 'Library', 'Application Support', '微信开发者工具')
    ];
  }

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      path.join(programFilesX86, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
      path.join(programFiles, 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'),
      path.join(programFilesX86, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs'),
      path.join(programFiles, 'Tencent', '微信web开发者工具', 'package.nw', 'js', 'libs'),
      path.join(localAppData, '微信开发者工具'),
      path.join(appData, '微信开发者工具')
    ];
  }

  return [
    path.join(home, '.config', '微信开发者工具')
  ];
}
