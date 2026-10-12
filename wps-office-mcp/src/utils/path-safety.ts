import * as path from 'path';
import * as os from 'os';

const IS_WIN = process.platform === 'win32';
const PATH_TRAVERSAL_REGEX = /\.\.(\/|\\)/;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];
const DOS_DEVICE_PATH_REGEX = IS_WIN ? /^\\\\[.?]\\/ : /(?!)/;

/**
 * 写操作允许的根目录白名单。
 * - 默认：用户主目录 + 系统临时目录
 * - 可通过环境变量 OPCODE_ALLOWED_ROOTS 覆盖（多路径用 ; 分隔，如 C:\work;D:\docs）
 * - 空数组 = 不限制（仅路径穿越检测）
 */
export const ALLOWED_WRITE_ROOTS: string[] = process.env.OPCODE_ALLOWED_ROOTS
  ? process.env.OPCODE_ALLOWED_ROOTS.split(path.delimiter).filter(Boolean)
  : [os.homedir(), os.tmpdir()].filter(Boolean);

/**
 * 校验文件路径合法性。
 * - 拒绝空路径
 * - 拒绝路径穿越（..）
 * - 拒绝 DOS 设备路径（\\.\COM1）
 * - 拒绝 NTFS 备用数据流（file:stream）
 * - 可选白名单校验（allowedRoots）
 * @param filePath - 待校验的文件路径
 * @param allowedRoots - 允许的根目录白名单
 * @returns 规范化后的安全路径
 * @throws 路径不合法时抛出
 */
export function validateFilePath(filePath: string, allowedRoots: string[]): string {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('filePath must be a non-empty string');
  }
  const normalized = path.resolve(filePath);

  // Check path traversal
  if (PATH_TRAVERSAL_REGEX.test(filePath) || PATH_TRAVERSAL_REGEX.test(normalized)) {
    throw new Error('Path traversal detected: ' + filePath);
  }

  // Check DOS device paths (Windows only: \\.\COM1, \\?\C:\...)
  if (IS_WIN && DOS_DEVICE_PATH_REGEX.test(filePath)) {
    throw new Error('DOS device paths are not allowed: ' + filePath);
  }

  // Check NTFS alternate data streams (Windows only: file:stream)
  if (IS_WIN) {
    const colonIdx = normalized.indexOf(':');
    if (colonIdx >= 0 && colonIdx !== 1) {
      throw new Error('NTFS alternate data streams are not allowed: ' + filePath);
    }
  }

  // Check allowed roots
  if (allowedRoots && allowedRoots.length > 0) {
    const allowed = allowedRoots.some(function (root) {
      var resolvedRoot = path.resolve(root);
      return normalized === resolvedRoot || normalized.startsWith(resolvedRoot + path.sep);
    });
    if (!allowed) {
      throw new Error('Path not allowed: ' + filePath);
    }
  }

  return normalized;
}

/**
 * 扩展写白名单：并入**当前文档所在目录**（Issue #179 方案 B 的唯一实现）。
 *
 * 为什么需要（Issue #420 会话实证）：文档常位于 `D:\QQPCMgr\weixin\…` 这类**用户自选目录**，
 * 不在默认白名单（主目录 + 临时目录）内 ⇒ 「报告与文档同目录落盘」恒被 `Path not allowed` 拦。
 * 该扩展原先只在 `generateProofreadReport` 传 `output_file` 时生效 ⇒ 走 SKILL 方案 B
 * （不传 output_file、由 AI 用 `write_file` 落盘）时白名单未扩展，落盘必失败。
 * 现抽为**单一实现**，两条落盘路径共用（同一语义不写两遍）。
 *
 * 自限：仅并入**文档所在目录本身**（不递归子树、不接受调用方传入的任意目录）；
 * 文档路径缺失/解析失败时退回原白名单（不放大权限）。
 */
export function buildWriteRootsWithDocDir(docFilePath?: string): string[] {
  const roots = [...ALLOWED_WRITE_ROOTS];
  if (!docFilePath) return roots;
  try {
    const dir = path.dirname(path.resolve(docFilePath));
    if (dir && dir !== '.' && roots.indexOf(dir) === -1) roots.push(dir);
  } catch {
    /* 解析失败沿用既有白名单 */
  }
  return roots;
}

export function validateImagePath(imagePath: string): string {
  return validateFilePath(imagePath, []);
}

export function isAllowedUrl(url: string): boolean {
  try {
    var parsed = new URL(url);
    return ALLOWED_PROTOCOLS.indexOf(parsed.protocol) >= 0;
  } catch (e) {
    return false;
  }
}
