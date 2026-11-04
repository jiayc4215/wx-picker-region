# WeChat Picker Region Exporter

一个本地运行的开源小工具，从微信开发者工具内置的 `region_sub_strict_third` 地区库导出 `picker mode="region"` 省市区树形 JSON。保留行政区划码、名称和邮编；仅读取本机文件，不联网、不上传数据。

## 快速使用（无需安装 Node.js）

仓库 `dist/` 目录提供以下独立程序：

| 系统 | 程序 |
| --- | --- |
| macOS Apple 芯片 | `dist/wx-picker-region-exporter-arm64` |
| macOS Intel | `dist/wx-picker-region-exporter-x64` |
| Windows x64 | `dist/wx-picker-region-exporter.exe` |

在项目目录运行对应命令，JSON 默认输出到当前目录的 `region.json`：

```sh
# macOS Apple 芯片
./dist/wx-picker-region-exporter-arm64

# macOS Intel
./dist/wx-picker-region-exporter-x64
```

Windows PowerShell：

```powershell
.\dist\wx-picker-region-exporter.exe
```

也可以显式指定输出位置：

```sh
./dist/wx-picker-region-exporter-arm64 --output ./data/regions.json
```

若 macOS 阻止首次运行，可在 Finder 中右键该程序并选择“打开”。

## 从源码运行

普通开发者需要 Node.js 18 或更高版本：

```sh
npm start -- --output ./region.json
```

工具会优先查找微信开发者工具安装目录，再扫描用户数据缓存中的 `WeappCode` 版本目录。macOS 常见位置包括 `/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/libs` 和 `~/Library/Application Support/微信开发者工具/<实例>/WeappCode/.../js/libs`；Windows 会检查 `C:\Program Files (x86)\Tencent\微信web开发者工具\code\package.nw\js\libs`、无 `code` 子目录的安装布局，以及 `%LOCALAPPDATA%` 和 `%APPDATA%` 下的 `微信开发者工具` 缓存。也可以补充自定义目录：

```sh
npm start -- --root "/自定义/微信数据目录" --output ./region.json
```

## 重新构建程序

修改源码后，可在对应系统上重新构建。构建需要 Node.js 18 或更高版本；`pkg` 会下载打包所需的 Node.js 运行时。

```sh
npm install
npm run build:mac
npm run build:win
```

提交 `dist/` 中的程序时，应在对应目标系统上构建并运行验证。macOS 当前提供 arm64 和 x64；Windows 当前提供 x64。

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
