// opencode-proxy.js
// 轻量反向代理：转发请求到 opencode 服务器，去掉 CSP 头
// WPS 内嵌浏览器对 CSP 处理过严，导致 SPA 无法正常初始化

var http = require('http')
var TARGET_HOST = '127.0.0.1'
var TARGET_PORT = 14096
var PROXY_PORT = 14097

var server = http.createServer(function (clientReq, clientRes) {
    var options = {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: clientReq.url,
        method: clientReq.method,
        headers: Object.assign({}, clientReq.headers, {
            host: TARGET_HOST + ':' + TARGET_PORT
        })
    }

    var proxyReq = http.request(options, function (proxyRes) {
        // 复制响应头，但去掉 CSP
        var headers = {}
        for (var key in proxyRes.headers) {
            if (key.toLowerCase() !== 'content-security-policy') {
                headers[key] = proxyRes.headers[key]
            }
        }
        // 允许所有来源的 CORS
        headers['access-control-allow-origin'] = '*'
        headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        headers['access-control-allow-headers'] = 'Content-Type, x-opencode-directory'

        clientRes.writeHead(proxyRes.statusCode, headers)
        proxyRes.pipe(clientRes, { end: true })
    })

    proxyReq.on('error', function (err) {
        clientRes.writeHead(502)
        clientRes.end('Proxy error: ' + err.message)
    })

    // CORS preflight
    if (clientReq.method === 'OPTIONS') {
        clientRes.writeHead(200, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'access-control-allow-headers': 'Content-Type, x-opencode-directory',
            'access-control-max-age': '86400'
        })
        clientRes.end()
        return
    }

    clientReq.pipe(proxyReq, { end: true })
})

server.listen(PROXY_PORT, TARGET_HOST, function () {
    console.log('[OpenCode Proxy] Listening on http://' + TARGET_HOST + ':' + PROXY_PORT)
    console.log('[OpenCode Proxy] Forwarding to http://' + TARGET_HOST + ':' + TARGET_PORT)
    console.log('[OpenCode Proxy] CSP headers stripped')
})

server.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        console.log('[OpenCode Proxy] Port ' + PROXY_PORT + ' already in use, proxy likely already running')
    } else {
        console.error('[OpenCode Proxy] Error:', err.message)
    }
})
