// Simple static file server for WPS addon development
// Serves test-wps-addon/ on port 3444
var http = require('http')
var fs = require('fs')
var path = require('path')

var PORT = 3444
var ROOT = __dirname

var MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
}

var server = http.createServer(function (req, res) {
    var urlPath = req.url.split('?')[0]
    if (urlPath === '/') urlPath = '/index.html'

    var filePath = path.join(ROOT, urlPath)

    // Security: prevent path traversal
    if (filePath.indexOf(ROOT) !== 0) {
        res.writeHead(403)
        res.end('Forbidden')
        return
    }

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404)
            res.end('Not found: ' + urlPath)
            return
        }
        var ext = path.extname(filePath).toLowerCase()
        var contentType = MIME[ext] || 'application/octet-stream'
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        })
        res.end(data)
    })
})

server.listen(PORT, '127.0.0.1', function () {
    console.log('[Addon Server] Running at http://127.0.0.1:' + PORT + '/')
    console.log('[Addon Server] Serving: ' + ROOT)
})
