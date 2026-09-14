#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { KnowledgeBase } = require('./js/core/knowledge.js');

const KB_FILE = process.env.ATLAS_FILE || path.join(__dirname, 'conocimiento.json');

const kb = new KnowledgeBase();
if (fs.existsSync(KB_FILE)) {
  try { kb.fromJSON(fs.readFileSync(KB_FILE, 'utf8')); } catch (e) { /* archivo corrupto: empezar limpio */ }
}

function save() {
  fs.writeFileSync(KB_FILE, kb.toJSON());
}

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m'
};

function fmtDate(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
}

function usage() {
  console.log('');
  console.log('ATLAS — enciclopedia personal que crece sola');
  console.log('Extrae conceptos de tus textos, los enlaza y genera artículos.');
  console.log('');
  console.log('  atlas ingerir <archivo|carpeta> [--fuente nombre]   añade conocimiento');
  console.log('  atlas articulo <concepto>                          muestra un artículo');
  console.log('  atlas buscar <consulta> [n]                        busca conceptos y fragmentos');
  console.log('  atlas conceptos [n]                                los conceptos más salientes');
  console.log('  atlas relacionados <concepto>                      vecinos en el grafo');
  console.log('  atlas grafo [n]                                    grafo de conceptos (JSON)');
  console.log('  atlas fuentes                                     lista de fuentes');
  console.log('  atlas estado                                     estadísticas');
  console.log('  atlas exportar <archivo.json> / atlas importar <archivo.json>');
  console.log('  atlas limpiar                                     vacía el conocimiento');
  console.log('');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'ingerir': return doIngerir(rest);
    case 'articulo': return doArticulo(rest);
    case 'buscar': return doBuscar(rest);
    case 'conceptos': return doConceptos(rest);
    case 'relacionados': return doRelacionados(rest);
    case 'grafo': return doGrafo(rest);
    case 'fuentes': return doFuentes();
    case 'estado': return doEstado();
    case 'exportar': return doExport(rest);
    case 'importar': return doImport(rest);
    case 'limpiar':
      kb.clear(); save();
      console.log('✓ conocimiento vaciado');
      return 0;
    default:
      usage();
      return 1;
  }
}

function doIngerir(rest) {
  const target = rest[0];
  if (!target) { usage(); return 1; }
  const fi = rest.indexOf('--fuente');
  const forceSource = fi !== -1 && rest[fi + 1] ? rest[fi + 1] : null;
  if (!fs.existsSync(target)) { console.error(C.red + '✗ no existe: ' + target + C.reset); return 1; }

  let files = [];
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    files = fs.readdirSync(target)
      .filter(f => /\.(txt|md|markdown)$/i.test(f))
      .map(f => path.join(target, f));
  } else {
    files = [target];
  }
  if (!files.length) { console.log(C.dim + 'no hay .txt/.md en la carpeta' + C.reset); return 0; }

  let added = 0, deleted = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const before = kb.stats().docs;
    const source = forceSource || path.basename(f);
    kb.addText(text, source);
    save();
    if (kb.stats().docs > before) { added++; console.log(C.green + '  ✓ ' + C.reset + source); }
  }
  const s = kb.stats();
  console.log(C.green + '\n✓ ingerido (' + added + ' textos)' + C.reset);
  console.log('   conceptos: ' + s.concepts + '  ·  términos: ' + s.terms + '  ·  fuentes: ' + s.sources);
  return 0;
}

function doArticulo(rest) {
  const term = rest[0];
  if (!term) { usage(); return 1; }
  const a = kb.article(term);
  if (!a) { console.log(C.dim + 'no hay artículo para "' + term + '"' + C.reset); return 0; }

  console.log(C.bold + a.title + C.reset + '  ' + C.dim + '(' + a.term + ')' + C.reset);
  console.log('   ' + C.cyan + 'consenso ' + a.consensus + (a.consensus === 1 ? ' fuente' : ' fuentes') +
    '  ·  confianza ' + Math.round(a.confidence * 100) + '%' + C.reset +
    '  ·  ' + C.dim + a.freq + ' menciones en ' + a.df + ' textos' + C.reset);
  console.log('');
  if (a.definition) console.log(C.bold + 'Definición: ' + C.reset + a.definition);
  console.log('');
  if (a.paragraphs.length) {
    console.log(C.dim + 'Contexto:' + C.reset);
    for (const p of a.paragraphs.slice(0, 5)) {
      console.log('   · ' + p.sentence + C.dim + '  [' + p.source + ']' + C.reset);
    }
  }
  if (a.related.length) {
    console.log(C.dim + '\nRelacionado con: ' + a.related.map(r => r.title).join(' · ') + C.reset);
  }
  if (a.backlinks.length) {
    console.log(C.dim + 'Mencionado por:  ' + a.backlinks.map(b => b.title).join(' · ') + C.reset);
  }
  return 0;
}

function doBuscar(rest) {
  const q = rest[0], n = +(rest[1] || 5);
  if (!q) { usage(); return 1; }
  const r = kb.search(q, n);
  console.log(C.bold + '«' + r.query + '»' + C.reset + C.dim + '  — ' +
    r.concepts.length + ' conceptos · ' + r.docs.length + ' fragmentos' + C.reset);
  if (r.concepts.length) {
    console.log(C.dim + 'Conceptos:' + C.reset);
    for (const c of r.concepts) {
      console.log('   ' + C.cyan + c.title + C.reset + '  ·  saliencia ' + c.score.toFixed(0));
    }
  }
  if (r.docs.length) {
    console.log(C.dim + 'Fragmentos:' + C.reset);
    for (const d of r.docs) {
      console.log('   ' + C.green + '[' + d.source + ']' + C.reset + ' ' + (d.sentence || '').slice(0, 160));
    }
  }
  return 0;
}

function doConceptos(rest) {
  const n = +(rest[0] || 20);
  const cs = kb.concepts(n);
  if (!cs.length) { console.log(C.dim + 'conocimiento vacío' + C.reset); return 0; }
  const max = Math.max.apply(null, cs.map(c => c.salience));
  console.log(C.bold + 'CONCEPTOS MÁS SALIENTES' + C.reset);
  for (const c of cs) {
    const bar = '█'.repeat(Math.max(1, Math.round((c.salience / max) * 18)));
    console.log('   ' + C.cyan + c.title.padEnd(22) + C.reset + bar + '  ' +
      C.dim + c.df + ' fuentes · ' + c.freq + ' menciones' + C.reset);
  }
  return 0;
}

function doRelacionados(rest) {
  const term = rest[0];
  if (!term) { usage(); return 1; }
  const a = kb.article(term);
  if (!a) { console.log(C.dim + 'no existe "' + term + '"' + C.reset); return 0; }
  console.log(C.bold + a.title + C.reset + ' → ');
  for (const r of a.related) {
    console.log('   ' + C.cyan + r.title.padEnd(22) + C.reset + ' peso ' + r.weight.toFixed(1) + ' · ' + r.docs + ' docs');
  }
  return 0;
}

function doGrafo(rest) {
  const n = +(rest[0] || 30);
  console.log(JSON.stringify(kb.graph(n), null, 1));
  return 0;
}

function doFuentes() {
  const src = kb.sources();
  if (!src.length) { console.log(C.dim + 'sin fuentes' + C.reset); return 0; }
  console.log(C.bold + 'FUENTES (' + src.length + ')' + C.reset);
  for (const s of src) console.log('   · ' + s);
  return 0;
}

function doEstado() {
  const s = kb.stats();
  console.log('   Textos:      ' + s.docs);
  console.log('   Conceptos:   ' + s.concepts);
  console.log('   Términos:    ' + s.terms);
  console.log('   Fuentes:     ' + s.sources);
  console.log('   Archivo:     ' + KB_FILE);
  return 0;
}

function doExport(rest) {
  const f = rest[0];
  if (!f) { usage(); return 1; }
  fs.writeFileSync(f, kb.toJSON());
  console.log('✓ exportado a ' + f);
  return 0;
}

function doImport(rest) {
  const f = rest[0];
  if (!f || !fs.existsSync(f)) { console.error(C.red + '✗ archivo no existe' + C.reset); return 1; }
  kb.fromJSON(fs.readFileSync(f, 'utf8'));
  save();
  const s = kb.stats();
  console.log('✓ importado: ' + s.docs + ' textos, ' + s.concepts + ' conceptos');
  return 0;
}

if (require.main === module) {
  const code = main(process.argv.slice(2));
  if (code !== undefined) process.exitCode = code;
} else {
  module.exports = { main: main };
}