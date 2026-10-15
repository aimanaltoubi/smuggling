const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const localLlm = require('./localLlm.cjs');

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ktx2': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let localServer;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((request, response) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      } catch {
        response.writeHead(400).end('Bad request');
        return;
      }

      if (pathname === '/api/llm/status' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(localLlm.getStatus()));
        return;
      }

      if (pathname === '/api/llm/explain' && request.method === 'POST') {
        const appPort = localServer.address()?.port;
        const allowedOrigin = `http://127.0.0.1:${appPort}`;
        if (request.headers.origin !== allowedOrigin) {
          response.writeHead(403).end('Forbidden');
          return;
        }

        const chunks = [];
        let bodySize = 0;
        request.on('data', chunk => {
          bodySize += chunk.length;
          if (bodySize > 32768) request.destroy();
          else chunks.push(chunk);
        });
        request.on('end', async () => {
          if (bodySize > 32768) return;
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const text = await localLlm.explain(body.facts);
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ text }));
          } catch (error) {
            response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ error: error.message || 'Local explanation unavailable.' }));
          }
        });
        return;
      }

      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(DIST_DIR, relativePath);
      if (!filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      fs.stat(filePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
          response.writeHead(404).end('Not found');
          return;
        }

        response.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        });
        fs.createReadStream(filePath).pipe(response);
      });
    });

    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => resolve(localServer.address().port));
  });
}

async function createWindow() {
  await localLlm.start(app);
  const port = await startLocalServer();
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow).catch(error => {
  console.error('Could not start the offline app:', error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  localLlm.stop();
  localServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});