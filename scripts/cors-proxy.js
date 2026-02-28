/**
 * 開発用 CORS プロキシ（Functions エミュレータ用）
 * ブラウザから localhost:8081 または 携帯で http://<PCのIP>:8081 の呼び出しが
 * CORS でブロックされるため、このプロキシ（5052）を経由して CORS ヘッダーを付与します。
 * プロキシは Functions エミュレータ（5001）へ転送します。
 *
 * 使い方:
 * 1. firebase emulators（functions, firestore, auth）を起動
 * 2. このプロキシを別ターミナルで起動: npm run cors-proxy
 * 3. PC: http://localhost:8081 で開く
 * 4. 携帯のウェブ: 同じWi-Fiで http://<PCのIP>:8081 で開く（PCのIPは ipconfig で確認）
 */
const http = require('http');

const TARGET_PORT = 5001;
const PROXY_PORT = 5052;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'X-CORS-Proxy': '1', // このヘッダーがあればプロキシ経由のレスポンス（CORS は単一のみ）
};

const server = http.createServer((clientReq, clientRes) => {
  const url = clientReq.url || '/';
  const isOptions = clientReq.method === 'OPTIONS';

  if (isOptions) {
    clientRes.writeHead(204, CORS_HEADERS);
    clientRes.end();
    return;
  }

  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: url,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: `127.0.0.1:${TARGET_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // アップストリームの CORS 系ヘッダーは一切使わず、Content-Type とこちらで定義した CORS のみ送る
    const contentType = proxyRes.headers['content-type'] || 'application/json';
    clientRes.setHeader('Content-Type', contentType);
    clientRes.setHeader('Access-Control-Allow-Origin', '*');
    clientRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    clientRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    clientRes.setHeader('Access-Control-Max-Age', '86400');
    clientRes.setHeader('X-CORS-Proxy', '1');
    clientRes.writeHead(proxyRes.statusCode || 200);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error('[cors-proxy] Error:', err.message);
    clientRes.writeHead(502, { 'Content-Type': 'text/plain', ...CORS_HEADERS });
    clientRes.end('Bad Gateway: ' + err.message);
  });

  clientReq.pipe(proxyReq);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[cors-proxy] Listening on http://0.0.0.0:${PROXY_PORT} -> http://127.0.0.1:${TARGET_PORT}`);
  console.log('[cors-proxy] Access-Control-Allow-Origin は * のみ送信（二重にならない版）');
  console.log('[cors-proxy] PCで CORS エラーが出る場合: このプロキシを一度終了し、もう一度 npm run cors-proxy を実行してください。');
});
