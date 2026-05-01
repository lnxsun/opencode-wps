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

---

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
- Launcher 开机自启注册