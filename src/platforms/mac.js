const path = require('node:path');

/**
 * 获取 macOS (Darwin) 环境下的候选搜索路径
 * 包含官方 App 安装包内置路径以及用户 Application Support 缓存目录
 * 
 * @param {string} home 用户主目录
 * @returns {string[]}
 */
function getMacRoots(home) {
  return [
    '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/libs',
    '/Applications/微信开发者工具.app/Contents/Resources/package.nw/js/libs',
    path.posix.join(home, 'Library', 'Application Support', '微信开发者工具')
  ];
}

module.exports = {
  getMacRoots
};

