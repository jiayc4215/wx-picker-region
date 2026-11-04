const PROVINCES = new Map([
  ['110000', '北京市'], ['120000', '天津市'], ['130000', '河北省'], ['140000', '山西省'],
  ['150000', '内蒙古自治区'], ['210000', '辽宁省'], ['220000', '吉林省'], ['230000', '黑龙江省'],
  ['310000', '上海市'], ['320000', '江苏省'], ['330000', '浙江省'], ['340000', '安徽省'],
  ['350000', '福建省'], ['360000', '江西省'], ['370000', '山东省'], ['410000', '河南省'],
  ['420000', '湖北省'], ['430000', '湖南省'], ['440000', '广东省'], ['450000', '广西壮族自治区'],
  ['460000', '海南省'], ['500000', '重庆市'], ['510000', '四川省'], ['520000', '贵州省'],
  ['530000', '云南省'], ['540000', '西藏自治区'], ['610000', '陕西省'], ['620000', '甘肃省'],
  ['630000', '青海省'], ['640000', '宁夏回族自治区'], ['650000', '新疆维吾尔自治区'],
  ['710000', '台湾省'], ['810000', '香港特别行政区'], ['820000', '澳门特别行政区']
]);

export function parseRegionSource(text) {
  const provinces = new Map();
  let currentProvince = null;
  let currentCity = null;
  let cityCount = 0;
  let districtCount = 0;
  let recordCount = 0;

  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    if (!rawLine.trim()) continue;
    const columns = rawLine.split('\t');
    const code = columns[0]?.trim();
    const match = columns.length === 2
      ? columns[1].match(/^([\u3000 ]*)(.*?)\s+(\d+)\s*$/u)
      : null;
    const indent = (match?.[1].match(/\u3000/gu) ?? []).length;
    const name = match?.[2].trim();
    const postcode = match?.[3];
    if (!/^\d{6}$/u.test(code ?? '') || !name || !postcode || ![0, 2, 3].includes(indent)) {
      throw new Error(`第 ${index + 1} 行格式无效`);
    }
    recordCount += 1;

    if (indent === 0) {
      if (!PROVINCES.has(code) || name !== PROVINCES.get(code)) {
        throw new Error(`省级地区名称不匹配: ${code} ${name}`);
      }
      currentProvince = { code, name, postcode, children: [] };
      provinces.set(code, currentProvince);
      currentCity = null;
    } else if (indent === 2) {
      if (!currentProvince || code.slice(0, 2) !== currentProvince.code.slice(0, 2)) {
        throw new Error(`城市 ${code} 的省级父节点缺失或不匹配`);
      }
      currentCity = { code, name, postcode, children: [] };
      currentProvince.children.push(currentCity);
      cityCount += 1;
    } else {
      if (!currentCity || code.slice(0, 4) !== currentCity.code.slice(0, 4)) {
        throw new Error(`区县 ${code} 的市级父节点缺失或不匹配`);
      }
      currentCity.children.push({ code, name, postcode, children: [] });
      districtCount += 1;
    }
  }

  if (provinces.size !== PROVINCES.size) {
    throw new Error(`省级地区不完整: 期望 ${PROVINCES.size} 个，实际 ${provinces.size} 个`);
  }

  const tree = [...provinces.values()];
  if (tree.some((province) => province.children.length === 0)) {
    throw new Error('地区库中存在没有下级城市的省份');
  }
  if (tree.some((province) => province.children.some((city) => city.children.length === 0))) {
    throw new Error('地区库中存在没有下级区县的城市');
  }

  return {
    tree,
    counts: {
      provinces: provinces.size,
      cities: cityCount,
      districts: districtCount,
      total: recordCount
    }
  };
}
