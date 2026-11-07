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

也可以补充自定义扫描目录：

```sh
npm start -- --root "/自定义/微信数据目录" --output ./region.json
```

## 平台定位策略与工作原理

针对各操作系统与不同时期的微信开发者工具架构，工具采用分层模块化定位（详见 `src/platforms/`）：

### 1. macOS 平台定位 (`src/platforms/mac.js`)
- **标准应用安装包**：查找 `/Applications/wechatwebdevtools.app` 与 `/Applications/微信开发者工具.app` 下的 `Contents/Resources/package.nw/js/libs`。
- **用户数据与基础库缓存**：扫描 `~/Library/Application Support/微信开发者工具`，覆盖开发期动态下载的基础库副本。

### 2. Windows 旧版散装模式 (`src/platforms/win-legacy.js`)
- **适用场景**：早期的微信开发者工具（基于 NW.js 散装目录架构）。
- **静态模式穷举**：覆盖 `Program Files`、`Program Files (x86)` 以及系统中已挂载的所有非系统盘（D:、E: 等）。
- **结构变体兼容**：自动兼容 `code/package.nw/js/libs` 和无 `code` 层的 `package.nw/js/libs` 路径。

### 3. Windows 新版封包与动态探测 (`src/platforms/win-modern.js`)
- **适用场景**：新版开发者工具打包为 `.asar` 二进制归档，或安装在自定义路径、免安装绿色版等场景。
- **注册表多维度查询**：
  - 自动覆盖 64位系统级、32位 WOW6432Node、当前用户级（HKCU）三处卸载注册表；
  - 提取 `InstallLocation`、`UninstallString`、`DisplayIcon` 反推真实安装路径；
  - **OEM 编码自愈**：Windows 控制台的 OEM 代码页（GBK、UTF-8、BIG5、Shift_JIS 等）不可预知，代码依次尝试多种字符集解码，并结合实际磁盘落盘校验，剔除乱码和残留路径。
- **磁盘受限遍历兜底**：当注册表未命中时，在挂载磁盘中按名称探测；严格限制最大遍历深度为 3 层，并设 1.5 秒硬性超时熔断，且自动跳过 `Windows`、`node_modules` 等无关大型目录。
- **运行时数据与缓存**：覆盖 `%LOCALAPPDATA%\微信开发者工具` 和 `%APPDATA%\微信开发者工具` 目录。

### 4. 零依赖 ASAR 提取与数据解析
- **自建 ASAR 二进制解码器** (`src/scanner.js`)：无需安装外部 npm 依赖，通过解析 ASAR 头部 16 字节与 JSON 虚拟目录清单，直接计算文件在二进制流中的 offset 进行切片读取，毫秒级提取；同时支持 `app.asar.unpacked` 实体目录。
- **格式解析与校验** (`src/region.js`)：通过全角空格数（0格省、2格市、3格区）识别层级；严格校验 34 个省级行政区编码、前缀从属关系和非空子节点，杜绝输出脏数据。

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

## 开发与测试

```sh
npm test
```

MIT License。
