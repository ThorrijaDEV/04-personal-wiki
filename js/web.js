(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var top = []; // {term,title,df,freq,salience}

  var toastT;
  function toast(msg, isErr) {
    var el = $('toast');
    el.textContent = msg;
    el.style.background = isErr ? '#3a1d1d' : 'var(--p)';
    el.style.borderColor = isErr ? 'var(--bad)' : 'var(--line)';
    el.style.opacity = 1;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.style.opacity = 0; }, 2600);
  }

  async function api(path) {
    var r = await fetch(path);
    var j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function show(what) {
    $('article-wrap').style.display = what === 'article' ? 'block' : 'none';
    $('results-wrap').style.display = what === 'results' ? 'block' : 'none';
    $('empty').style.display = what === 'empty' ? 'flex' : 'none';
    $('ingest-wrap').style.display = 'block';
    highlightTop($('article-wrap').dataset.term || '');
  }

  function highlightTop(term) {
    var items = document.querySelectorAll('#concept-list .c');
    items.forEach(function (el) { el.classList.toggle('active', el.dataset.term === term); });
  }

  async function loadIndex() {
    var idx = await api('/api/index');
    top = idx.top;
    $('stats').textContent = idx.stats.concepts + ' conceptos · ' + idx.stats.sources + ' fuentes · ' + idx.stats.docs + ' textos';
    var list = $('concept-list');
    list.innerHTML = '';
    var max = 1;
    idx.top.forEach(function (c) { if (c.salience > max) max = c.salience; });
    idx.top.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'c';
      d.dataset.term = c.term;
      var w = Math.max(2, Math.round((c.salience / max) * 12));
      d.innerHTML = '<span class="bar" style="width:' + w * 6 + 'px"></span>' +
        esc(c.title) + ' <span style="color:var(--dim);font-size:10px">' + c.df + '</span>';
      d.title = c.title + ' — ' + c.freq + ' menciones en ' + c.df + ' fuentes';
      d.onclick = function () { renderArticle(c.term); };
      list.appendChild(d);
    });
  }

  // ---------- artículos ----------

  async function renderArticle(term) {
    var a;
    try { a = await api('/api/article?term=' + encodeURIComponent(term)); }
    catch (e) { toast('no hay artículo para "' + term + '"', true); return; }
    $('article-wrap').dataset.term = a.term;

    var badge = a.confidence >= 0.7 ? 'badge-high' : a.confidence >= 0.35 ? 'badge-mid' : 'badge-low';
    var html = '<h1 id="article-title">' + esc(a.title) + '</h1>' +
      '<div id="article-meta">' +
      '<span class="badge ' + badge + '">consenso ' + a.consensus + '</span> ' +
      '— ' + a.freq + ' menciones en ' + a.df + ' textos · ' +
      '<span style="color:var(--dim)">' + esc(a.term) + '</span></div>';

    if (a.definition) {
      html += '<div class="def">' + esc(a.definition) + '</div>';
    }

    html += '<div class="sec-title">Contexto</div>';
    html += renderParagraphs(a, a.paragraphs.slice(0, 6));

    if (a.related && a.related.length) {
      html += '<div class="sec-title">Relacionado con</div><div class="chips">' +
        (a.related.length ? a.related.map(c => '<span class="chip" data-term="' + esc(c.term) + '">' + esc(c.title) + '</span>').join('') : '<span style="color:var(--dim)">—</span>') +
        '</div>';
    }
    if (a.backlinks && a.backlinks.length) {
      html += '<div class="sec-title">Mencionado por</div><div class="chips">' +
        a.backlinks.map(c => '<span class="chip" data-term="' + esc(c.term) + '">' + esc(c.title) + '</span>').join('') +
        '</div>';
    }

    $('article-wrap').innerHTML = html;
    show('article');
    wireArticleLinks(a);
  }

  // enlaza las menciones de conceptos relacionados y menciones dentro de las frases
  function wireArticleLinks(a) {
    var keys = [a.title, a.term].concat(a.related.map(r => r.title), a.backlinks.map(b => b.title))
      .filter(Boolean)
      .sort((x, y) => y.length - x.length)
      .map(s => s.toLowerCase());
    var map = {};
    a.related.concat(a.backlinks).forEach(function (r) {
      var k = r.title.toLowerCase();
      if (!map[k]) map[k] = r.term;
    });
    var titleKey = a.title.toLowerCase();
    if (!map[titleKey]) map[titleKey] = a.term;

    var paras = document.querySelectorAll('#article-wrap .p');
    for (var i = 0; i < paras.length; i++) {
      var text = paras[i].textContent.replace(/\s+\[[^\]]*\]$/, '');
      var src = (paras[i].querySelector('.src') ? paras[i].querySelector('.src').textContent : '');
      var re = null;
      var htmlOut = [];
      var last = 0;
      var searchStr = text;
      var lower = searchStr.toLowerCase();
      var k2 = 0;
      while (k2 < keys.length) {
        var key = keys[k2];
        var idx = lower.indexOf(key, last);
        if (idx === -1) { k2++; continue; }
        htmlOut.push(esc(text.slice(last, idx)));
        var term = map[key] || key;
        htmlOut.push('<a class="link" data-term="' + esc(term) + '">' + esc(text.slice(idx, idx + key.length)) + '</a>');
        last = idx + key.length;
      }
      htmlOut.push(esc(text.slice(last)));
      paras[i].innerHTML = htmlOut.join('') + (src ? ' <span class="src">[' + esc(src) + ']</span>' : '');
    }

    document.querySelectorAll('#article-wrap a.link, #article-wrap .chip').forEach(function (el) {
      el.addEventListener('click', function () { renderArticle(el.dataset.term); });
    });
  }

  function renderParagraphs(a, paragraphs) {
    if (!paragraphs.length) return '<div style="color:var(--dim)">sin contexto</div>';
    var out = '';
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i];
      out += '<div class="p"><span class="sentence">' + esc(p.sentence) + '</span> <span class="src">[' + esc(p.source) + ']</span></div>';
    }
    return out;
  }

  // ---------- búsqueda ----------

  async function doSearch(q) {
    var r;
    try { r = await api('/api/search?q=' + encodeURIComponent(q) + '&n=6'); }
    catch (e) { toast('error: ' + e.message, true); return; }
    var html = '<h2>«' + esc(r.query) + '»' + (r.concepts.length + r.docs.length ? '' : ' — sin resultados') + '</h2>';
    if (r.concepts && r.concepts.length) {
      html += '<div class="sec-title">Conceptos</div><div class="chips">' +
        r.concepts.map(c => '<span class="chip" data-term="' + esc(c.term) + '">' + esc(c.title) + '</span>').join('') + '</div>';
    }
    if (r.docs && r.docs.length) {
      html += '<div class="sec-title">Fragmentos</div>';
      for (var i = 0; i < r.docs.length; i++) {
        var d = r.docs[i];
        html += '<div class="r"><div class="meta">' + esc(d.source) + ' · ' + esc(d.id) + '</div>' +
          '<p>' + esc(d.sentence || '') + '</p></div>';
      }
    }
    $('results-wrap').innerHTML = html;
    show('results');
    document.querySelectorAll('#results-wrap .chip').forEach(function (el) {
      el.addEventListener('click', function () { renderArticle(el.dataset.term); });
    });
  }

  // ---------- grafo ----------

  var graph = { nodes: [], edges: [] };
  var gx = {}, gy = {}, gvx = {}, gvy = {};
  var canvas, ctx;
  var raf = null;

  function initGraph() {
    canvas = $('graph-canvas');
    ctx = canvas.getContext('2d');
  }

  async function openGraph() {
    graph = await api('/api/graph?n=40');
    $('graph-overlay').classList.add('open');
    sizeCanvas();
    if (!graph.nodes.length) {
      toast('conocimiento vacío', true);
      $('graph-overlay').classList.remove('open');
      return;
    }
    gx = {}; gy = {}; gvx = {}; gvy = {};
    graph.nodes.forEach(function (n, i) {
      var ang = (i / graph.nodes.length) * 6.2832;
      var rad = Math.min(canvas.width, canvas.height) * 0.36;
      gx[n.term] = canvas.width / 2 + Math.cos(ang) * rad * (0.5 + Math.random() * 0.5);
      gy[n.term] = canvas.height / 2 + Math.sin(ang) * rad * (0.5 + Math.random() * 0.5);
      gvx[n.term] = 0; gvy[n.term] = 0;
    });
    if (raf) cancelAnimationFrame(raf);
    stepGraph();
  }

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function stepGraph() {
    var nodes = graph.nodes, edges = graph.edges;
    var strength = 1600, link = 0.02, damp = 0.82;
    for (var it = 0; it < 12; it++) {
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i].term, b = nodes[j].term;
          var dx = gx[a] - gx[b], dy = gy[a] - gy[b];
          var d2 = dx * dx + dy * dy + 0.1;
          var f = strength / d2;
          gvx[a] += dx * f; gvy[a] += dy * f;
          gvx[b] -= dx * f; gvy[b] -= dy * f;
        }
      }
      for (var e = 0; e < edges.length; e++) {
        var s = edges[e].s, t = edges[e].t;
        var dx = gx[t] - gx[s], dy = gy[t] - gy[s];
        gvx[s] += dx * link * edges[e].w; gvy[s] += dy * link * edges[e].w;
        gvx[t] -= dx * link * edges[e].w; gvy[t] -= dy * link * edges[e].w;
      }
      for (var n = 0; n < nodes.length; n++) {
        var id = nodes[n].term;
        gvx[id] *= damp; gvy[id] *= damp;
        gx[id] += gvx[id]; gy[id] += gvy[id];
        gx[id] = Math.max(12, Math.min(canvas.clientWidth - 12, gx[id]));
        gy[id] = Math.max(12, Math.min(canvas.clientHeight - 12, gy[id]));
      }
    }
    var maxS = 1;
    nodes.forEach(function (n) { if (n.salience > maxS) maxS = n.salience; });
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.lineWidth = 1;
    edges.forEach(function (el) {
      ctx.strokeStyle = 'rgba(88,166,255,' + (0.05 + 0.5 * el.w) + ')';
      ctx.beginPath();
      ctx.moveTo(gx[el.s], gy[el.s]); ctx.lineTo(gx[el.t], gy[el.t]); ctx.stroke();
    });
    nodes.forEach(function (n) {
      var r = 5 + (n.salience / maxS) * 16;
      ctx.fillStyle = 'hsl(' + (200 + (n.salience / maxS) * 60) + ',70%,58%)';
      ctx.beginPath(); ctx.arc(gx[n.term], gy[n.term], r, 0, 6.2832); ctx.fill();
      if (r > 8) {
        ctx.font = '11px system-ui'; ctx.fillStyle = '#c4d4e4'; ctx.textAlign = 'center';
        ctx.fillText(n.title, gx[n.term], gy[n.term] - r - 4);
      }
    });
    raf = requestAnimationFrame(stepGraph);
  }

  canvas.addEventListener('click', function (ev) {
    var rect = canvas.getBoundingClientRect();
    var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    var best = null, bd = 1e18;
    for (var i = 0; i < graph.nodes.length; i++) {
      var n = graph.nodes[i];
      var dd = (gx[n.term] - mx) ** 2 + (gy[n.term] - my) ** 2;
      if (dd < bd) { bd = dd; best = n.term; }
    }
    if (bd < 700) {
      $('graph-overlay').classList.remove('open');
      if (raf) cancelAnimationFrame(raf);
      renderArticle(best);
    }
  });

  function closeGraph() {
    $('graph-overlay').classList.remove('open');
    if (raf) cancelAnimationFrame(raf);
  }

  // ---------- eventos ----------

  $('btn-search').addEventListener('click', function () { doSearch($('search').value.trim()); });
  $('search').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') doSearch(this.value.trim());
  });
  $('graph-overlay').addEventListener('resize', sizeCanvas);
  window.addEventListener('resize', function () { if (canvas) sizeCanvas(); });
  $('btn-graph').addEventListener('click', openGraph);
  $('btn-close-graph').addEventListener('click', closeGraph);

  $('btn-ingest').addEventListener('click', async function () {
    var text = $('ingest-text').value.trim();
    if (text.length < 10) { toast('el texto es demasiado corto', true); return; }
    var source = $('ingest-source').value.trim() || 'nota manual';
    try {
      var r = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, source: source })
      });
      var j = await r.json();
      if (j.error) throw new Error(j.error);
      $('ingest-text').value = '';
      toast('✓ añadido — nueva visión del conocimiento');
      await loadIndex();
    } catch (e) { toast('✗ ' + e.message, true); }
  });

  show('empty');
  initGraph();
  loadIndex().catch(function (e) {
    toast('no se pudo conectar con el servidor', true);
  });
})();