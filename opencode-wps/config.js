/**
 * OpenCode WPS 配置文件
 * 2026-05-01 根据 DeepSeek review 建议提取硬编码配置
 *
 * 使用方式：
 * - 后端 (launcher.js): 通过 Node.js require 引入
 * - 前端 (taskpane.html): 通过 <script src="config.js"> 引入
 */

var CONFIG = {
    // OpenCode 服务配置
    opencode: {
        // 服务端口
        port: 14096,
        // 服务主机
        host: '127.0.0.1',
        // API 基础地址
        get apiBase() { return 'http://' + this.host + ':' + this.port; }
    },

    // Launcher 服务配置
    launcher: {
        // Launcher 端口
        port: 14097,
        // Launcher 主机
        host: '127.0.0.1',
        // API 基础地址
        get apiBase() { return 'http://' + this.host + ':' + this.port; }
    },

    // WPS 插件配置
    plugin: {
        // 功能区 ID
        ribbonId: 'opencode-wps',
        // 加载项名称
        addonName: 'OpenCode AI',
        // 插件版本
        version: '1.1.0'
    },

    // 会话配置
    session: {
        // 默认 agent
        defaultAgent: 'wps-expert',
        // 最大历史消息数
        maxHistory: 100,
        // 最大消息长度
        maxMessageLength: 10000
    },

    // 网络配置
    network: {
        // 请求超时（毫秒）
        timeout: 30000,
        // 大文件上传超时（毫秒）
        uploadTimeout: 300000,
        // 最大重试次数
        maxRetries: 3,
        // SSE 重连延迟（毫秒）
        sseReconnectDelay: 3000
    }
};

// 导出（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}