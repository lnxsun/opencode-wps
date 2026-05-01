# 功能区 CWD 启动器方案

> 将 Start Server 功能从 Setup 页面移植到 WPS 自定义功能区

---

## 需求概述

### 现状
- 用户需要先打开任务窗格，在 Setup 界面选择 CWD 后才能启动服务
- 启动流程较长，需要两步操作

### 目标
- 在 WPS 功能区（Ribbon）添加 OpenCode 按钮组
- 用户可直接在功能区选择 CWD 并启动服务
- 减少操作步骤，提升体验

---

## UI 设计

### 功能区按钮布局

```
┌─────────────────────────────────────────────────────────────┐
│ OpenCode AI                                                 │
├─────────────────────────────────────────────────────────────┤
│ [📁 选择目录] [▶ 打开面板] [🌐 打开Web]    [⏹ 停止服务]     │
└─────────────────────────────────────────────────────────────┘
```

### 按钮说明

| 按钮 | 功能 | 状态 |
|------|------|------|
| 📁 选择目录 | 弹出文件夹选择对话框，选择 CWD | 始终可用 |
| ▶ 打开面板 | 启动服务 + 打开任务窗格 Chat | CWD 已选择时可用 |
| 🌐 打开Web | 启动服务 + 打开浏览器 Web 界面 | CWD 已选择时可用 |
| ⏹ 停止服务 | 停止 OpenCode 服务 | 服务运行中时可用 |

---

## 技术方案

### 1. 修改 ribbon.xml

添加新的按钮组：

```xml
<group id="opencodeLauncher" label="OpenCode 启动器">
  <button id="btnSelectCwd" label="选择目录" imageMso="Folder" onAction="OnSelectCwd" />
  <button id="btnOpenPanel" label="打开面板" imageMso="OpenItem" onAction="OnOpenPanel" enabled="false" />
  <button id="btnOpenWeb" label="打开Web" imageMso="Web" onAction="OnOpenWeb" enabled="false" />
  <separator id="sep1" />
  <button id="btnStopService" label="停止服务" imageMso="Stop" onAction="OnStopService" enabled="false" />
</group>
```

### 2. 修改 main.js

添加 Ribbon 回调函数：

```javascript
// 选择 CWD
function OnSelectCwd(control) {
    // 调用 WPS 文件对话框
    var dialog = WPS.Application.FileDialog(2); // 2 = folder dialog
    dialog.Title = "选择工作目录";
    if (dialog.Show() === -1) return; // -1 = OK

    var selectedPath = dialog.SelectedItems(1);
    if (selectedPath) {
        // 保存 CWD
        setPS('opencode_cwd', selectedPath);
        // 更新按钮状态
        updateLauncherButtons(true);
    }
}

// 打开面板
function OnOpenPanel(control) {
    var cwd = getPS('opencode_cwd');
    if (!cwd) return;

    // 1. 启动服务
    startOpenCodeServer(cwd);

    // 2. 打开任务窗格
    WPS.Application.TaskPanes.Add(WPS.Constants.ctoRight, getScriptPath("taskpane.html"));
}

// 打开 Web
function OnOpenWeb(control) {
    var cwd = getPS('opencode_cwd');
    if (!cwd) return;

    // 1. 启动服务
    startOpenCodeServer(cwd);

    // 2. 打开浏览器
    WPS.Application.ShellExecute("http://127.0.0.1:14096?cwd=" + encodeURIComponent(cwd));
}

// 停止服务
function OnStopService(control) {
    stopOpenCodeServer();
    updateLauncherButtons(false);
}
```

### 3. 按钮状态管理

根据 CWD 是否选择和服务状态更新按钮可用性：

```javascript
function updateLauncherButtons(cwdSelected, serviceRunning) {
    // 获取 ribbon 控件
    var ribbon = WPS.Application.CommandBars("OpenCode AI");

    // 更新按钮状态
    ribbon.Controls("btnOpenPanel").Enabled = cwdSelected;
    ribbon.Controls("btnOpenWeb").Enabled = cwdSelected;
    ribbon.Controls("btnStopService").Enabled = serviceRunning;
}
```

---

## 涉及的修改文件

| 文件 | 修改内容 |
|------|----------|
| `opencode-wps/ribbon.xml` | 添加启动器按钮组 |
| `opencode-wps/main.js` | 添加 Ribbon 回调函数 |
| `opencode-wps/launcher.js` | 可能需要添加启动后回调 |

---

## 实施步骤

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 1 | 修改 ribbon.xml 添加按钮组 | 0.5h |
| 2 | 实现 OnSelectCwd 函数（文件夹选择） | 1h |
| 3 | 实现 OnOpenPanel 函数（启动+打开面板） | 1h |
| 4 | 实现 OnOpenWeb 函数（启动+打开浏览器） | 1h |
| 5 | 实现 OnStopService 函数 | 0.5h |
| 6 | 添加按钮状态管理 | 1h |
| 7 | 测试和调试 | 2h |

**总计**：约 7 小时

---

## 讨论点

1. **文件夹选择方式**：WPS 是否支持原生文件夹对话框？还是需要用其他方式？
2. **服务启动反馈**：启动成功/失败如何反馈给用户？（Toast? 对话框?）
3. **当前 CWD 显示**：功能区是否需要显示当前选择的 CWD 路径？
4. **向后兼容性**：Setup 页面是否保留？用户可以选择使用功能区或 Setup 页面

---

## 待确认事项

请确认以上方案是否符合预期，以及是否有其他需求需要补充。