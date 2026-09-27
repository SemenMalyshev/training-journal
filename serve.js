// Local preview helper. GitHub Pages serves the static files directly.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ttf':'font/ttf'};

http.createServer((request,response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = path.resolve(root,`.${pathname === '/' ? '/index.html' : pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file,(error,data) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); return; }
    response.writeHead(200,{'Content-Type':`${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`}).end(data);
  });
}).listen(8000,'127.0.0.1',() => console.log('http://127.0.0.1:8000/'));
