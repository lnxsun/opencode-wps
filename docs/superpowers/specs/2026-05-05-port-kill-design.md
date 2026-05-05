# 按端口精确停止 OpenCode 服务设计

**日期**: 2026-05-05  
**状态**: 已完成  
**标签**: bugfix

## 问题背景

WPS 插件点击"停止服务"按钮时，会终止系统上所有名为 `opencode.exe` 的进程，而不是只停止当前 WPS 插件启动的服务。

### 影响

- 用户同时使用其他 OpenCode 实例（如 CLI、VS Code 插件等）会被意外终止
- 可能导致未保存的工作丢失

## 失败方案

| 方案 | 说明 | 失败原因 |
|------|------|---------|
| 按进程名全杀 | `taskkill /IM opencode.exe /F /T` | 会杀掉所有同名进程 |
| 读取 PID 文件 | 读取 opencode.pid 然后 kill | WPS 环境下文件访问受限 |
| 通过 API 停止 | 调用 OpenCode shutdown API | OpenCode 没有可靠的停止接口 |
| 查找窗口标题 | 通过窗口标题找进程 | 命令行窗口可能被隐藏 |

## 最终方案

### 设计思路

1. 使用 `stopOpenCodeByPort(14096)` 函数（已存在）
2. 通过 `netstat -ano | findstr :14096` 查找占用端口的进程
3. 只杀 LISTENING 状态的进程

### 代码修改

```javascript
// 删除全杀命令
// execSync('taskkill /IM opencode.exe /F /T', ...)

// 改为按端口精确停止
stopOpenCodeByPort(14096);
```

## 修改文件

- `opencode-wps/launcher.js` - 改用按端口停止，删除全杀代码
- `opencode-wps/stop-opencode.vbs` - 删除（已废弃）
- `docs/TROUBLESHOOTING.md` - 更新文档
- `README.md` - 添加更新说明

## 测试验证

- [x] 只启动一个 opencode 服务，点击停止，只杀掉目标进程
- [x] 同时运行多个 opencode 进程，点击停止，只杀掉 14096 端口对应的进程
- [x] 没有 opencode 服务运行时，点击停止，不报错