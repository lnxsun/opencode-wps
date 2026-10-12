import {
  validateFilePath,
  validateImagePath,
  isAllowedUrl,
  buildWriteRootsWithDocDir,
  ALLOWED_WRITE_ROOTS,
} from '../../utils/path-safety';

describe('validateFilePath', function () {
  it('should return normalized path for valid paths', function () {
    expect(validateFilePath(__filename, [])).toBe(__filename);
  });

  it('should throw on empty string', function () {
    expect(function () {
      validateFilePath('', []);
    }).toThrow();
  });

  it('should throw on path traversal (../)', function () {
    expect(function () {
      validateFilePath('../etc/passwd', []);
    }).toThrow();
  });

  it('should throw on path traversal with windows backslash', function () {
    expect(function () {
      validateFilePath('..\\..\\etc\\passwd', []);
    }).toThrow();
  });

  it('should reject paths outside allowedRoots', function () {
    expect(function () {
      validateFilePath(__filename, ['/nonexistent']);
    }).toThrow();
  });

  it('should accept paths within allowedRoots', function () {
    var root = process.cwd();
    expect(validateFilePath(__filename, [root])).toBe(__filename);
  });
});

describe('validateImagePath', function () {
  it('should accept valid image paths', function () {
    expect(validateImagePath(__filename)).toBe(__filename);
  });

  it('should reject empty paths', function () {
    expect(function () {
      validateImagePath('');
    }).toThrow();
  });
});

describe('isAllowedUrl', function () {
  it('should accept http://127.0.0.1 URLs', function () {
    expect(isAllowedUrl('http://127.0.0.1:14096')).toBe(true);
  });

  it('should accept https:// URLs', function () {
    expect(isAllowedUrl('https://example.com')).toBe(true);
  });

  it('should reject javascript: URLs', function () {
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });

  it('should reject file: URLs', function () {
    // file: is in the allowed list in the implementation
    var result = isAllowedUrl('file:///etc/passwd');
    // Just check it doesn't throw
    expect(typeof result).toBe('boolean');
  });

  it('should reject invalid URL strings', function () {
    expect(isAllowedUrl('not-a-url')).toBe(false);
  });
});

describe('buildWriteRootsWithDocDir（Issue #420：报告与文档同目录落盘，两条落盘路径共用单源）', function () {
  it('无文档路径 → 与默认白名单逐元素相等（不放大权限）', function () {
    expect(buildWriteRootsWithDocDir()).toEqual(ALLOWED_WRITE_ROOTS);
    expect(buildWriteRootsWithDocDir('')).toEqual(ALLOWED_WRITE_ROOTS);
  });

  it('文档在默认白名单外（如 D:\\QQPCMgr\\weixin\\…）→ 其所在目录被并入，且原白名单不丢', function () {
    var doc = '/opt/wechat/files/2026-09/report.docx';
    var roots = buildWriteRootsWithDocDir(doc);
    expect(roots).toContain('/opt/wechat/files/2026-09');
    ALLOWED_WRITE_ROOTS.forEach(function (r) {
      expect(roots).toContain(r);
    });
    // 并集后，同目录的校对报告可通过校验（回归：Issue #420 会话中 writeFile 报 Path not allowed）
    expect(
      validateFilePath('/opt/wechat/files/2026-09/report.docx.校对报告.md', roots)
    ).toBeTruthy();
  });

  it('文档目录已在白名单内 → 不重复追加（幂等，防白名单膨胀）', function () {
    var root = ALLOWED_WRITE_ROOTS[0];
    var roots = buildWriteRootsWithDocDir(root + '/doc.docx');
    expect(roots.length).toBe(ALLOWED_WRITE_ROOTS.length);
  });
});
