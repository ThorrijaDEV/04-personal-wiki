(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WIKKI = root.WIKKI || {};
    root.WIKKI.Lexer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOPWORDS = new Set((
    'a un una unos unas uno al a la las lo los de del el en y ni o u que como para por con sin sobre entre ' +
    'hasta desde tras durante mediante según hacia ante bajo contra hacia ahí aquí este esta estos estas ese esa esos esas aquel aquella aquellos ' +
    'su sus tu tus mi mis nuestro nuestra vuestro vuestra mis yo tú él ella ello nosotros ellos ellas nos os se le les ' +
    'ser es son era eran fue fueron será será serán estar está están estaba estaban estado siendo ' +
    'haber hay había habían ha hemos han tenido tiene tienen tener tuvo ' +
    'ya no sí si pero más menos muy mucho muchos mucha muchas poco poca grande gran bien mal todo toda todos todas otro otra otros otras ' +
    'mismo misma mismos mismas cuando donde porque también asi así sin embargo veces forma parte algo alguien nada nadie todo ' + 
    'cada cuyo cuya quienes quien quien el cual la cual los cuales las cuales ' +
    'ahora antes después luego entonces quien dónde cómo cuál qué cuándo por qué ' +
    'esto eso aquello esta eso ello tal tales ' +
    'fue son se pueden puede puede podría podía ' +
    'algo cero uno dos tres cuatro cinco seis siete ocho nueve diez primer primera segundo tercera'
  ).split(/\s+/));

  // Palabras frecuentes que acaban en -as/-os/-es y NO son plurales.
  var NON_PLURALS = new Set((
    'paraguas atlas lunes virus caos crisis tesis bus autobus analisis diabetes plus'
  ).split(/\s+/));

  var ACCENTS = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
    'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u', 'ñ': 'ñ', 'ç': 'c'
  };

  function normalizeAccents(s) {
    return s.replace(/[áéíóúàèìòùäëïöüñç]/g, function (c) { return ACCENTS[c]; });
  }

  // Stemmer ligero y conservador para español.
  function stem(word) {
    var w = normalizeAccents(word.toLowerCase());
    if (w.length < 4) return w;
    if (NON_PLURALS.has(w)) return w;
    // plurales
    if (w.endsWith('ciones') && w.length > 8) { w = w.slice(0, -2); }
    else if (w.endsWith('ces') && w.length > 4) { w = w.slice(0, -3) + 'z'; }
    else if (w.endsWith('es') && w.length > 4) { w = w.slice(0, -2); if (!/[aeiou]/.test(w)) w += 'e'; }
    else if (w.endsWith('as') && w.length > 4) { w = w.slice(0, -1); }
    else if (w.endsWith('os') && w.length > 4) { w = w.slice(0, -1); }
    // adverbial / algunos sufijos
    if (w.endsWith('mente') && w.length > 7) w = w.slice(0, -5);
    if (w.endsWith('amientos') && w.length > 9) w = w.slice(0, -3);
    else if (w.endsWith('amiento') && w.length > 8) w = w.slice(0, -4);
    else if (w.endsWith('iendo') && w.length > 7) w = w.slice(0, -2);
    else if (w.endsWith('ando') && w.length > 6) w = w.slice(0, -2);
    return w;
  }

  function tokenize(text) {
    return (String(text).match(/[a-zA-ZáéíóúàèìòùäëïöüñçÁÉÍÓÚÑ]+/g) || []);
  }

  function terms(text) {
    var out = new Map();      // lemma -> superficie más común
    var t = tokenize(text);
    for (var i = 0; i < t.length; i++) {
      var lemma = stem(t[i]);
      if (lemma.length < 3) continue;
      if (STOPWORDS.has(lemma) || STOPWORDS.has(normalizeAccents(t[i].toLowerCase()))) continue;
      if (!/^[a-zñáéíóú]{3,}$/i.test(t[i])) continue;
      var s = normalizeAccents(t[i].toLowerCase());
      if (STOPWORDS.has(s)) continue;
      if (!out.has(lemma)) out.set(lemma, { surface: s, count: 0 });
      var e = out.get(lemma);
      e.count++;
      if (s.length > e.surface.length) e.surface = s;
    }
    return out; // Map<lemma, {surface, count}>
  }

  function sentences(text) {
    var out = [];
    var cur = '';
    for (var i = 0; i < String(text).length; i++) {
      var ch = String(text)[i];
      cur += ch;
      if (/[.!?…;]/.test(ch) || ch === '\n') {
        var raw = cur.replace(/^[\s]+/, '');
        if (!/^#[#\s]/.test(raw)) {
          var s = raw.replace(/^[-\s#]+/, '').replace(/[\s]+$/, '').trim();
          if (s.length > 3) out.push(s);
        }
        cur = '';
      }
    }
    var tail = cur.trim();
    if (tail.length > 3) out.push(tail);
    return out;
  }

  return {
    STOPWORDS: STOPWORDS,
    stem: stem,
    tokenize: tokenize,
    terms: terms,
    sentences: sentences,
    normalizeAccents: normalizeAccents
  };
}));