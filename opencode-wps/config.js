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
        version: '1.1.0',
        // 用户主目录（安装时由 install-addons.js 注入，WPS 浏览器上下文有额外 fallback）
        userHome: (function() {
            var v = '__OPCODE_WPS_USER_HOME__';
            // 使用不含双下划线的 sentinel 做比较，避免 install-addons.js 的 regex 误替换
            if (v.indexOf('OPCODE_WPS_USER_HOME') < 0) return v;
            if (typeof process !== 'undefined' && process.env) return process.env.USERPROFILE || process.env.HOME || '';
            // WPS 浏览器上下文：尝试从 PluginStorage 恢复上次 CWD
            try {
                if (typeof window !== 'undefined' && window.Application && window.Application.PluginStorage) {
                    var saved = window.Application.PluginStorage.getItem('opencode_cwd');
                    if (saved) return saved;
                }
                // 从 addon 路径提取用户主目录
                // Windows:  file:///C:/Users/xxx/AppData/...
                // Mac:      file:///Users/xxx/Library/Containers/...
                if (typeof window !== 'undefined' && window.location && window.location.href) {
                    var url = window.location.href;
                    if (url.indexOf('file:///') === 0) {
                        var path = url.substring(8);
                        var sep = path.indexOf('/');
                        if (sep > 0) {
                            var first = path.substring(0, sep);
                            var rest = path.substring(sep + 1);
                            var parts = rest.split('/');
                            if (first.toLowerCase() === 'users' && parts.length >= 1) {
                                // Mac: path = Users/xxx/... → /Users/xxx
                                return '/Users/' + parts[0];
                            } else if (parts.length >= 2 && parts[0].toLowerCase() === 'users') {
                                // Windows: path = C:/Users/xxx/... → C:\Users\xxx
                                return first + '\\Users\\' + parts[1];
                            }
                        }
                    }
                }
            } catch(e) {}
            return '';
        })(),
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
    },

    // 回退模型配置（当 OpenCode 服务器未返回 provider 列表时使用）
    fallbackModels: {
        ollama: [
            { id: 'ollama/Monica:latest', name: 'Monica', providerID: 'ollama' },
            { id: 'ollama/R4C3R/minicpm5-1b-heretic:latest', name: 'MiniCPM5 1B Heretic', providerID: 'ollama' },
            { id: 'ollama/huihui_ai/qwen3.5-abliterated:9b-Qwopus', name: 'Qwen3.5 9B Abliterated', providerID: 'ollama' },
            { id: 'ollama/gemma4:e4b', name: 'Gemma 4 4B', providerID: 'ollama' },
            { id: 'ollama/gemma4:e2b', name: 'Gemma 4 2B', providerID: 'ollama' },
            { id: 'ollama/qwen3.5-32k:0.8b', name: 'Qwen3.5 32K 0.8B', providerID: 'ollama' },
            { id: 'ollama/qwen3.5-32k:2b', name: 'Qwen3.5 32K 2B', providerID: 'ollama' },
            { id: 'ollama/qwen3.5:2b', name: 'Qwen3.5 2B', providerID: 'ollama' },
            { id: 'ollama/qwen3.5:0.8b', name: 'Qwen3.5 0.8B', providerID: 'ollama' },
            { id: 'ollama/qianwen:latest', name: 'Qianwen', providerID: 'ollama' },
            { id: 'ollama/lukey03/qwen3.5-9b-abliterated:latest', name: 'Qwen3.5 9B Abliterated', providerID: 'ollama' },
            { id: 'ollama/qwen3.5:4b', name: 'Qwen3.5 4B', providerID: 'ollama' }
        ],
        opencode: [
            { id: 'opencode/deepseek-v4-flash-free', name: 'DeepSeek V4 Flash Free', providerID: 'opencode', free: true }
        ]
    }
};

// 导出（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}