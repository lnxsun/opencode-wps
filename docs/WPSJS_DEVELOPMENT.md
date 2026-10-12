# WPS JS 加载项开发与安装指南

本文档介绍 WPS JS 加载项（wpsjs）的开发、部署和安装流程。

---

## 一、WPS 加载项概述

### 什么是 WPS 加载项

WPS 加载项是一套基于 Web 技术用来扩展 WPS 应用程序的解决方案。每个 WPS 加载项对应打开一个网页，并通过调用网页中 JavaScript 方法来完成其功能逻辑。

**组成部分：**
1. **自定义功能区** - 通过 `ribbon.xml` 文件定义工具栏按钮
2. **网页部分** - HTML + JavaScript，实现具体功能

**支持的应用类型：**
| 类型 | WPS 应用 | ProgID |
|------|----------|--------|
| 文字 (Word) | WPS 文字 | `Kwps.Application` |
| 表格 (Excel) | WPS 表格 | `Ket.Application` |
| 演示 (PPT) | WPS 演示 | `Kwpp.Application` |

---

## 二、环境准备

### 1. 安装 Node.js

- 推荐版本：Node.js 18 LTS 或 20 LTS
- 下载地址：https://nodejs.org/

### 2. 安装 WPS

- WPS 个人版 12.1.0+
- 或 WPS 企业版

### 3. 安装 wpsjs 工具包

```bash
# 全局安装
npm install -g wpsjs

# 如果之前已安装，更新到最新版本
npm update -g wpsjs

# 验证安装
wpsjs --help
```

---

## 三、快速开始

### 1. 创建加载项项目

```bash
# 创建加载项（按提示选择类型和 UI 框架）
wpsjs create my-addon

# 进入项目目录
cd my-addon
```

**创建选项说明：**

| 选项 | 说明 |
|------|------|
| 加载项类型 | 文字 / 电子表格 / 演示 |
| UI 框架 | 无（原生） / Vue / React |

### 2. 调试加载项

```bash
# 启动调试（自动打开 WPS 并加载插件）
wpsjs debug
```

`wpsjs debug` 会：
1. 启动 WPS 客户端
2. 启动 HTTP 热更新服务
3. 从 HTTP 服务加载在线加载项

### 3. 项目结构

```
my-addon/
├── index.html          # 入口文件（自动生成，不要修改）
├── main.js              # 主入口 JS
├── js/
│   ├── utils.js         # 工具函数
│   └── config.js       # 配置文件
├── ribbbon.xml         # 功能区定义
├── package.json        # 项目配置
└── wps-addon-build/    # 构建输出（打包后）
```

---

## 四、加载项配置

### ribbon.xml（功能区定义）

定义工具栏按钮和功能区：

```xml
<customUI onLoad="OnLoad" xmlns="http://schemas.microsoft.com/office/2006/01/customui">
    <ribbon>
        <tabs>
            <tab id="MyTab" label="我的插件">
                <group id="MyGroup" label="功能">
                    <button id="btnHello" label="打招呼" 
                        imageMso="HappyFace" 
                        onAction="OnAction" />
                </group>
            </tab>
        </tabs>
    </ribbon>
</customUI>
```

### main.js（接口函数）

定义与 ribbon.xml 对应的函数：

```javascript
// 加载完成回调
function OnLoad(ribbon) {
    console.log('加载项已加载');
}

// 按钮点击回调
function OnAction(control) {
    if (control.Id === 'btnHello') {
        alert('你好！');
    }
}
```

### 常用 WPS API

```javascript
// 获取当前应用
var app = window.Application;

// 获取活动文档
var doc = app.ActiveDocument;

// 获取选区
var selection = app.Selection;

// 获取活动窗口
var window = app.ActiveWindow;
```

### 任务窗格 TaskPane API（PR #79 验证结论）

> 结论来源：`opencode-wps/main.js` 的 `setTaskPaneDockPosition()` + `tests/taskpane-dock.test.js`（vm 加载生产源码实测）。

```javascript
// 1. 创建任务窗格：CreateTaskPane 只传 url 单参数（稳妥用法）
var tskpane = window.Application.CreateTaskPane(GetUrlPath() + '/taskpane.html');

// 2. 创建后通过 DockPosition 属性显式校正停靠方向（枚举值见 WPS_Enum）
tskpane.DockPosition = WPS_Enum.msoCTPDockPositionRight; // 2 = 右侧停靠

// 3. 每次打开/切换可见性时重新校正，防止位置漂移再次遮挡 WPS 顶栏标签
function setTaskPaneDockPosition(tskpane) {
    if (!tskpane) return false;
    try {
        tskpane.DockPosition = WPS_Enum.msoCTPDockPositionRight;
        return true;
    } catch (e) {
        console.error('[WPS] 设置任务窗格停靠位置失败: ' + (e && e.message ? e.message : e));
        return false;
    }
}
```

**注意事项（PR #79 评审结论）：**

1. **`CreateTaskPane` 第二参数不传**：仓库内无 WPS JS API 文档佐证 `CreateTaskPane(url, DockPosition)` 第二参数被官方支持，若签名只接受一个参数，第二参数会被静默忽略导致修复不生效。统一改用创建后设置 `DockPosition` 属性（已实测有效）。
2. **`DockPosition` 枚举值不能随意新增**：`WPS_Enum` 整体赋给 `window.Application.Enum`，新增枚举必须与已有值（`msoFileDialogOpen: 1`、`msoFileDialogFolderPicker: 4`）去重，否则按值比较会串台。当前停靠枚举仅定义 `msoCTPDockPositionLeft: 0` / `msoCTPDockPositionRight: 2`（其中实际使用 `Right`，`Left` 保留备用）。
3. **设置失败必须留痕**：`DockPosition` 赋值用 try/catch 包裹且 catch 内 `console.error` 输出，禁止空 catch 吞异常（否则问题会静默复现却汇报「已修复」）。
4. **`GetTaskPane` 必须判空 + try/catch**：`taskpane_id` 持久化在 `PluginStorage` 中，WPS 重启后旧 id 残留、`GetTaskPane(tsId)` 可能返回 `null`，个别版本对无效/过期 id 还会直接**抛异常**——无论哪种情况，直接访问 `tp.Visible` 都会中断导致窗格打不开。统一做法：拿到 `tp` 前先 try/catch 包裹 `GetTaskPane`（异常时 `console.error` 留痕），再对 `tp` 判空，`null` 时回退走「重新 `CreateTaskPane` + 重存 `taskpane_id`」路径（`OnAction` 的 `btnShowTaskPane` 分支已实现，`tests/taskpane-dock.test.js` 的「GetTaskPane 返回 null 回退重建」与「GetTaskPane 抛异常回退重建」用例覆盖）。
5. **`PluginStorage` 读取必须 try/catch**：`PluginStorage.getItem` 在插件初始化未完成等场景可能抛异常，与仓库 `checkStatus`/`pollCommand`/`dockOpenCodeWindow` 中的既有防御模式保持一致——读取失败留痕并回退重建（`btnShowTaskPane` 分支已实现，`tests/taskpane-dock.test.js` 的「getItem 抛异常回退重建」用例覆盖）。
6. **`CreateTaskPane` 必须 try/catch**：若 `CreateTaskPane` 本身抛异常（如 `taskpane.html` 路径无效、WPS 环境异常），`btnShowTaskPane` 的 `!tp` 分支会直接中断且无留痕。统一做法：`createTaskPane()` 内部包 try/catch，失败 `console.error` 留痕并返回 `null`，调用处 `if (!tp) return` 兜底（`tests/taskpane-dock.test.js` 的「CreateTaskPane 抛异常」用例覆盖）。
7. **`PluginStorage.setItem` 必须 try/catch**：`setItem` 与 `getItem` 同源同概率抛异常（如插件初始化未完成），若在 `createTaskPane()` 的大 try 块内裸奔，一旦抛异常会中断后续 `DockPosition` 校正与 `Visible` 置位——窗格创建了却永远不显示，且 `createTaskPane()` 返回 `null` 导致调用处直接 return。统一做法：`setItem` 单独包 try/catch，失败 `console.error` 留痕后**继续执行**后续初始化（`createTaskPane()` 已实现，`tests/taskpane-dock.test.js` 的「setItem 抛异常留痕后继续」用例覆盖）。
8. **可见性切换也要 try/catch**：`tp.Visible = !tp.Visible` 与 `createTaskPane()` 内的 `Visible` 置位同属属性赋值，个别 WPS 版本同样可能抛异常，若不包 try/catch 会中断 `OnAction` 按钮回调。统一做法：`btnShowTaskPane` 分支的可见性切换单独包 try/catch，失败 `console.error` 留痕后继续（已实现，`tests/taskpane-dock.test.js` 的「切换可见性失败留痕」用例覆盖）；同时 `createTaskPane()` 外层 catch 文案使用「初始化任务窗格失败」而非「创建任务窗格失败」——该 try 块涵盖创建/存 ID/校正/置位全流程，文案过窄会误导排查方向。
9. **`createTaskPane()` 内 `Visible` 置位必须单独 try/catch**：若 `tskpane.Visible = true` 抛异常（个别版本只读属性），窗格已创建、ID 已存，此时绝不能 `return null`——那会让调用处误判「创建失败」，且下次点击无自愈机会。统一做法：内层 try/catch 留痕后**仍返回窗格对象**，保留下次点击自愈路径（`GetTaskPane` 找回 → 重新校正 + 切换可见性）（已实现，`tests/taskpane-dock.test.js` 的「Visible 置位失败仍返回窗格对象」用例覆盖）。
10. **`setItem` 持久化失败要有内存 ID 兜底**：`createTaskPane()` 在 `PluginStorage.setItem` 失败（留痕后继续）时，ID 未持久化——若窗格已显示，再次点击会因 `getItem` 拿不到 ID 而重复 `CreateTaskPane`，造成多窗格叠加。统一做法：模块级 `taskpaneIdCache` 先于 `setItem` 记录本次会话有效 ID，`OnAction` 在 `getItem` 读取为空/异常时回退到内存值（已实现，`tests/taskpane-dock.test.js` 的「setItem 持久化失败内存 ID 兜底」用例覆盖）。内存值随插件进程清空，WPS 重启后由 `PluginStorage` 持久化值接管，两者天然互补。**注意：`taskpaneIdCache = tskpane.ID` 必须判空**——个别版本 `CreateTaskPane` 返回的窗格对象 `ID` 可能为 `undefined`，直接覆盖会令内存兜底失效回到多窗格叠加场景；统一做法：ID 为空时 `console.error` 留痕且**不覆盖既有缓存**，同时**跳过 `setItem` 持久化写入**——否则会把 `undefined` 写进 `PluginStorage` 覆盖既有**有效** ID（已实现，`tests/taskpane-dock.test.js` 的「窗格 ID 为空不覆盖缓存 + 不写 setItem」用例覆盖）。
11. **异常信息提取统一用 `errMsg(e)`**：`e` 可能是 `Error` 对象（取 `.message`）也可能是字符串等任意值，`(e && e.message ? e.message : e)` 表达式此前在 `main.js` 中重复 6+ 次。统一做法：提取 `errMsg()` 公共函数，并将 `main.js` 中**全部** 10 处异常信息提取（含既有 `checkStatus`/`sendDocInfo`/`checkWpsReady` 等 5 处 `e.message` 裸访问）统一收敛（已实现，`tests/taskpane-dock.test.js` 的「errMsg 公共函数」用例覆盖）。
12. **`CreateTaskPane` 返回 null 也要判空**：`createTaskPane()` 已对 `CreateTaskPane` **抛异常**做了 try/catch，但个别版本可能**返回 `null`**（而非抛异常）——若直接访问 `tskpane.ID` 会抛误导性的 TypeError，外层 catch 虽能兜住，但「初始化任务窗格失败」文案会把排查方向带偏到创建/存 ID/校正/置位全流程。统一做法：拿到返回值后立即判空，`null` 时 `console.error('[WPS] 创建任务窗格失败: CreateTaskPane 返回空对象')` 明确留痕并 `return null`（已实现，`tests/taskpane-dock.test.js` 的「CreateTaskPane 返回 null 立即判空」用例覆盖）。
13. **停靠校正失败不阻断创建流程**：`setTaskPaneDockPosition()` 返回 `boolean`（失败时内部已留痕），但停靠校正失败**不代表窗格不可用**——窗格已创建、ID 已兜底，此时应继续置可见并返回窗格对象，让下次点击经 `GetTaskPane` 找回后重新校正（自愈机会）；若在失败时中断或返回 `null`，会误判「创建失败」。统一做法：`createTaskPane()` 检查返回值，失败时补充 `console.error('[WPS] 任务窗格停靠校正失败（窗格仍可用，下次点击将重新校正）')` 留痕后继续（已实现，`tests/taskpane-dock.test.js` 的「停靠校正失败仍返回窗格对象」用例覆盖）。
14. **`GetTaskPane` 找回路径的停靠校正也要检查返回值**：`btnShowTaskPane` 的「GetTaskPane 找回」分支每次打开也会调用 `setTaskPaneDockPosition(tp)` 重新校正防漂移——与 `createTaskPane()` 内保持一致，校正失败（内部已留痕）时同样补充「窗格仍可用，下次点击将重新校正」增强留痕，不中断可见性切换（下次点击仍会重新校正，有自愈机会）。两处行为统一，避免「创建路径有增强留痕、找回路径静默」的不一致（已实现，`tests/taskpane-dock.test.js` 的「GetTaskPane 找回路径停靠校正失败」用例覆盖）。

## 五、部署模式

WPS 加载项支持两种部署模式：

### 1. publish.xml 模式（推荐）

**特点：**
- 插件信息存储在 `publish.xml` 文件中
- 通过 `wpsjs publish` 命令打包
- 需要 HTTP 服务器

**部署流程：**

```bash
# 1. 打包加载项
cd my-addon
wpsjs publish -s "http://192.168.1.100:8080/"

# 2. 部署文件
# - 将 wps-addon-build/ 部署到服务器
# - 将 wps-addon-publish/publish.html 部署到服务器

# 3. 用户访问 publish.html 安装
```

### 2. jsplugins.xml 模式

**特点：**
- 插件信息存储在 `jsplugins.xml` 文件中
- 通过 `wpsjs build` 打包
- 需要配置 oem.ini 文件

**部署流程：**

```bash
# 1. 打包加载项
cd my-addon
wpsjs build

# 2. 部署文件到服务器
# - 将 wps-addon-build/ 部署到服务器

# 3. 配置 jsplugins.xml
# <jsplugin type="wps" enable="true" name="my-addon" url="http://server/path/my-addon_"/>

# 4. 配置 oem.ini（需要 WPS 官方协助）
```

---

## 六、本地安装

### 方法 1：直接复制（离线模式）

```bash
# 1. 打包离线加载项
wpsjs build --exe

# 2. 将生成的文件复制到 jsaddons 目录
# 路径：%appdata%/kingsoft/wps/jsaddons/

# 3. 文件结构
# jsaddons/
# ├── my-addon_/          # 加载项目录（注意：必须以 _ 结尾）
# │   ├── index.html
# │   ├── main.js
# │   ├── ribbon.xml
# │   └── ...
# └── publish.xml         # 插件配置
```

### 方法 2：publish.html 安装

```bash
# 1. 运行 wpsjs publish
wpsjs publish -s "http://127.0.0.1:8080/"

# 2. 启动 HTTP 服务器
cd wps-addon-build
npx serve -p 8080

# 3. 用户浏览器访问 publish.html
# http://127.0.0.1:8080/publish.html

# 4. 点击"安装加载项"
```

### 方法 3：install-addons.js（推荐本地开发）

```bash
# 使用项目自定义安装脚本
node install-addons.js
```

此脚本会自动：
1. 复制插件文件到 jsaddons 目录
2. 更新 publish.xml
3. 更新 jsplugins.xml
4. 更新 authaddin.json（启用开关）
5. 编译 MCP 服务器
6. 安装 Skills 和 Agents

---

## 七、配置文件说明

### publish.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jsplugins>
    <jsplugin enable="true" name="my-addon" url="my-addon_" type="wps,et,wpp"/>
</jsplugins>
```

| 属性 | 说明 |
|------|------|
| enable | true/false/enable_dev |
| name | 加载项名称 |
| url | 加载项目录名（以 _ 结尾） |
| type | wps（文字）、et（表格）、wpp（演示） |

### jsplugins.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jsplugins>
  <jsplugin type="wps" enable="true" name="my-addon" url="my-addon_"/>
</jsplugins>
```

### authaddin.json

WPS 真正的启用开关（Windows 用户配置）：

```json
{
    "wps": {
        "6b7a57516c426c6551796e326633317a": {
            "enable": true,
            "name": "my-addon",
            "path": "C:/Users/.../jsaddons/my-addon_"
        }
    }
}
```

---

## 八、加载项目录

| 操作系统 | 路径 |
|----------|------|
| Windows | `%appdata%/kingsoft/wps/jsaddons/` |
| Linux | `~/.local/share/Kingsoft/wps/jsaddons/` |

---

## 九、常见问题

### Q: 加载项不显示

1. 检查 publish.xml 是否存在且配置正确
2. 检查 authaddin.json 中 enable 是否为 true
3. 重启 WPS

### Q: 页面空白

1. 检查 index.html 是否存在
2. 检查 main.js 是否有语法错误

### Q: 调试时热更新不生效

1. 确保 wpsjs debug 正在运行
2. 检查浏览器控制台是否有错误

### Q: 如何卸载加载项

1. 删除 jsaddons 目录下的加载项文件夹
2. 从 publish.xml 中移除对应配置
3. 重启 WPS

---

## 十、相关资源

- WPS 官方文档：https://open.wps.cn/docs/
- wpsjs NPM：https://www.npmjs.com/package/wpsjs
- 本项目文档：`docs/` 目录

---

## 十一、本项目特殊说明

opencode-wps 加载项的安装流程：

```bash
# 方式 1：一键安装（推荐）
node install-addons.js

# 方式 2：手动安装（分发给用户）
wpsjs publish -s "http://server/path/"
# 然后用户访问 publish.html 安装
```

install-addons.js 会自动完成：
- 插件文件复制
- publish.xml 更新
- jsplugins.xml 更新
- authaddin.json 更新（关键：启用插件）
- MCP 服务器编译
- Skills/Agents 安装

## 十二、WPS 内置浏览器兼容性

### 浏览器版本限制

WPS Office 内置的 Chromium 版本停留在 **Chrome 104**（2022年），这意味着：

| 特性 | 支持情况 |
|------|----------|
| ES6 (let/const, arrow functions) | ⚠️ 引擎支持但项目禁止使用 ES6 语法 |
| ES6+ (async/await, class) | ⚠️ 引擎支持但项目禁止使用 |
| ES2017+ (dynamic import) | ⚠️ 部分支持 |
| Modern APIs (fetch, ES Modules) | ⚠️ 有限支持 |

> **注意**：Chrome 104 引擎层面支持 ES6 语法，但项目经实测发现 WPS 各版本存在兼容性差异，统一要求 ES5 语法。详见 [CODE_REVIEW_GUIDE.md §5.4 红线](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/CODE_REVIEW_GUIDE.md#54-项目专属红线do-not-touch)。

### 代码风格要求

项目有强制要求：WPS 侧**必须使用 ES5 语法**（见 CODE_REVIEW_GUIDE.md §5.4 红线）：

```javascript
// ✅ 正确：ES5 语法（兼容 WPS 内置浏览器）
var API_BASE = 'http://127.0.0.1:14096';
function fetchJSON(method, path, body, onSuccess, onError) { }

// ❌ 禁止：箭头函数（RED LINE — CODE_REVIEW_GUIDE.md §5.4）
const fetchJSON = (method, path) => { };

// ❌ 禁止：async/await（RED LINE — CODE_REVIEW_GUIDE.md §5.4）
async function fetchJSON() { }
```

### 开发规范（强制 RED LINE — CODE_REVIEW_GUIDE.md §5.4）

1. **使用 `var`** 而非 `let/const`
2. **使用 `function`** 而非箭头函数
3. **使用回调** 而非 async/await
4. **必须使用 `XMLHttpRequest`，禁止使用 `fetch`**（WPS Chromium 104 的 fetch Promise 永远 pending）
5. **禁止使用 `ReadableStream`/`TextDecoderStream`**（WPS 104 不完整支持）
6. **避免模板字符串** - 使用字符串拼接

### 原因说明

- WPS 内置浏览器内核较旧（Chrome 104），新语法可能导致解析错误
- callback 模式比 async/await 在旧浏览器中更可靠
- XMLHttpRequest 在 WPS 环境中经过验证，兼容性更好
- `fetch()` 在 WPS 104 中的 Promise 会永远 pending（不 resolve 也不 reject），不能使用
- 关闭"安全沙箱保护"后问题依旧，说明是内核实现缺陷而非安全策略限制
- `ReadableStream`/`TextDecoderStream` 在 WPS 104 中实现不完整，不能使用

### 未来考虑

如果 WPS 升级内置浏览器内核（需 Chrome 110+），可以考虑：
- 迁移到 ES6+ 语法
- 使用 fetch API
- 使用 async/await
- 升级后需在真机上测试
- Launcher 开机自启注册

### 已知不兼容库（2026-06 验证）

以下库/协议在 WPS Chromium 104 环境中已验证不可用：

| 库/协议 | 失败原因 | 现象 |
|---------|---------|------|
| `@opencode-ai/sdk` | 内部使用 `fetch()` + `ReadableStream` + `TextDecoderStream` | Promise 永远 pending，前端卡死 |
| ACP (claudian) 子进程模式 | 需要 `child_process.spawn()`，浏览器无此 API | 不适用 |
| ACP JSON-RPC over stdio | 需要 stdin/stdout 管道，浏览器无此能力 | 不适用 |

**教训**：引入外部库前必须先检查是否依赖 `fetch()`、`ReadableStream`、`child_process` 等 WPS 不支持的 API。详见 `docs/TROUBLESHOOTING.md` 第十一节。
