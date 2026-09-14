'use strict';

const Lexer = require('./lexer.js');

function normSurface(s) {
  return Lexer.normalizeAccents(String(s).toLowerCase());
}

class KnowledgeBase {
  constructor(opts) {
    opts = opts || {};
    this.minFreq = opts.minFreq || 1;
    this._docs = [];            // {id, source, text, date, terms: Map<lemma,{surface,count,sents}>}
    this._terms = new Map();    // lemma -> {freq, df, sources:Set, surfaces:Map<surface,count>, firstSeen, lastSeen}
    this._seq = 0;
  }

  // ---------- ingestión ----------

  addText(text, source, date) {
    source = source || ('texto #' + (this._docs.length + 1));
    if (!date) date = Date.now();
    const id = source + '#' + (this._seq++);
    const terms = new Map();      // lemma -> {surface, count, sents:Set}
    const sentenceList = Lexer.sentences(text);
    const termIter = Lexer.terms(text);

    for (const [lemma, info] of termIter) {
      const sents = new Set();
      for (let si = 0; si < sentenceList.length; si++) {
        if (sentenceContains(sentenceList[si], info.surface)) {
          sents.add(si);
          if (sents.size >= 3) break;
        }
      }
      terms.set(lemma, { surface: info.surface, count: info.count, sents: sents });
    }

    this._docs.push({
      id: id, source: source, text: text, date: date,
      terms: terms, sentences: sentenceList
    });

    for (const [lemma, info] of terms.entries()) {
      let st = this._terms.get(lemma);
      if (!st) {
        st = {
          freq: 0, df: 0, sources: new Set(),
          surfaces: new Map(), firstSeen: date, lastSeen: date
        };
        this._terms.set(lemma, st);
      }
      st.freq += info.count;
      st.df++;
      st.sources.add(source);
      if (date < st.firstSeen) st.firstSeen = date;
      if (date > st.lastSeen) st.lastSeen = date;
      const surf = st.surfaces.get(info.surface) || 0;
      st.surfaces.set(info.surface, surf + info.count);
    }
    return this._docs[this._docs.length - 1];
  }

  // ---------- estadísticas y rankings ----------

  stats() {
    let concepts = 0;
    for (const st of this._terms.values()) if (st.df >= this.minFreq) concepts++;
    return {
      docs: this._docs.length,
      terms: this._terms.size,
      concepts: concepts,
      sources: this.sources().length
    };
  }

  sources() {
    const seen = [];
    const set = new Set();
    for (const d of this._docs) {
      if (!set.has(d.source)) { set.add(d.source); seen.push(d.source); }
    }
    return seen;
  }

  idf(nDocs) {
    return Math.log((nDocs + 1) / 0.5);
  }

  salience(lemma) {
    const st = this._terms.get(lemma);
    if (!st || st.df < this.minFreq) return 0;
    return st.df * Math.log((this._docs.length + 1) / (st.df + 0.5)) * Math.sqrt(st.freq);
  }

  topTitle(lemma) {
    const st = this._terms.get(lemma);
    if (!st) return lemma;
    let best = lemma, bestCount = 0;
    for (const [surf, c] of st.surfaces) {
      if (c > bestCount || (c === bestCount && surf.length > best.length)) {
        best = surf; bestCount = c;
      }
    }
    return best;
  }

  concepts(n) {
    const out = [];
    for (const [term, st] of this._terms) {
      if (st.df < this.minFreq) continue;
      out.push({ term: term, title: this.topTitle(term), df: st.df, freq: st.freq, salience: this.salience(term) });
    }
    out.sort((a, b) => b.salience - a.salience || a.term.localeCompare(b.term));
    return n ? out.slice(0, n) : out;
  }

  // ---------- artículos ----------

  article(lemma) {
    lemma = normSurface(lemma);
    const st = this._terms.get(lemma);
    if (!st || st.df < this.minFreq) return null;

    const paragraphs = [];   // {source, date, sentence}
    let definition = null;
    for (const d of this._docs) {
      const info = d.terms.get(lemma);
      if (!info) continue;
      for (const si of info.sents) {
        const sent = d.sentences[si];
        if (!sent) continue;
        if (!definition) definition = sent;
        paragraphs.push({ source: d.source, date: d.date, sentence: sent });
        if (paragraphs.length >= 10) break;
      }
      if (paragraphs.length >= 10) break;
    }

    return {
      term: lemma,
      title: this.topTitle(lemma),
      df: st.df,
      freq: st.freq,
      salience: this.salience(lemma),
      sources: Array.from(st.sources),
      consensus: st.df,
      confidence: Math.min(1, st.df / 3),
      firstSeen: st.firstSeen,
      lastSeen: st.lastSeen,
      definition: definition || '',
      paragraphs: paragraphs,
      related: this.related(lemma, 8),
      backlinks: this.backlinks(lemma, 6)
    };
  }

  _coScores(lemma) {
    const scores = new Map(); // coTerm -> {weight, docs}
    for (const d of this._docs) {
      const info = d.terms.get(lemma);
      if (!info) continue;
      for (const [co, ci] of d.terms) {
        if (co === lemma) continue;
        let e = scores.get(co);
        if (!e) { e = { weight: 0, docs: 0 }; scores.set(co, e); }
        e.weight += ci.count * info.count;
        e.docs += 1;
      }
    }
    return scores;
  }

  related(lemma, n) {
    const scores = this._coScores(lemma);
    const out = [];
    for (const [co, e] of scores) {
      const st = this._terms.get(co);
      if (!st || st.df < this.minFreq) continue;
      const weight = e.weight * Math.sqrt(st.df);
      out.push({ term: co, title: this.topTitle(co), weight: weight, docs: e.docs, df: st.df });
    }
    out.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
    return out.slice(0, n);
  }

  backlinks(lemma, n) {
    const related = this.related(lemma, 12);
    const back = [];
    for (const r of related) {
      const rScores = this._coScores(r.term);
      const has = rScores.get(lemma);
      if (has) back.push({ term: r.term, title: r.title, weight: has.weight });
    }
    back.sort((a, b) => b.weight - a.weight);
    return back.slice(0, n);
  }

  // ---------- búsqueda ----------

  search(query, n) {
    n = n || 6;
    const qTerms = new Map();
    for (const [lemma, info] of Lexer.terms(query)) {
      qTerms.set(lemma, info.surface);
    }
    const qTokens = Lexer.tokenize(query).map(normSurface);

    const conceptsFound = [];
    for (const [lemma, st] of this._terms) {
      if (st.df < this.minFreq) continue;
      let overlap = 0;
      for (const qt of qTerms.keys()) if (qt === lemma) overlap += Math.min(3, st.freq);
      if (overlap) {
        conceptsFound.push({ term: lemma, title: this.topTitle(lemma), score: this.salience(lemma) + overlap * 10 });
      }
    }
    conceptsFound.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

    const docHits = [];
    for (const d of this._docs) {
      let score = 0, hitTerm = null, hitSent = '';
      for (const [lemma, info] of d.terms) {
        if (!qTerms.has(lemma)) continue;
        score += (info.count / Math.sqrt(d.terms.size)) * this.idf(this._docs.length);
        if (!hitTerm) hitTerm = info.surface;
      }
      if (score > 0) {
        for (const t of qTokens) {
          const si = d.sentences.findIndex(s => normSurface(s).includes(t));
          if (si !== -1) { hitSent = d.sentences[si]; break; }
        }
        if (!hitSent && qTokens.length && d.sentences.length) hitSent = d.sentences[0];
        docHits.push({ score: score, source: d.source, date: d.date, terms: hitTerm, sentence: hitSent, id: d.id });
      }
    }
    docHits.sort((a, b) => b.score - a.score);

    return {
      query: query,
      concepts: conceptsFound.slice(0, n),
      docs: docHits.slice(0, n)
    };
  }

  // ---------- grafo ----------

  graph(n) {
    n = n || 30;
    const nodes = this.concepts(n).map(c => ({
      term: c.term, title: c.title, salience: c.salience, df: c.df
    }));
    const idSet = new Set(nodes.map(x => x.term));
    const edges = [];
    const edgeSet = new Set();
    for (const c of nodes) {
      const rel = this.related(c.term, 4);
      for (const r of rel) {
        if (!idSet.has(r.term)) continue;
        const key = c.term < r.term ? c.term + '|' + r.term : r.term + '|' + c.term;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({ s: c.term, t: r.term, w: Math.min(1, r.weight / 20) });
      }
    }
    return { nodes: nodes, edges: edges };
  }

  // ---------- persistencia ----------

  toJSON() {
    return JSON.stringify({
      version: 1,
      docs: this._docs.map(d => ({ source: d.source, text: d.text, date: d.date }))
    });
  }

  fromJSON(json) {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.docs)) throw new Error('json inválido');
    this._docs = [];
    this._terms = new Map();
    this._seq = 0;
    for (const d of data.docs) {
      this.addText(d.text, d.source, d.date);
    }
    return this.stats();
  }

  clear() {
    this._docs = [];
    this._terms = new Map();
    this._seq = 0;
  }
}

function sentenceContains(sentence, surface) {
  return normSurface(sentence).includes(normSurface(surface));
}

module.exports = { KnowledgeBase: KnowledgeBase };