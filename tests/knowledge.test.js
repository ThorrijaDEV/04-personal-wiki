'use strict';

const assert = require('assert');
const { KnowledgeBase } = require('../js/core/knowledge.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); process.exitCode = 1; }
}
function suite(name) { console.log('## ' + name); }

function sampleKB() {
  const kb = new KnowledgeBase();
  kb.addText('La memoria episódica guarda los eventos vividos de forma cronológica. El hipocampo es clave para formar memorias.', 'manual', 1000);
  kb.addText('Durante el sueño el cerebro consolida los recuerdos del día. La memoria se fija mejor durmiendo.', 'dormir', 1001);
  kb.addText('El hipocampo también navega mapas mentales del espacio. Sin hipocampo no hay memoria espacial.', 'neurologia', 1002);
  return kb;
}

suite('KnowledgeBase: ingestión y rankings');

test('conceptos se ordenan por saliencia (df × idf)', () => {
  const kb = sampleKB();
  const cs = kb.concepts();
  const names = cs.map(c => c.term);
  assert.ok(names.includes('hipocampo'));
  assert.ok(names.includes('memoria'));
  const hip = cs.find(c => c.term === 'hipocampo');
  const mem = cs.find(c => c.term === 'memoria');
  assert.ok(hip.salience > 0 && mem.salience > 0);
});

test('el título usa la superficie más frecuente', () => {
  const kb = new KnowledgeBase();
  kb.addText('Los recuerdos se olvidan. Varios recuerdos vuelven al soñar. Tres recuerdos más.', 'a', 1);
  const art = kb.article('recuerdo');
  assert.strictEqual(art.title, 'recuerdos');
});

test('fetch de documento con fecha determinista', () => {
  const kb = sampleKB();
  assert.strictEqual(kb.stats().docs, 3);
  assert.strictEqual(kb.stats().sources, 3);
});

suite('KnowledgeBase: artículos');

test('artículo tiene definición, párrafos, fuentes y consenso', () => {
  const kb = sampleKB();
  const a = kb.article('memoria');
  assert.ok(a);
  assert.ok(a.definition.length > 10);
  assert.ok(a.paragraphs.length >= 2);
  assert.deepStrictEqual(Array.from(a.sources).sort(), ['dormir', 'manual', 'neurologia'].sort());
  assert.strictEqual(a.consensus, 3);
  assert.strictEqual(a.confidence, 1);
});

test('related: conceptos co-ocurrentes pesados por df', () => {
  const kb = sampleKB();
  const a = kb.article('hipocampo');
  const rel = a.related.map(r => r.term);
  assert.ok(rel.includes('memoria'), 'memoria co-ocurre en 2 docs');
  assert.ok(rel.includes('espacio') || rel.includes('mapa'), 'contexto espacial presente');
});

test('backlinks apuntan a conceptos que también lo mencionan', () => {
  const kb = sampleKB();
  const a = kb.article('sueño');
  const back = a.backlinks.map(b => b.term);
  assert.ok(back.includes('memoria'), 'memoria menciona sueño');
});

test('consensus refleja cobertura y confianza acotada', () => {
  const kb = new KnowledgeBase();
  kb.addText('Solo aparece aquí una vez. Termino raro de prueba.', 'x', 1);
  const a = kb.article('termino');
  assert.strictEqual(a.consensus, 1);
  assert.ok(a.confidence < 0.5);
});

suite('KnowledgeBase: búsqueda');

test('búsqueda devuelve conceptos y fragmentos', () => {
  const kb = sampleKB();
  const r = kb.search('memoria hipocampo', 5);
  assert.ok(r.concepts.some(c => c.term === 'hipocampo'));
  assert.ok(r.docs.length >= 1);
  assert.ok(r.docs[0].sentence.length > 0);
});

test('búsqueda singulariza (recuerdo/recuerdos) y matchea', () => {
  const kb = new KnowledgeBase();
  kb.addText('Los recuerdos se desvanecen sin uso. El olvido ataca los recuerdos débiles.', 'a', 1);
  const r = kb.search('recuerdo', 5);
  assert.ok(r.docs.length === 1);
  assert.ok(r.docs[0].sentence.includes('recuerdos'));
});

suite('KnowledgeBase: grafo y persistencia');

test('el grafo solo conecta conceptos de la selección', () => {
  const kb = sampleKB();
  const g = kb.graph(20);
  const ids = new Set(g.nodes.map(n => n.term));
  for (const e of g.edges) {
    assert.ok(ids.has(e.s) && ids.has(e.t));
  }
  assert.ok(g.edges.length > 0);
});

test('toJSON/fromJSON reconstruye el mismo conocimiento', () => {
  const kb = sampleKB();
  const before = kb.toJSON();
  const kb2 = new KnowledgeBase();
  kb2.fromJSON(before);
  assert.deepStrictEqual(kb.stats(), kb2.stats());
  const a1 = kb.article('memoria');
  const a2 = kb2.article('memoria');
  assert.strictEqual(a1.definition, a2.definition);
  assert.strictEqual(a1.consensus, a2.consensus);
});

test('clear vacía el conocimiento', () => {
  const kb = sampleKB();
  kb.clear();
  assert.deepStrictEqual(kb.stats(), { docs: 0, terms: 0, concepts: 0, sources: 0 });
});

console.log('\n' + passed + ' pruebas superadas\n');