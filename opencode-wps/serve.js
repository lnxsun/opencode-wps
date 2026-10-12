// Simple static file server for WPS addon development
// Serves test-wps-addon/ on port 3444
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 3444;
var ROOT = __dirname;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

var server = http.createServer(function (req, res) {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // 先 decodeURIComponent：req.url 是原始未解码路径，%2e%2e 等编码
  // 必须先解码成 '..' 才能被 path.join/path.relative 正确识别并拦截
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // 归一化为相对路径后用 path.relative 严格校验：
  // 旧实现用 indexOf(ROOT) 前缀匹配，理论上存在 "C:\root2\x" 绕过 "C:\root" 前缀的边界问题
  var filePath = path.join(ROOT, urlPath);
  var rel = path.relative(ROOT, filePath);
  if (rel.indexOf('..') === 0 || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    var contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('[Addon Server] Running at http://127.0.0.1:' + PORT + '/');
  console.log('[Addon Server] Serving: ' + ROOT);
});
