import * as path from 'path';
import * as os from 'os';

const PATH_TRAVERSAL_REGEX = /\.\.(\/|\\)/;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];
const DOS_DEVICE_PATH_REGEX = /^\\\\[.?]\\/;

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
  
  // Check DOS device paths (\\.\COM1, \\?\C:\...)
  if (DOS_DEVICE_PATH_REGEX.test(filePath)) {
    throw new Error('DOS device paths are not allowed: ' + filePath);
  }
  
  // Check NTFS alternate data streams (file:stream) — 排除驱动器盘符 C:
  const colonIdx = normalized.indexOf(':');
  if (colonIdx >= 0 && colonIdx !== 1) {
    throw new Error('NTFS alternate data streams are not allowed: ' + filePath);
  }
  
  // Check allowed roots
  if (allowedRoots && allowedRoots.length > 0) {
    const allowed = allowedRoots.some(function(root) {
      var resolvedRoot = path.resolve(root);
      return normalized === resolvedRoot || normalized.startsWith(resolvedRoot + path.sep);
    });
    if (!allowed) {
      throw new Error('Path not allowed: ' + filePath);
    }
  }
  
  return normalized;
}

export function validateImagePath(imagePath: string): string {
  return validateFilePath(imagePath, []);
}

export function isAllowedUrl(url: string): boolean {
  try {
    var parsed = new URL(url);
    return ALLOWED_PROTOCOLS.indexOf(parsed.protocol) >= 0;
  } catch(e) {
    return false;
  }
}
