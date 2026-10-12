/**
 * Input: WPS 指令与HTTP请求
 * Output: 轮询执行结果
 * Pos: Linux 轮询服务器实现（复用 MacPollServer 类，仅注入 Linux 切换脚本）。
 * Linux 轮询服务器 - 复用 Mac 轮询架构
 *
 * Linux 版 WPS 加载项与 Mac 一样运行在沙箱内，无法启动 HTTP 服务端，
 * 因此直接复用 MacPollServer 的轮询协议：
 * - MCP Server 作为HTTP服务端（端口58891）
 * - WPS加载项 作为HTTP客户端轮询获取命令
 *
 * 与 Mac 的唯一差异：应用切换脚本指向 opencode-wps-linux/wps-auto.sh。
 */

import MacPollServer from './mac-poll-server';
import * as path from 'path';

// Linux 版应用切换脚本路径 - 在 opencode-wps-linux 目录下
const LINUX_SWITCH_SCRIPT = path.join(__dirname, '../../../opencode-wps-linux/wps-auto.sh');

/**
 * Linux 轮询服务器单例
 * 复用 MacPollServer 的完整轮询逻辑（/poll、/result、命令分发表、超时管理），
 * 仅注入 Linux 的 wps-auto.sh 路径。
 */
export const linuxPollServer = new MacPollServer(LINUX_SWITCH_SCRIPT);

export default linuxPollServer;
