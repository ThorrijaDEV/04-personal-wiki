'use strict';

const assert = require('assert');
const Lexer = require('../js/core/lexer.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); process.exitCode = 1; }
}
function suite(name) { console.log('## ' + name); }

suite('Lexer: stemming español ligero');

test('plurales en -s y -es', () => {
  assert.strictEqual(Lexer.stem('flores'), 'flor');
  assert.strictEqual(Lexer.stem('ciudades'), 'ciudad');
  assert.strictEqual(Lexer.stem('memorias'), 'memoria');
  assert.strictEqual(Lexer.stem('cerebros'), 'cerebro');
});

test('plurales en -ces', () => {
  assert.strictEqual(Lexer.stem('luces'), 'luz');
  assert.strictEqual(Lexer.stem('informaciones'), 'informacion');
});

test('respeto a singulares que acaban en -s (no plural)', () => {
  assert.strictEqual(Lexer.stem('análisis'), 'analisis');
  assert.strictEqual(Lexer.stem('paraguas'), 'paraguas');
});

test('adverbios en -mente', () => {
  assert.strictEqual(Lexer.stem('rápidamente'), 'rapida');
});

test('normalización de acentos al extraer términos', () => {
  const t = Lexer.terms('información informacion');
  assert.ok(t.has('informacion'));
  assert.strictEqual(t.get('informacion').surface, 'informacion');
  assert.strictEqual(t.get('informacion').count, 2);
});

test('stopwords se descartan por completo', () => {
  assert.strictEqual(Lexer.terms('el la un con y para pero sin').size, 0);
});

test('filtra palabras demasiado cortas', () => {
  const t = Lexer.terms('ir ir ir al al');
  assert.strictEqual(t.size, 0);
});

test('contabiliza superficies y frecuencias', () => {
  const t = Lexer.terms('memoria y memorias y memoria');
  const e = t.get('memoria');
  assert.strictEqual(e.count, 3);
  assert.strictEqual(e.surface, 'memorias'); // la superficie más larga
});

suite('Lexer: frases');

test('sentences separa por puntuación y cambios de línea', () => {
  const s = Lexer.sentences('Hola mundo. ¿Cómo estás?\nMuy bien, gracias.');
  assert.ok(s.length >= 3);
  assert.ok(s.some(x => x.includes('Hola mundo')));
  assert.ok(s.some(x => x.includes('Muy bien')));
});

console.log('\n' + passed + ' pruebas superadas\n');