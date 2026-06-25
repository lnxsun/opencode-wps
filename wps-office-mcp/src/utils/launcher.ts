import * as http from 'http';

const LAUNCHER_URL = 'http://127.0.0.1:14097';

export function fetchDocInfoFromLauncher(): Promise<{
  name: string;
  path: string;
  type: string;
  paragraphCount?: number;
  wordCount?: number;
} | null> {
  return new Promise(function(resolve) {
    const req = http.get(LAUNCHER_URL + '/docinfo', { timeout: 3000 }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          if (res.statusCode === 200) {
            const obj = JSON.parse(data);
            if (obj && typeof obj.name === 'string' && typeof obj.path === 'string') {
              resolve(obj);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        } catch(e) {
          console.warn('[launcher] fetchDocInfoFromLauncher failed:', e);
          resolve(null);
        }
      });
    });
    req.on('error', function(e) { console.warn('[launcher] fetchDocInfoFromLauncher network error:', e); resolve(null); });
    req.on('timeout', function() { req.destroy(); resolve(null); });
  });
}
