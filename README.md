# WeChat Picker Region Exporter

一个本地运行的开源小工具，从微信开发者工具内置的 `region_sub_strict_third` 地区库导出 `picker mode="region"` 省市区树形 JSON。保留行政区划码、名称和邮编；仅读取本机文件，不联网、不上传数据。

## 使用

普通开发者需要 Node.js 18 或更高版本：

```sh
npm start -- --output ./region.json
```

工具会优先查找微信开发者工具安装目录，再扫描用户数据缓存中的 `WeappCode` 版本目录。macOS 常见位置包括 `/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/libs` 和 `~/Library/Application Support/微信开发者工具/<实例>/WeappCode/.../js/libs`；Windows 会检查 Program Files 下的工具安装目录及 `%LOCALAPPDATA%/微信开发者工具`。也可以补充自定义目录：

```sh
npm start -- --root "/自定义/微信数据目录" --output ./region.json
```

终端用户无需安装 Node.js：项目维护者可按系统构建独立程序，发布时需要分别提供 macOS 与 Windows 下载包。

```sh
npm install
npm run build:mac
npm run build:win
```

第一次打包需要联网下载 `pkg` 和对应 Node.js 运行时。Windows/macOS 可执行文件应在对应系统上构建及验证后再发布。

## 输出结构

```json
[
  {
    "code": "省级代码",
    "name": "省份",
    "postcode": "邮编",
    "children": [
      {
        "code": "市级代码",
        "name": "城市",
        "postcode": "邮编",
        "children": [
          {
            "code": "区县代码",
            "name": "区县",
            "postcode": "邮编",
            "children": []
          }
        ]
      }
    ]
  }
]
```

## 兼容性说明

转换器复用开发者工具读取该库的行格式：每行包含 6 位行政区划码、带层级缩进的地区名和邮编；0 格缩进为省、2 格全角空格为市、3 格为区县。缩进决定层级，编码前缀用于校验父子关系。导出前校验 34 个省级地区、父级关系和三级结构；源库存在重复行政码时会原样保留。若工具安装位置不同，可用 `--root` 指定包含 `region_sub_strict_third` 的目录。微信开发者工具升级后，该内置库可能变化；本工具只读文件，不修改其内容。

## 开发

```sh
npm test
```

MIT License。
