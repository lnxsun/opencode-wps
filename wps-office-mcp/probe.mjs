import { spawn } from 'node:child_process';

const c = spawn('node', ['dist/index.js'], { stdio: ['pipe','pipe','pipe'] });
let buf = '';
c.stdout.on('data', d => {
  buf += d.toString();
  // MCP 用 \n 分隔 JSON-RPC 帧，直接按帧解析最可靠
  for (const line of buf.split('\n')) {
    if (line.trim().startsWith('{')) {
      try {
        const msg = JSON.parse(line);
        if (msg?.result?.tools) {
          console.log('TOOLS COUNT:', msg.result.tools.length);
          console.log('NAMES:', msg.result.tools.map(t => t.name).join(', '));
          c.kill();
          process.exit(0);
        }
      } catch { /* 半帧不完整，继续攒 */ }
    }
  }
});
c.stdin.write(JSON.stringify({ jsonrpc:'2.0', id:1, method:'tools/list', params:{} }) + '\n');
setTimeout(() => { console.log('NO RESPONSE'); c.kill(); }, 5000);
