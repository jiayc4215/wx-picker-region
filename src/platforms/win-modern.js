const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');

const INSTALL_DIR_PATTERN = /微信.*开发者工具|wechatwebdevtools/iu;
// 探测未知磁盘时限制深度和总耗时，避免用户装在大目录下时启动被拖慢。
const PROBE_MAX_DEPTH = 3;
const PROBE_TIME_BUDGET_MS = 1500;
// 系统目录体量大且不可能装开发者工具，遍历它们只会浪费时间。
const PROBE_SKIP_DIRS = new Set([
  'windows', 'users', 'programdata', 'perflogs', 'recovery', 'winsxs', 'appdata',
  '$recycle.bin', 'system volume information', 'node_modules', '.git'
]);

const BACKSLASH = '\\';
// 32 位、64 位以及用户级安装位置，覆盖不同版本安装器写入的卸载信息。
const UNINSTALL_ROOTS = [
  `HKLM${BACKSLASH}SOFTWARE${BACKSLASH}Microsoft${BACKSLASH}Windows${BACKSLASH}CurrentVersion${BACKSLASH}Uninstall`,
  `HKLM${BACKSLASH}SOFTWARE${BACKSLASH}WOW6432Node${BACKSLASH}Microsoft${BACKSLASH}Windows${BACKSLASH}CurrentVersion${BACKSLASH}Uninstall`,
  `HKCU${BACKSLASH}SOFTWARE${BACKSLASH}Microsoft${BACKSLASH}Windows${BACKSLASH}CurrentVersion${BACKSLASH}Uninstall`
];
// 这些值用于识别“这是开发者工具”；其中后两项本身就能推导出安装目录。
const MATCHED_VALUE_NAMES = ['displayname', 'displayicon', 'installlocation', 'uninstallstring'];
const PATH_VALUE_NAMES = ['displayicon', 'uninstallstring'];
// reg.exe 按控制台 OEM 代码页输出，无法直接查询，只能逐个候选编码试解，
// 再靠 existsSync 淘汰解错的乱码路径。
const DECODER_LABELS = ['utf-8', 'gbk', 'big5', 'shift_jis', 'euc-kr'];
const REGISTRY_MAX_BUFFER = 8 * 1024 * 1024;
const REGISTRY_TIMEOUT_MS = 5000;

/**
 * 获取 Windows 用户数据与缓存目录（AppData / LocalAppData）
 * 新版微信开发者工具运行时会将基础库和解包代码缓存在此。
 * 
 * @param {NodeJS.ProcessEnv} env 
 * @returns {string[]}
 */
function getModernUserDataRoots(env) {
  const winPath = path.win32;
  const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || 'C:';
  const username = env.USERNAME || 'Default';
  const localAppData = env.LOCALAPPDATA || winPath.join(systemDrive, 'Users', username, 'AppData', 'Local');
  const appData = env.APPDATA || winPath.join(systemDrive, 'Users', username, 'AppData', 'Roaming');

  return [
    winPath.join(localAppData, '微信开发者工具'),
    winPath.join(appData, '微信开发者工具')
  ];
}

/**
 * 枚举所有 A-Z 盘中实际挂载的盘符根目录
 * @returns {string[]}
 */
function getAllDriveRoots() {
  return Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:`)
    .filter((drive) => existsSync(`${drive}${BACKSLASH}`));
}

/**
 * 获取除了系统盘以外的所有外接盘/数据盘盘符
 * @param {NodeJS.ProcessEnv} env 
 * @returns {string[]}
 */
function getMountedDriveRoots(env) {
  const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || 'C:';
  return getAllDriveRoots().filter((drive) => drive.toLowerCase() !== systemDrive.toLowerCase());
}

/**
 * 注册表查不到时的兜底策略：在指定磁盘上按目录名逐个探测。
 * 受到最大深度（3层）和时间预算（1500ms）约束。
 */
function findDevtoolsInstallDirs(drives = getAllDriveRoots(), budgetMs = PROBE_TIME_BUDGET_MS) {
  const winPath = path.win32;
  const found = [];
  const deadline = Date.now() + budgetMs;

  function walk(current, depth) {
    if (depth > PROBE_MAX_DEPTH || Date.now() > deadline) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = winPath.join(current, entry.name);
      if (INSTALL_DIR_PATTERN.test(entry.name)) {
        found.push(fullPath);
        continue;
      }
      if (PROBE_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walk(fullPath, depth + 1);
    }
  }

  for (const drive of drives) {
    if (Date.now() > deadline) break;
    walk(`${drive}${BACKSLASH}`, 1);
  }
  return found;
}

function queryUninstallRoot(root) {
  try {
    return execFileSync('reg', ['query', root, '/s'], {
      timeout: REGISTRY_TIMEOUT_MS,
      maxBuffer: REGISTRY_MAX_BUFFER,
      windowsHide: true
    });
  } catch (error) {
    // 超时或键不存在时 reg 可能已经输出了一部分，尽量保留。
    return Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.alloc(0);
  }
}

// reg query /s 的输出格式：键名独占一行，值行缩进为 "名称  REG_SZ  值"。
function parseUninstallEntries(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      current = {};
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const match = line.match(/^\s+(\S.*?)\s{2,}(REG_\w+)\s{2,}(.*)$/u);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (MATCHED_VALUE_NAMES.includes(name)) current[name] = match[3].trim();
  }
  return entries;
}

// 卸载命令可能是 '"C:\...\x.exe" /S' 或 'C:\...\x.exe /S'，只取可执行文件部分。
function stripExecutableSuffix(value) {
  const quoted = value.match(/^"([^"]+)"/u);
  if (quoted) return quoted[1];
  const withExtension = value.match(/^(.*?\.exe)/iu);
  if (withExtension) return withExtension[1];
  return value.split(/\s+/u)[0] ?? '';
}

function installDirsFromEntry(entry) {
  const winPath = path.win32;
  // 只保留和开发者工具相关的条目，避免把“微信”等其它腾讯产品也算进来。
  const matched = Object.values(entry).some((value) => INSTALL_DIR_PATTERN.test(value));
  if (!matched) return [];

  const dirs = [];
  const installLocation = entry.installlocation?.replace(/^"|"$/gu, '').trim();
  if (installLocation) dirs.push(installLocation);
  for (const name of PATH_VALUE_NAMES) {
    const executable = entry[name] ? stripExecutableSuffix(entry[name]) : '';
    if (executable) dirs.push(winPath.dirname(executable));
  }
  return dirs;
}

/**
 * 从 Windows 卸载注册表中定位微信开发者工具安装路径
 * 包含多 OEM 代码页容错和落盘校验。
 */
function registryInstallDirs(query = queryUninstallRoot) {
  if (process.platform !== 'win32') return [];
  const found = [];

  for (const root of UNINSTALL_ROOTS) {
    const buffer = query(root);
    if (!buffer?.length) continue;
    for (const label of DECODER_LABELS) {
      let text;
      try {
        text = new TextDecoder(label).decode(buffer);
      } catch {
        continue;
      }
      const decoded = [];
      for (const entry of parseUninstallEntries(text)) {
        for (const dir of installDirsFromEntry(entry)) {
          const normalized = path.win32.normalize(dir);
          // 用磁盘校验剔除解码失败产生的乱码路径，同时也过滤掉已卸载的残留项。
          if (normalized && existsSync(normalized)) decoded.push(normalized);
        }
      }
      if (decoded.length) {
        found.push(...decoded);
        break;
      }
    }
  }
  return [...new Set(found)];
}

/**
 * 动态发现安装目录：
 * 优先读注册表（准确、开销小），没有结果再退化为文件系统探测。
 */
function discoverInstallDirs() {
  const fromRegistry = registryInstallDirs();
  return fromRegistry.length ? fromRegistry : findDevtoolsInstallDirs();
}

module.exports = {
  getModernUserDataRoots,
  getAllDriveRoots,
  getMountedDriveRoots,
  findDevtoolsInstallDirs,
  registryInstallDirs,
  discoverInstallDirs
};

