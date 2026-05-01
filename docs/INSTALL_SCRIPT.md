# install-addons.js 与 wpsjs publish 的关系

## 概述

这两个工具服务于不同的场景：

| 工具 | 用途 | 场景 |
|------|------|------|
| `install-addons.js` | 本地一键安装 | 开发调试、日常使用 |
| `wpsjs publish` | 官方发布工具 | 分发给他人、离线部署 |

---

## install-addons.js（自定义安装脚本）

```bash
node install-addons.js
```

**功能：**
1. 复制插件文件到 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_`
2. 更新 `publish.xml` 和 `jsplugins.xml`（注册插件）
3. 编译 MCP 服务器
4. 安装 Skills 和 Agents
5. 注册 Launcher 开机自启

**特点：**
- 自动化程度高，一键完成
- 适合本地开发和日常使用
- 不需要 HTTP 服务器

---

## wpsjs publish（官方发布工具）

```bash
cd opencode-wps
wpsjs publish -s "http://127.0.0.1:8080/"
```

**功能：**
1. 验证插件结构
2. 生成构建产物到 `wps-addon-build/` 和 `wps-addon-publish/`
3. 提供 HTTP 服务供 WPS 加载插件

**工作流程：**

```
wpsjs publish
    ↓
生成 wps-addon-build/（插件文件）
生成 wps-addon-publish/publish.html（发布页面）
    ↓
启动 HTTP 服务器（端口如 8080）
    ↓
WPS 加载项从 HTTP 地址加载插件
```

**两种模式：**
- **在线模式**：插件部署在 HTTP 服务器上
- **离线模式**：通过 `publish.html` 安装

---

## 关系对比

```
┌─────────────────────────────────────────────────┐
│                开发阶段                           │
├─────────────────────────────────────────────────┤
│  install-addons.js                              │
│  ├── 直接复制到 jsaddons 目录                     │
│  ├── 更新配置文件                                │
│  ├── 编译 MCP                                   │
│  └── 一键完成                                    │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│                分发阶段                           │
├─────────────────────────────────────────────────┤
│  wpsjs publish                                  │
│  ├── 生成标准构建产物                            │
│  ├── 需要 HTTP 服务器                           │
│  └── 可分发给其他用户                            │
└─────────────────────────────────────────────────┘
```

---

## 使用场景

| 场景 | 推荐方式 |
|------|----------|
| 本地开发调试 | `node install-addons.js` |
| 日常使用 | `node install-addons.js` |
| 分发给其他用户 | `wpsjs publish`（需要 HTTP 服务器） |
| 离线部署 | `wpsjs publish` + 离线模式 |

---

## 常见问题

### Q: 两者可以同时使用吗？

**可以，但需要注意：**
1. `wpsjs publish` 会在 `opencode-wps/` 下生成 `wps-addon-build/` 目录
2. 这些构建产物应该添加到 `.gitignore`
3. 本地开发用 `install-addons.js` 即可

### Q: 为什么有了 install-addons.js 还需要 wpsjs publish？

- `install-addons.js` 是**自定义脚本**，适合本地
- `wpsjs publish` 是**官方工具**，生成的构建产物可以分发给其他用户

### Q: install-addons.js 会不会被 wpsjs publish 取代？

**不会**，原因：
1. `wpsjs publish` 需要 HTTP 服务器，不适合本地日常使用
2. `install-addons.js` 额外做了 MCP 编译、Skills/Agents 安装等
3. 两者职责不同，各有用途