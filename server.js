#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { KnowledgeBase } = require('./js/core/knowledge.js');

const ROOT = __dirname;
const KB_FILE = process.env.ATLAS_FILE || path.join(ROOT, 'conocimiento.json');
const PORT = process.env.ATLAS_PORT || 4747;

const kb = new KnowledgeBase();
if (fs.existsSync(KB_FILE)) {
  try { kb.fromJSON(fs.readFileSync(KB_FILE, 'utf8')); } catch (e) { /* limpio */ }
}
function save() {
  fs.writeFileSync(KB_FILE, kb.toJSON());
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function sendJson(res, obj) { send(res, 200, JSON.stringify(obj)); }
function sendError(res, code, msg) { send(res, code, JSON.stringify({ error: msg })); }

function parseQuery(url) {
  const q = (url.split('?')[1] || '');
  const out = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [], size = 0;
    req.on('data', c => { chunks.push(c); size += c.length; if (size > 2e6) { req.destroy(); resolve(null); } });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendError(res, 404, 'no encontrado'); return; }
    send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (req.method === 'GET' && urlPath === '/') return serveStatic(res, path.join(ROOT, 'index.html'));
  if (req.method === 'GET' && urlPath === '/js/web.js') return serveStatic(res, path.join(ROOT, 'js', 'web.js'));

  if (req.method === 'GET' && urlPath === '/api/index') {
    return sendJson(res, {
      stats: kb.stats(),
      top: kb.concepts(40),
      sources: kb.sources()
    });
  }
  if (req.method === 'GET' && urlPath === '/api/article') {
    const term = parseQuery(req.url).term;
    if (!term) return sendError(res, 400, 'falta term');
    const a = kb.article(term);
    return a ? sendJson(res, a) : sendError(res, 404, 'sin artículo');
  }
  if (req.method === 'GET' && urlPath === '/api/search') {
    const q = parseQuery(req.url);
    if (!q.q) return sendError(res, 400, 'falta q');
    return sendJson(res, kb.search(q.q, +(q.n || 6)));
  }
  if (req.method === 'GET' && urlPath === '/api/graph') {
    const n = +(parseQuery(req.url).n || 35);
    return sendJson(res, kb.graph(n));
  }
  if (req.method === 'POST' && urlPath === '/api/ingest') {
    const body = await readBody(req);
    if (!body) return sendError(res, 400, 'cuerpo vacío');
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { return sendError(res, 400, 'json inválido'); }
    if (!parsed.text || parsed.text.length < 10) return sendError(res, 400, 'texto demasiado corto');
    const doc = kb.addText(parsed.text, parsed.source || 'nota manual');
    save();
    return sendJson(res, { added: true, doc: { id: doc.id }, stats: kb.stats() });
  }

  sendError(res, 404, 'ruta desconocida');
});

server.listen(PORT, () => {
  console.log('ATLAS — enciclopedia personal');
  console.log('   Conocimiento: ' + KB_FILE);
  console.log('   Abre:         http://localhost:' + PORT);
});