// Local preview only: `node server.js`, then open http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(__dirname + path.sep) || !type) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(data);
  });
}).listen(PORT, () => console.log(`Foxdusk running at http://localhost:${PORT}`));
