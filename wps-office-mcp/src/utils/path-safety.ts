import * as path from 'path';

const PATH_TRAVERSAL_REGEX = /\.\.(\/|\\)/;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];

export function validateFilePath(filePath: string, allowedRoots: string[]): string {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('filePath must be a non-empty string');
  }
  const normalized = path.resolve(filePath);
  
  // Check path traversal
  if (PATH_TRAVERSAL_REGEX.test(filePath) || PATH_TRAVERSAL_REGEX.test(normalized)) {
    throw new Error('Path traversal detected: ' + filePath);
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
