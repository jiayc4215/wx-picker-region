const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseRegionSource } = require('../src/region.js');
const { getSearchRoots, findDevtoolsInstallDirs, registryInstallDirs } = require('../src/paths.js');
const { scanRoots } = require('../src/scanner.js');

const provinces = [
  ['110000', '北京市'], ['120000', '天津市'], ['130000', '河北省'], ['140000', '山西省'],
  ['150000', '内蒙古自治区'], ['210000', '辽宁省'], ['220000', '吉林省'], ['230000', '黑龙江省'],
  ['310000', '上海市'], ['320000', '江苏省'], ['330000', '浙江省'], ['340000', '安徽省'],
  ['350000', '福建省'], ['360000', '江西省'], ['370000', '山东省'], ['410000', '河南省'],
  ['420000', '湖北省'], ['430000', '湖南省'], ['440000', '广东省'], ['450000', '广西壮族自治区'],
  ['460000', '海南省'], ['500000', '重庆市'], ['510000', '四川省'], ['520000', '贵州省'],
  ['530000', '云南省'], ['540000', '西藏自治区'], ['610000', '陕西省'], ['620000', '甘肃省'],
  ['630000', '青海省'], ['640000', '宁夏回族自治区'], ['650000', '新疆维吾尔自治区'],
  ['710000', '台湾省'], ['810000', '香港特别行政区'], ['820000', '澳门特别行政区']
];

function sourceFixture() {
  const lines = [];
  for (const [provinceCode, provinceName] of provinces) {
    const cityCode = `${provinceCode.slice(0, 2)}0100`;
    const districtCode = provinceCode === '440000' ? '440103' : `${cityCode.slice(0, 4)}01`;
    lines.push(`${provinceCode}\t${provinceName} 000000`);
    const cityName = provinceCode === '110000' ? '北京市' : provinceCode === '440000' ? '广州市' : `${provinceName}城市`;
    lines.push(`${cityCode}\t　　${cityName} ${provinceCode === '440000' ? '510000' : '100000'}`);
    lines.push(`${districtCode}\t　　　${provinceCode === '440000' ? '荔湾区 510145' : '测试区 100001'}`);
  }
  return `${lines.join('\r\n')}\r\n`;
}

test('parses the strict-third tab/whitespace source into province-city-district tree', () => {
  const parsed = parseRegionSource(sourceFixture());
  assert.deepEqual(parsed.counts, { provinces: 34, cities: 34, districts: 34, total: 102 });
  assert.deepEqual(parsed.tree[0], {
    code: '110000', name: '北京市', postcode: '000000',
    children: [{
      code: '110100', name: '北京市', postcode: '100000',
      children: [{ code: '110101', name: '测试区', postcode: '100001', children: [] }]
    }]
  });
  const guangdong = parsed.tree.find((province) => province.code === '440000');
  assert.deepEqual(guangdong.children[0].children.find((district) => district.code === '440103'), {
    code: '440103', name: '荔湾区', postcode: '510145', children: []
  });
});

test('rejects malformed rows and incomplete province data, while preserving source duplicates', () => {
  assert.throws(() => parseRegionSource('440103\t　　　荔湾区'), /格式无效/u);
  assert.throws(() => parseRegionSource('110000\t北京市 100000'), /省级地区不完整/u);

  const duplicateSource = sourceFixture().replace(
    '440103\t　　　荔湾区 510145',
    '440103\t　　　荔湾区 510145\r\n440103\t　　　小榄镇 510145'
  );
  const parsed = parseRegionSource(duplicateSource);
  const guangdong = parsed.tree.find((province) => province.code === '440000');
  assert.deepEqual(guangdong.children[0].children.map((district) => district.name), ['荔湾区', '小榄镇']);
  assert.equal(parsed.counts.total, 103);
});

test('returns platform-specific install and cache roots', () => {
  const macRoots = getSearchRoots('darwin', {}, '/Users/test');
  assert.ok(macRoots[0].endsWith('/package.nw/js/libs'));
  assert.ok(macRoots.some((root) => root.endsWith('Library/Application Support/微信开发者工具')));

  const winRoots = getSearchRoots('win32', {
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
    APPDATA: 'C:\\Users\\test\\AppData\\Roaming'
  }, 'C:\\Users\\test', ['D:'], []);
  assert.equal(winRoots[0], path.win32.join(
    'C:\\Program Files (x86)', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'
  ));
  assert.ok(winRoots.some((root) => root.includes('Program Files (x86)')));
  assert.ok(winRoots.some((root) => root.includes('AppData')));
  assert.ok(winRoots.some((root) => root.includes('Roaming')));
  assert.ok(winRoots.includes('D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\code\\package.nw\\js\\libs'));
  assert.ok(winRoots.includes('D:\\Tencent\\微信web开发者工具\\package.nw\\js\\libs'));
});

test('scans only the named local library and returns the parsed data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-'));
  try {
    const libs = path.join(root, 'WeappCode', 'package.nw', 'js', 'libs');
    await mkdir(libs, { recursive: true });
    await writeFile(path.join(libs, 'region_sub_strict_third'), sourceFixture());
    await writeFile(path.join(libs, 'other.json'), JSON.stringify({ unrelated: true }));
    const result = await scanRoots([root]);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].counts.total, 102);
    assert.match(result.matches[0].file, /region_sub_strict_third$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function buildAsar(entries) {
  const files = {};
  const chunks = [];
  let offset = 0;
  for (const [internalPath, data] of entries) {
    const parts = internalPath.split('/');
    let node = files;
    for (const part of parts.slice(0, -1)) {
      node[part] = node[part] ?? { files: {} };
      node = node[part].files;
    }
    node[parts.at(-1)] = { size: data.length, offset: String(offset) };
    chunks.push(data);
    offset += data.length;
  }

  const json = Buffer.from(JSON.stringify({ files }), 'utf8');
  const aligned = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + aligned, 4);
  prefix.writeUInt32LE(4 + aligned, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, Buffer.alloc(aligned - json.length), ...chunks]);
}

test('reads the packed library out of an Electron asar archive', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-asar-'));
  try {
    const resources = path.join(root, '微信web开发者工具', 'resources');
    await mkdir(resources, { recursive: true });
    await writeFile(path.join(resources, 'app.asar'), buildAsar([
      ['js/libs/region_sub_strict', Buffer.from('x'.repeat(4096), 'utf8')],
      ['js/libs/region_sub_strict_third', Buffer.from(sourceFixture(), 'utf8')],
      ['package.json', Buffer.from('{"name":"devtools"}', 'utf8')]
    ]));

    const result = await scanRoots([root]);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].counts.total, 102);
    assert.match(result.matches[0].file, /app\.asar!\/js\/libs\/region_sub_strict_third$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a diagnostic when an asar archive holds no region library', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-empty-asar-'));
  try {
    await mkdir(path.join(root, 'resources'), { recursive: true });
    await writeFile(path.join(root, 'resources', 'default_app.asar'), buildAsar([
      ['index.js', Buffer.from('console.log(1)', 'utf8')]
    ]));

    const result = await scanRoots([root]);
    assert.deepEqual(result.matches, []);
    assert.ok(result.diagnostics.some((item) => item.file?.endsWith('default_app.asar')
      && /asar 内未找到/u.test(item.error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('appends probed install directories to the win32 roots', () => {
  const roots = getSearchRoots('win32', {
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
    APPDATA: 'C:\\Users\\test\\AppData\\Roaming'
  }, 'C:\\Users\\test', [], ['D:\\ruanjian\\微信web开发者工具']);
  assert.equal(roots.at(-1), 'D:\\ruanjian\\微信web开发者工具');
  assert.equal(roots[0], path.win32.join(
    'C:\\Program Files (x86)', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'js', 'libs'
  ));
});

test('finds install directories by name within the depth limit', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-probe-'));
  try {
    await mkdir(path.join(root, 'soft', '微信web开发者工具'), { recursive: true });
    await mkdir(path.join(root, 'Windows', '微信web开发者工具'), { recursive: true });
    await mkdir(path.join(root, 'a', 'b', 'c', 'wechatwebdevtools'), { recursive: true });

    assert.deepEqual(findDevtoolsInstallDirs([root]), [
      path.win32.join(root, 'soft', '微信web开发者工具')
    ]);
    assert.deepEqual(findDevtoolsInstallDirs([root], -1), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const UNINSTALL_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

function registryFixture(iconDir, { locationDir } = {}) {
  return [
    `${UNINSTALL_KEY}\\微信开发者工具`,
    '    DisplayName    REG_SZ    微信开发者工具 2.02.2609250',
    `    DisplayIcon    REG_SZ    ${path.win32.join(iconDir, '微信开发者工具.exe')}`,
    `    InstallLocation    REG_SZ    ${locationDir ? `"${locationDir}"` : ''}`,
    `    UninstallString    REG_SZ    "${path.win32.join(iconDir, '卸载微信开发者工具.exe')}" /S`,
    '',
    `${UNINSTALL_KEY}\\微信`,
    '    DisplayName    REG_SZ    微信',
    '    InstallLocation    REG_SZ    "C:\\Program Files\\Tencent\\Weixin"',
    ''
  ].join('\r\n');
}

test('derives the install directory from the Windows uninstall registry', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-reg-'));
  try {
    const installDir = path.win32.join(root, '微信web开发者工具');
    await mkdir(installDir, { recursive: true });
    const query = () => Buffer.from(registryFixture(installDir), 'utf8');
    assert.deepEqual(registryInstallDirs(query), [installDir]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts a quoted InstallLocation alongside the executable directory', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wx-region-reg-'));
  try {
    const installDir = path.win32.join(root, '微信web开发者工具');
    const locationDir = path.win32.join(root, 'installed-here');
    await mkdir(installDir, { recursive: true });
    await mkdir(locationDir, { recursive: true });
    const query = () => Buffer.from(registryFixture(installDir, { locationDir }), 'utf8');
    assert.deepEqual(registryInstallDirs(query), [locationDir, installDir]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discards registry entries that are not the devtools or that do not exist', { skip: process.platform !== 'win32' }, () => {
  const missing = path.win32.join('Q:', 'nowhere', '微信web开发者工具');
  assert.deepEqual(registryInstallDirs(() => Buffer.from(registryFixture(missing), 'utf8')), []);
  assert.deepEqual(registryInstallDirs(() => Buffer.alloc(0)), []);
});
