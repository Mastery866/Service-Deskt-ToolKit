/* search.js - KB search engine. Matches title, keywords, synonyms, category, KB ID and procedure text.
   Partial phrases work (substring match). Results are ranked by weighted score. */
(function (global) {
  "use strict";
  var STOP = { a: 1, an: 1, the: 1, to: 1, of: 1, is: 1, my: 1, and: 1, for: 1, on: 1, in: 1, not: 1 };

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(q) {
    var all = norm(q).split(" ").filter(Boolean);
    var t = all.filter(function (x) { return !STOP[x]; });
    return t.length ? t : all;
  }
  function list(v) { return Array.isArray(v) ? v : []; }

  /* Edit distance with adjacent transpositions ("pasword" -> "password" = 1). */
  function lev(a, b) {
    var al = a.length, bl = b.length, i, j, d = [];
    if (Math.abs(al - bl) > 2) return 99;
    for (i = 0; i <= al; i++) { d[i] = [i]; }
    for (j = 0; j <= bl; j++) { d[0][j] = j; }
    for (i = 1; i <= al; i++) {
      for (j = 1; j <= bl; j++) {
        var c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }
  /* Typo-tolerant match used only when exact search finds nothing. Every term must match some word. */
  function fuzzyScore(a, toks) {
    var ws = norm([a.title].concat(list(a.keywords), list(a.synonyms)).join(" ")).split(" ").filter(Boolean);
    var total = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], best = 99;
      for (var j = 0; j < ws.length; j++) {
        var w = ws[j];
        if (w.indexOf(t) > -1) { best = 0; break; }
        if (t.length >= 4) { var d = lev(t, w); if (d < best) best = d; }
      }
      var allow = t.length >= 8 ? 2 : (t.length >= 4 ? 1 : 0);
      if (best > allow) return 0;
      total += best === 0 ? 3 : 2;
    }
    return total;
  }

  function scoreArticle(a, qn, toks) {
    var s = 0, weak = 0, via = [];
    var title = norm(a.title);
    var kws = list(a.keywords).map(norm);
    var syns = list(a.synonyms).map(norm);
    var cat = norm((a.category || "") + " " + (a.subcategory || ""));
    var steps = norm(list(a.steps).join(" "));
    var idc = norm(a.id).replace(/-/g, "");
    var qc = qn.replace(/[-\s]/g, "");

    if (qc.length >= 3 && idc.indexOf(qc) > -1) s += 100;           // KB ID
    if (title === qn) s += 60; else if (title.indexOf(qn) > -1) s += 40; // whole phrase in title
    kws.forEach(function (k) { if (k === qn) s += 25; else if (k.indexOf(qn) > -1) s += 12; });
    syns.forEach(function (k) { if (k === qn) s += 20; else if (k.indexOf(qn) > -1) s += 10; });

    toks.forEach(function (t) {
      if (title.indexOf(t) > -1) s += 10;
      kws.forEach(function (k) { if (k.indexOf(t) > -1) { s += 6; if (via.indexOf(k) === -1) via.push(k); } });
      syns.forEach(function (k) { if (k.indexOf(t) > -1) { s += 5; if (via.indexOf(k) === -1) via.push(k); } });
      if (cat.indexOf(t) > -1) s += 3;
      if (steps.indexOf(t) > -1) weak += 1;
    });
    return { score: s, weak: weak, via: title.indexOf(qn) > -1 ? [] : via.slice(0, 3) };
  }

  /* Returns [{article, score, via}] best first. */
  function search(query, articles, limit) {
    var qn = norm(query);
    if (!qn) return [];
    var toks = tokens(query);
    var out = [], weakOnly = [];
    list(articles).forEach(function (a) {
      var r = scoreArticle(a, qn, toks);
      if (r.score > 0) out.push({ article: a, score: r.score, via: r.via });
      else if (r.weak > 0) weakOnly.push({ article: a, score: r.weak, via: [] });
    });
    function rank(x, y) { return y.score - x.score || x.article.id.localeCompare(y.article.id); }
    out.sort(rank);
    // Procedure-text-only matches are weak; show them only when few strong matches exist.
    if (out.length < 3) { weakOnly.sort(rank); out = out.concat(weakOnly); }
    var fuzzy = false;
    if (!out.length) {
      list(articles).forEach(function (a) {
        var f = fuzzyScore(a, toks);
        if (f > 0) out.push({ article: a, score: f, via: [] });
      });
      out.sort(rank);
      fuzzy = out.length > 0;
    }
    var res = out.slice(0, limit || 30);
    res.fuzzy = fuzzy; // true when these are "close matches" for a misspelled query
    return res;
  }

  /* Appends text to parent, wrapping matching terms in <mark>. Uses DOM nodes only (no innerHTML). */
  function highlight(parent, text, query) {
    text = String(text == null ? "" : text);
    var terms = tokens(query).filter(function (t) { return t.length > 1; });
    if (!terms.length) { parent.appendChild(document.createTextNode(text)); return; }
    terms.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(" + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi");
    text.split(re).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) { var m = document.createElement("mark"); m.textContent = part; parent.appendChild(m); }
      else parent.appendChild(document.createTextNode(part));
    });
  }

  global.SDT = global.SDT || {};
  global.SDT.search = { search: search, highlight: highlight, norm: norm };
})(window);
