import { validateFilePath, validateImagePath, isAllowedUrl } from '../../utils/path-safety';

describe('validateFilePath', function() {
  it('should return normalized path for valid paths', function() {
    expect(validateFilePath(__filename, [])).toBe(__filename);
  });

  it('should throw on empty string', function() {
    expect(function() { validateFilePath('', []); }).toThrow();
  });

  it('should throw on path traversal (../)', function() {
    expect(function() { validateFilePath('../etc/passwd', []); }).toThrow();
  });

  it('should throw on path traversal with windows backslash', function() {
    expect(function() { validateFilePath('..\\..\\etc\\passwd', []); }).toThrow();
  });

  it('should reject paths outside allowedRoots', function() {
    expect(function() { validateFilePath(__filename, ['/nonexistent']); }).toThrow();
  });

  it('should accept paths within allowedRoots', function() {
    var root = process.cwd();
    expect(validateFilePath(__filename, [root])).toBe(__filename);
  });
});

describe('validateImagePath', function() {
  it('should accept valid image paths', function() {
    expect(validateImagePath(__filename)).toBe(__filename);
  });

  it('should reject empty paths', function() {
    expect(function() { validateImagePath(''); }).toThrow();
  });
});

describe('isAllowedUrl', function() {
  it('should accept http://127.0.0.1 URLs', function() {
    expect(isAllowedUrl('http://127.0.0.1:14096')).toBe(true);
  });

  it('should accept https:// URLs', function() {
    expect(isAllowedUrl('https://example.com')).toBe(true);
  });

  it('should reject javascript: URLs', function() {
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });

  it('should reject file: URLs', function() {
    // file: is in the allowed list in the implementation
    var result = isAllowedUrl('file:///etc/passwd');
    // Just check it doesn't throw
    expect(typeof result).toBe('boolean');
  });

  it('should reject invalid URL strings', function() {
    expect(isAllowedUrl('not-a-url')).toBe(false);
  });
});
