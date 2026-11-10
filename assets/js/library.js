/* library.js - Library home: what you have, what needs attention, what you used or changed lately.
   The health check looks for broken or stale content (flows that lead nowhere, missing KIs, items not reviewed for
   months) so a big library stays trustworthy. Everything is worked out from your own saved data. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var STALE_DAYS = 180, showAll = false;

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function arr(k) { var v = store.get(k, []); return Array.isArray(v) ? v : []; }
  function go(v) { global.location.hash = "#" + v; }
  function daysAgo(s) { var t = new Date(s).getTime(); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); }

  /* ---- Health check ---- */
  function scan() {
    var out = [], kb = arr("kb"), kbIds = {};
    kb.forEach(function (a) { kbIds[a.id] = true; });
    function add(area, text, label, run, level) { out.push({ area: area, text: text, label: label, run: run, level: level || "warn" }); }

    SDT.flows.list().forEach(function (f) {
      var reach = SDT.flows.reachable(f), lost = f.nodes.filter(function (n) { return !reach[n.id]; }).length;
      var open = function () { SDT.flows.show(f.id); SDT.flows.openEditor(f.id); go("flows"); };
      if (lost) add("Question flows", "\u201C" + f.title + "\u201D has " + lost + " step" + (lost === 1 ? "" : "s") + " nobody can reach", "Edit flow", open);
      var loose = 0; f.nodes.forEach(function (n) { if (n.type === "q") (n.answers || []).forEach(function (a) { if (!a.next) loose++; }); });
      if (loose) add("Question flows", "\u201C" + f.title + "\u201D has " + loose + " answer" + (loose === 1 ? "" : "s") + " that lead nowhere", "Edit flow", open, "bad");
      var bare = f.nodes.filter(function (n) { return n.type === "r" && !(n.kis && n.kis.length) && !n.search && !n.goto; }).length;
      if (bare) add("Question flows", "\u201C" + f.title + "\u201D has " + bare + " result" + (bare === 1 ? "" : "s") + " with no KI to suggest", "Edit flow", open);
      f.nodes.forEach(function (n) { (n.kis || []).forEach(function (k) { if (!kbIds[k]) add("Question flows", "\u201C" + f.title + "\u201D points to " + k + ", which is not in the Knowledge Base", "Edit flow", open, "bad"); }); });
      if (!f.category) add("Question flows", "\u201C" + f.title + "\u201D has no category", "Edit flow", open, "info");
      if (!(f.keywords && f.keywords.length)) add("Question flows", "\u201C" + f.title + "\u201D has no matching words, so it is never suggested from the issue", "Edit flow", open, "info");
      var d = f.reviewed ? daysAgo(f.reviewed) : null;
      if (d === null) add("Question flows", "\u201C" + f.title + "\u201D has never been reviewed", "Mark reviewed", function () { markFlowReviewed(f.id); }, "info");
      else if (d > STALE_DAYS) add("Question flows", "\u201C" + f.title + "\u201D was last reviewed " + d + " days ago", "Mark reviewed", function () { markFlowReviewed(f.id); }, "info");
    });

    var seenTitle = {};
    SDT.scripts.list().forEach(function (s) {
      (s.kis || []).forEach(function (k) { if (!kbIds[k]) add("Scripts", "\u201C" + s.title + "\u201D is linked to " + k + ", which is not in the Knowledge Base", "Edit script", function () { SDT.scripts.show(s.id); go("scripts"); SDT.scripts.openEditor(s.id); }, "bad"); });
      var key = (s.category + "|" + s.title).toLowerCase();
      if (seenTitle[key]) add("Scripts", "\u201C" + s.title + "\u201D appears twice in " + s.category, "Open", function () { SDT.scripts.show(s.id); go("scripts"); }, "info"); seenTitle[key] = true;
    });

    var staleKb = kb.filter(function (a) { var d = a.reviewed ? daysAgo(a.reviewed) : null; return d === null || d > STALE_DAYS; }).length;
    if (staleKb) add("Knowledge Base", staleKb + " article" + (staleKb === 1 ? " was" : "s were") + " not reviewed in the last " + STALE_DAYS + " days", "See Reports", function () { go("reports"); }, "info");
    var noKw = kb.filter(function (a) { return !(a.keywords && a.keywords.length); }).length;
    if (noKw) add("Knowledge Base", noKw + " article" + (noKw === 1 ? " has" : "s have") + " no keywords, so search may miss " + (noKw === 1 ? "it" : "them"), "Open KB", function () { go("kb"); }, "info");

    arr("checklists").forEach(function (c) { if (!(c.items && c.items.length)) add("Checklists", "\u201C" + c.title + "\u201D has no items", "Edit", function () { go("checklists"); SDT.checklists.openEditor(c.id); }, "bad"); });

    var u = store.usage();
    if (store.mode() === "ls" && u.pct >= 50) add("Storage", "Browser storage is " + u.pct + "% full", "Open Settings", function () { go("settings"); }, u.pct >= 80 ? "bad" : "warn");
    var last = store.get("lastBackup", null), d2 = last ? daysAgo(last) : null;
    if (d2 === null) add("Backup", "No backup has been made yet", "Open Settings", function () { go("settings"); }, "warn");
    else if (d2 > 7) add("Backup", "The last backup was " + d2 + " days ago", "Open Settings", function () { go("settings"); }, "warn");
    var order = { bad: 0, warn: 1, info: 2 };
    return out.sort(function (a, b) { return order[a.level] - order[b.level]; });
  }
  function markFlowReviewed(id) {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    store.set("flows", SDT.flows.list().map(function (f) { if (f.id === id) f.reviewed = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); return f; }));
    render(); SDT.app.toast("Marked as reviewed today");
  }

  /* ---- Page ---- */
  function card(label, n, view) {
    var b = el("button", "lib-card"); b.type = "button"; b.setAttribute("aria-label", n + " " + label + ". Open.");
    b.appendChild(el("strong", "", String(n))); b.appendChild(el("span", "", label));
    b.addEventListener("click", function () { go(view); }); return b;
  }
  function recentList(title, items, empty) {
    var p = el("div", "panel"); p.appendChild(el("h2", "", title));
    if (!items.length) { p.appendChild(el("p", "empty small", empty)); return p; }
    var ul = el("ul", "list");
    items.forEach(function (i) {
      var li = el("li", "follow-item"), tx = el("span", "follow-text"); tx.appendChild(el("strong", "", i.title)); if (i.meta) tx.appendChild(el("div", "result-meta", i.meta)); li.appendChild(tx);
      var b = el("button", "btn btn-ghost btn-sm", "Open"); b.type = "button"; b.setAttribute("aria-label", "Open " + i.title); b.addEventListener("click", i.run); li.appendChild(b); ul.appendChild(li);
    });
    p.appendChild(ul); return p;
  }
  function render() {
    var body = $("lib-body"); if (!body) return; body.innerHTML = "";
    var flows = SDT.flows.list(), scripts = SDT.scripts.list();
    var cards = el("div", "lib-cards");
    [["KB articles", arr("kb").length, "kb"], ["Question flows", flows.length, "flows"], ["Scripts and commands", scripts.length, "scripts"], ["Checklists", arr("checklists").length, "checklists"],
     ["Canned responses", arr("snippets").length, "snippets"], ["Email templates", arr("emailTemplates").length, "email"]].forEach(function (c) { cards.appendChild(card(c[0], c[1], c[2])); });
    body.appendChild(cards);

    var qa = el("div", "btn-row lib-actions");
    [["New KI", function () { go("kb"); SDT.kb.openEditor({ mode: "new" }); }], ["New flow", function () { go("flows"); SDT.flows.openEditor(null); }], ["New script", function () { go("scripts"); SDT.scripts.openEditor(null); }],
     ["New checklist", function () { go("checklists"); SDT.checklists.openEditor(null); }], ["Add starter content...", addStarter], ["Quick tour", function () { SDT.shell.openTour(0); }]].forEach(function (a) {
      var b = el("button", "btn btn-ghost btn-sm", a[0]); b.type = "button"; b.addEventListener("click", a[1]); qa.appendChild(b);
    });
    body.appendChild(qa);

    var issues = scan(), hp = el("div", "panel"); hp.appendChild(el("h2", "", "Needs attention"));
    hp.appendChild(el("p", "empty small", "A quick check of your flows, scripts, KB, checklists, storage and backup."));
    if (!issues.length) hp.appendChild(el("p", "lib-ok", "Everything looks healthy."));
    else {
      var shown = showAll ? issues : issues.slice(0, 8), ul = el("ul", "list");
      shown.forEach(function (i) {
        var li = el("li", "follow-item lib-issue lib-" + i.level), tx = el("span", "follow-text");
        tx.appendChild(el("strong", "", i.text)); tx.appendChild(el("div", "result-meta", i.area));
        li.appendChild(tx);
        var b = el("button", "btn btn-ghost btn-sm", i.label); b.type = "button"; b.setAttribute("aria-label", i.label + ": " + i.text); b.addEventListener("click", i.run); li.appendChild(b); ul.appendChild(li);
      });
      hp.appendChild(ul);
      if (issues.length > 8) { var more = el("button", "btn btn-ghost btn-sm", showAll ? "Show fewer" : "Show all " + issues.length); more.type = "button"; more.addEventListener("click", function () { showAll = !showAll; render(); }); hp.appendChild(more); }
    }
    body.appendChild(hp);

    var grid = el("div", "rpt-grid");
    var used = scripts.filter(function (s) { return s.usedAt; }).sort(function (a, b) { return String(b.usedAt).localeCompare(String(a.usedAt)); }).slice(0, 5)
      .map(function (s) { return { title: s.title, meta: s.category + " | used " + new Date(s.usedAt).toLocaleDateString(), run: function () { SDT.scripts.show(s.id); go("scripts"); } }; });
    grid.appendChild(recentList("Recently used scripts", used, "Copy or download a script and it shows up here."));
    var edited = flows.concat(scripts.map(function (s) { return Object.assign({ _script: true }, s); })).filter(function (x) { return x.updatedAt; })
      .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); }).slice(0, 5)
      .map(function (x) { return x._script ? { title: x.title, meta: "Script | " + x.category, run: function () { SDT.scripts.show(x.id); go("scripts"); } } : { title: x.title, meta: "Flow | " + (x.category || "General"), run: function () { SDT.flows.show(x.id); go("flows"); } }; });
    grid.appendChild(recentList("Recently edited", edited, "Nothing edited yet."));
    body.appendChild(grid);
  }
  /* ---- Starter content pack: extra KIs, flows, scripts, checklists, responses and email templates ---- */
  function starterPack() {
    var now = new Date().toISOString(), defs = global.SDT_STARTER_FLOWS || [], ids = {};
    defs.forEach(function (f, i) { ids[f.title.toLowerCase()] = "pk-fl-" + (i + 1); });
    var flows = defs.map(function (f, i) {
      var r = SDT.flowtext.fromText(f.text, function (t) { return ids[String(t).trim().toLowerCase()] || ""; });
      if (r.error) throw new Error(f.title + ": " + r.error);
      return { id: "pk-fl-" + (i + 1), title: f.title, category: f.category, tags: f.tags || [], owner: "", reviewed: "2026-11-07", keywords: f.keywords || [], description: f.description || "", start: r.start, nodes: r.nodes, updatedAt: now };
    });
    var lib = global.SDT_STARTER_LIB ? global.SDT_STARTER_LIB(now) : {};
    return { app: "ServiceDeskToolkit", kind: "pack", version: 1, exportedAt: now, parts: { kb: global.SDT_STARTER_KB || [], flows: flows, scripts: lib.scripts || [], snippets: lib.snippets || [], emailTemplates: lib.emailTemplates || [], checklists: lib.checklists || [] } };
  }
  function addStarter() {
    var pack; try { pack = starterPack(); } catch (e) { SDT.app.toast("The starter content could not be built: " + e.message); return; }
    SDT.sharepack.importPack(JSON.stringify(pack));
  }
  function init() {}

  SDT.library = { init: init, render: render, scan: scan, starterPack: starterPack, addStarter: addStarter };
})(window);
