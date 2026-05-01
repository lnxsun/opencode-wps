var http = require('http')
var opts = {
    hostname: '127.0.0.1',
    port: 14096,
    path: '/global/event',
    headers: { 'Accept': 'text/event-stream' }
}
var req = http.get(opts, function(r) {
    console.log('SSE Status:', r.statusCode)
    var buf = ''
    r.on('data', function(c) {
        buf += c.toString()
        var events = buf.split('\n\n')
        buf = events.pop()
        for (var i = 0; i < events.length; i++) {
            var ev = events[i].trim()
            if (!ev) continue
            var lines = ev.split('\n')
            for (var j = 0; j < lines.length; j++) {
                if (lines[j].indexOf('data:') === 0) {
                    var raw = lines[j].substring(5).trim()
                    try {
                        var obj = JSON.parse(raw)
                        var type = obj.payload && obj.payload.type
                        var props = obj.payload && obj.payload.properties
                        console.log('\nEVENT:', type)
                        if (props) {
                            var json = JSON.stringify(props, null, 2)
                            console.log(json.substring(0, 1500))
                        }
                    } catch(e) {}
                }
            }
        }
    })
    setTimeout(function() { req.destroy(); process.exit(0) }, 3000)
})
req.on('error', function(e) { console.log('Error:', e.message) })
