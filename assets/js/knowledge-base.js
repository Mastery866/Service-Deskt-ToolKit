/* knowledge-base.js - KB browsing/search, article detail, favorites, recents, and KI management:
   create / edit / duplicate / merge / delete (with undo), review dates, internal notes,
   branch links between KIs, print view, KB import / export. Text is written with textContent or .value. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage, S = SDT.search;
  var STALE_DAYS = 180;
  var state = { query: "", selectedId: null, jump: false };
  var kbPager = null, favPager = null;

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function all() { var k = store.get("kb", []); return Array.isArray(k) ? k : []; }
  function byId(id) { return all().filter(function (a) { return a.id === id; })[0]; }
  var toast = window.SDT.dom.toast;
  var today = window.SDT.dom.today;
  function ageDays(dateStr) { var t = new Date(dateStr + "T00:00:00").getTime(); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); }
  function isStale(a) { var d = a.reviewed ? ageDays(a.reviewed) : null; return d !== null && d > STALE_DAYS; }
  function undoable(snapshot) { return function () { store.set("kb", snapshot); renderAll(); }; }

  /* ---- Version history: an earlier version is kept each time an article's content changes ---- */
  var HIST_MAX = 8;
  var CONTENT_FIELDS = ["title", "category", "subcategory", "keywords", "synonyms", "steps", "related", "notes", "questions", "description"];
  function content(a) {
    var o = { description: (a.template && a.template.description) || "" };
    ["title", "category", "subcategory", "notes"].forEach(function (f) { o[f] = a[f] || ""; });
    ["keywords", "synonyms", "steps", "related", "questions"].forEach(function (f) { o[f] = Array.isArray(a[f]) ? a[f] : []; });
    return o;
  }
  function changedFields(a, b) {
    var x = content(a), y = content(b);
    return CONTENT_FIELDS.filter(function (f) { return JSON.stringify(x[f]) !== JSON.stringify(y[f]); });
  }
  function hist() { var h = store.get("kbHistory", {}); return h && typeof h === "object" && !Array.isArray(h) ? h : {}; }
  function keepVersion(old, now) {
    if (!old || (now && !changedFields(old, now).length)) return;
    var h = hist(), list = h[old.id] || [], copy = JSON.parse(JSON.stringify(old));
    delete copy.favorite;
    list.unshift({ at: new Date().toISOString(), a: copy });
    h[old.id] = list.slice(0, HIST_MAX);
    store.set("kbHistory", h);
  }
  function openHistory(a) {
    if (SDT.modal.isOpen()) return;
    var list = hist()[a.id] || [], body = el("div", "import-preview"), handle;
    if (!list.length) body.appendChild(el("p", "empty", "No earlier versions yet. One is kept each time the content of this article changes (the last " + HIST_MAX + " are saved)."));
    var ul = el("ul", "list");
    list.forEach(function (v) {
      var li = el("li", "follow-item"), tx = el("span", "follow-text"), diff = changedFields(a, v.a);
      tx.appendChild(el("strong", "", new Date(v.at).toLocaleString()));
      tx.appendChild(el("div", "result-meta", v.a.title + " | " + (v.a.steps || []).length + " steps | differs from now in: " + (diff.length ? diff.join(", ") : "nothing")));
      var b = el("button", "btn btn-sm", "Restore"); b.type = "button"; b.setAttribute("aria-label", "Restore the version from " + new Date(v.at).toLocaleString());
      b.addEventListener("click", function () {
        var snap = all(), cur = byId(a.id);
        keepVersion(cur, v.a);
        var r = JSON.parse(JSON.stringify(v.a));
        r.favorite = cur.favorite; r.reviewed = cur.reviewed;
        r.template = { shortDescription: r.title + " - {{adUserId}}", description: (v.a.template && v.a.template.description) || "" };
        store.set("kb", snap.map(function (x) { return x.id === a.id ? r : x; }));
        renderAll(); if (handle) handle.close();
        toast("Restored the version from " + new Date(v.at).toLocaleDateString(), undoable(snap));
      });
      li.appendChild(tx); li.appendChild(b); ul.appendChild(li);
    });
    body.appendChild(ul);
    handle = SDT.modal.open({ title: "Version history - " + a.id, body: body, size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }

  function setQuery(q) { state.query = q || ""; }

  function toggleFavorite(id) {
    var kb = all();
    kb.forEach(function (a) { if (a.id === id) a.favorite = !a.favorite; });
    store.set("kb", kb);
    renderAll();
  }
  function openArticle(id) {
    state.selectedId = id; state.jump = true;
    var recent = store.get("recent", []).filter(function (x) { return x !== id; });
    recent.unshift(id);
    store.set("recent", recent.slice(0, 10));
    renderAll();
  }

  function starButton(a) {
    var b = el("button", "icon-btn" + (a.favorite ? " on" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", a.favorite ? "true" : "false");
    b.setAttribute("aria-label", (a.favorite ? "Remove " : "Add ") + a.id + (a.favorite ? " from favorites" : " to favorites"));
    b.title = a.favorite ? "Remove from favorites" : "Add to favorites";
    b.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-star"/></svg>'; // static markup only
    b.addEventListener("click", function (e) { e.stopPropagation(); toggleFavorite(a.id); });
    return b;
  }

  function resultItem(r, query) {
    var a = r.article;
    var li = el("li", "result" + (a.id === state.selectedId ? " selected" : ""));
    var main = el("button", "result-main");
    main.type = "button";
    main.addEventListener("click", function () { openArticle(a.id); });

    var title = el("div", "result-title");
    title.appendChild(el("span", "kb-id", a.id));
    var t = el("span", "");
    S.highlight(t, a.title, query);
    title.appendChild(t);
    main.appendChild(title);

    var meta = el("div", "result-meta");
    meta.appendChild(document.createTextNode(a.category + (a.subcategory ? " / " + a.subcategory : "")));
    if (r.via && r.via.length) {
      meta.appendChild(document.createTextNode(" - matches: "));
      var v = el("span", "");
      S.highlight(v, r.via.join(", "), query);
      meta.appendChild(v);
    }
    main.appendChild(meta);
    li.appendChild(main);
    li.appendChild(starButton(a));
    return li;
  }

  function related(a) {
    var kb = all();
    var out = (a.related || []).map(byId).filter(Boolean);
    if (!out.length) out = kb.filter(function (x) { return x.id !== a.id && x.category === a.category; }).slice(0, 3);
    return out;
  }

  /* A step that mentions another KI ("go to KB-002") becomes a clickable branch. */
  function stepWithBranches(li, text) {
    var re = /\bKB-\d{3,}\b/g, last = 0, m;
    while ((m = re.exec(text))) {
      li.appendChild(document.createTextNode(text.slice(last, m.index)));
      var target = byId(m[0]);
      if (target) {
        var b = el("button", "link-btn", m[0]); b.type = "button"; b.title = target.title;
        (function (id) { b.addEventListener("click", function () { openArticle(id); }); })(m[0]);
        li.appendChild(b);
      } else li.appendChild(document.createTextNode(m[0]));
      last = m.index + m[0].length;
    }
    li.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ---- Create / edit form ---- */
  function nextId() {
    var max = 0;
    all().forEach(function (a) { var m = /^KB-(\d+)$/.exec(a.id); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    var n = max + 1;
    return "KB-" + (n < 10 ? "00" : n < 100 ? "0" : "") + n;
  }
  function categories() {
    var map = {}, order = [];
    (global.SDT_CATEGORIES || []).forEach(function (c) { map[c.name] = (c.subcategories || []).slice(); order.push(c.name); });
    all().forEach(function (a) {
      if (!a.category) return;
      if (!map[a.category]) { map[a.category] = []; order.push(a.category); }
      if (a.subcategory && map[a.category].indexOf(a.subcategory) === -1) map[a.category].push(a.subcategory);
    });
    return { order: order, map: map };
  }
  var csv = window.SDT.dom.csv;

  function openEditor(ed) {
    if (SDT.modal.isOpen()) return;
    var a = ed.mode === "edit" ? byId(ed.id) : null;
    if (ed.mode === "edit" && !a) return;
    var src;
    if (a) src = a;
    else if (ed.from && byId(ed.from)) { // duplicate
      var o = JSON.parse(JSON.stringify(byId(ed.from)));
      o.id = nextId(); o.title = o.title + " (copy)"; o.favorite = false; o.reviewed = "";
      src = o;
    } else src = { id: nextId(), title: "", category: "", subcategory: "", keywords: [], synonyms: [], steps: [], related: [], notes: "", reviewed: "", template: { description: "" } };
    if (ed.draft) src = Object.assign(src, ed.draft);
    var cats = categories();
    var form = el("div", "kb-form");

    function field(labelText, control, id, hint) {
      var w = el("div", "");
      var l = el("label", "", labelText); l.htmlFor = id; control.id = id;
      w.appendChild(l); w.appendChild(control);
      if (hint) w.appendChild(el("p", "empty small", hint));
      return w;
    }
    function input(val, type) { var i = el("input", ""); i.type = type || "text"; i.value = val || ""; i.autocomplete = "off"; return i; }
    function area(val, rows) { var t = el("textarea", ""); t.value = val || ""; t.rows = rows || 4; return t; }

    var fId = input(src.id); fId.readOnly = ed.mode === "edit";
    var fTitle = input(src.title);
    var fCat = el("select", "");
    cats.order.forEach(function (c) { var op = el("option", "", c); op.value = c; fCat.appendChild(op); });
    if (src.category && cats.order.indexOf(src.category) === -1) { var o2 = el("option", "", src.category); o2.value = src.category; fCat.appendChild(o2); }
    fCat.value = src.category || cats.order[0] || "";
    var fSub = input(src.subcategory); fSub.setAttribute("list", "kf-sub-list");
    var dl = el("datalist", ""); dl.id = "kf-sub-list";
    function fillSubs() {
      dl.innerHTML = "";
      (cats.map[fCat.value] || []).forEach(function (s2) { var op = document.createElement("option"); op.value = s2; dl.appendChild(op); });
    }
    fillSubs(); fCat.addEventListener("change", fillSubs);
    var fKw = input((src.keywords || []).join(", "));
    var fSyn = input((src.synonyms || []).join(", "));
    var fSteps = area((src.steps || []).join("\n"), 8);
    var fDesc = area(src.template && src.template.description, 3);
    var fRel = input((src.related || []).join(", "));
    var fNotes = area(src.notes, 3);
    var fRev = input(src.reviewed, "date");
    var fAsk = area((src.questions || []).join("\n"), 4);

    var r1 = el("div", "two");
    r1.appendChild(field("KB ID", fId, "kf-id", ed.mode === "new" ? "Suggested automatically." : "The ID cannot be changed."));
    r1.appendChild(field("Title", fTitle, "kf-title"));
    form.appendChild(r1);
    var r2 = el("div", "two");
    r2.appendChild(field("Category", fCat, "kf-cat"));
    r2.appendChild(field("Subcategory", fSub, "kf-sub"));
    form.appendChild(r2);
    form.appendChild(dl);
    form.appendChild(field("Keywords", fKw, "kf-kw", "Comma separated. These are searched."));
    form.appendChild(field("Synonyms and aliases", fSyn, "kf-syn", "Comma separated, e.g. words users actually say."));
    form.appendChild(field("Troubleshooting steps", fSteps, "kf-steps", "One step per line, in order. Mention another KI (for example \u201Cgo to KB-002\u201D) to create a one-click branch. Put a command in backticks, like `ipconfig /flushdns`, to give it a Copy button."));
    form.appendChild(field("Ticket description", fDesc, "kf-desc",
      "Pre-fills the ticket. Placeholders: {{employeeName}} {{adUserId}} {{hostname}} {{timeZone}} {{articleTitle}}"));
    form.appendChild(field("Related KB IDs", fRel, "kf-rel", "Comma separated, e.g. KB-002, KB-003."));
    var r3 = el("div", "two");
    r3.appendChild(field("Internal notes", fNotes, "kf-notes", "For you only. Never copied into tickets."));
    r3.appendChild(field("Last reviewed", fRev, "kf-rev", "Articles not reviewed for 6 months are flagged."));
    form.appendChild(r3);
    form.appendChild(field("Questions to ask the user", fAsk, "kf-ask", "One question per line. They appear beside your notes when this KI is applied to a ticket."));
    var err = el("p", "form-error", ""); err.hidden = true;
    form.appendChild(err);

    function snapshot() { return JSON.stringify([fId.value, fTitle.value, fCat.value, fSub.value, fKw.value, fSyn.value, fSteps.value, fDesc.value, fRel.value, fNotes.value, fRev.value, fAsk.value]); }
    var initial = snapshot();
    function fail(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); return false; }

    var secState = { ok: false };
    SDT.modal.open({
      title: ed.mode === "edit" ? "Edit " + src.id : (ed.from ? "Duplicate KI" : "New KI"),
      body: form, size: "lg", initialFocus: fTitle,
      isDirty: function () { return snapshot() !== initial; },
      actions: [
        { label: ed.mode === "edit" ? "Save changes" : "Create KI", kind: "primary", onClick: function (h) {
          var id = fId.value.trim().toUpperCase();
          var title = fTitle.value.trim();
          var steps = fSteps.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
          if (!/^KB-\d{3,}$/.test(id)) return fail("The KB ID must look like KB-001.");
          if (ed.mode === "new" && byId(id)) return fail(id + " already exists.");
          if (!title) return fail("Enter a title.");
          if (!steps.length) return fail("Add at least one troubleshooting step.");
          if (SDT.secrets && !SDT.secrets.gate(secState, [title, steps.join("\n"), fNotes.value, fDesc.value], "this article", h)) return false;
          var desc = fDesc.value.trim() || ("The user {{employeeName}} requested assistance with " + title.toLowerCase() + ".");
          var obj = {
            id: id, title: title, category: fCat.value, subcategory: fSub.value.trim(),
            keywords: csv(fKw.value), synonyms: csv(fSyn.value), steps: steps,
            related: csv(fRel.value.toUpperCase()), favorite: a ? !!a.favorite : false,
            notes: fNotes.value.trim(), reviewed: fRev.value,
            questions: fAsk.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean),
            template: { shortDescription: title + " - {{adUserId}}", description: desc }
          };
          var snap = all();
          var kb = snap.slice();
          if (a) { keepVersion(a, obj); kb = kb.map(function (x) { return x.id === id ? obj : x; }); } else kb.push(obj);
          store.set("kb", kb);
          state.selectedId = id; state.jump = true;
          renderAll();
          toast(a ? id + " updated" : id + " created", undoable(snap));
        } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  /* ---- Delete / merge / review / print ---- */
  function deleteArticle(a) {
    SDT.modal.confirm({ title: "Delete " + a.id + "?", message: a.id + " - " + a.title + "\n\nYou can undo right after, but not later.", confirmLabel: "Delete KI", danger: true })
      .then(function (ok) {
        if (!ok) return;
        var snap = all();
        var kb = snap.filter(function (x) { return x.id !== a.id; }).map(function (x) {
          var c = JSON.parse(JSON.stringify(x));
          if (c.related) c.related = c.related.filter(function (r) { return r !== a.id; });
          return c;
        });
        store.set("kb", kb);
        state.selectedId = null;
        renderAll();
        toast(a.id + " deleted", undoable(snap));
      });
  }
  function mergeInto(a) {
    SDT.modal.prompt({
      title: "Merge a KI into " + a.id,
      message: "Its steps, keywords and synonyms are added to " + a.id + ", then the other KI is deleted.",
      label: "KB ID of the KI to merge", placeholder: "KB-002", confirmLabel: "Merge"
    }).then(function (other) {
      if (!other) return;
      other = other.trim().toUpperCase();
      var b = byId(other);
      if (!b) { toast(other + " was not found"); return; }
      if (b.id === a.id) { toast("Choose a different KI"); return; }
      function union(x, y) { var out = (x || []).slice(); (y || []).forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); }); return out; }
      var snap = all();
      var kb = snap.filter(function (x) { return x.id !== b.id; }).map(function (x) {
        var c = JSON.parse(JSON.stringify(x));
        if (c.id === a.id) {
          c.steps = union(c.steps, b.steps); c.keywords = union(c.keywords, (b.keywords || []).concat([b.title.toLowerCase()]));
          c.synonyms = union(c.synonyms, b.synonyms); c.favorite = c.favorite || b.favorite;
          c.notes = [c.notes, b.notes].filter(Boolean).join("\n");
          keepVersion(a, c);
        }
        if (c.related) c.related = c.related.filter(function (r) { return r !== b.id; });
        return c;
      });
      store.set("kb", kb);
      renderAll();
      toast(b.id + " merged into " + a.id, undoable(snap));
    });
  }
  function markReviewed(a) {
    var snap = all();
    store.set("kb", snap.map(function (x) { var c = JSON.parse(JSON.stringify(x)); if (c.id === a.id) c.reviewed = today(); return c; }));
    renderAll();
    toast(a.id + " marked as reviewed", undoable(snap));
  }
  function printArticle() {
    document.body.classList.add("print-kb");
    global.onafterprint = function () { document.body.classList.remove("print-kb"); global.onafterprint = null; };
    global.print();
    setTimeout(function () { document.body.classList.remove("print-kb"); }, 1500);
  }

  function menuItem(label, fn, danger) {
    var b = el("button", "menu-item" + (danger ? " danger" : ""), label);
    b.type = "button";
    b.addEventListener("click", function () { var d = b.closest("details"); if (d) d.open = false; fn(); });
    return b;
  }

  function renderDetail() {
    var box = $("kb-detail");
    box.innerHTML = "";
    var a = state.selectedId && byId(state.selectedId);
    if (box.parentNode) box.parentNode.classList.toggle("is-empty", !a);
    if (!a) { box.appendChild(el("p", "empty", "Select an article to see its procedure, or create a new KI.")); return; }

    var head = el("div", "detail-head");
    head.appendChild(el("h2", "", a.id + " - " + a.title));
    var tools = el("div", "detail-tools");
    var ap = el("button", "btn btn-sm", "Apply to ticket"); ap.type = "button";
    ap.addEventListener("click", function () { if (SDT.ticket.applyKi(a.id)) global.location.hash = "#ticket"; });
    var ed = el("button", "btn btn-ghost btn-sm", "Edit"); ed.type = "button";
    ed.addEventListener("click", function () { openEditor({ mode: "edit", id: a.id }); });
    var more = el("details", "more");
    more.appendChild(el("summary", "btn btn-ghost btn-sm", "More"));
    var menu = el("div", "more-menu");
    menu.appendChild(menuItem("Duplicate", function () { openEditor({ mode: "new", from: a.id }); }));
    menu.appendChild(menuItem("Merge another KI into this one...", function () { mergeInto(a); }));
    menu.appendChild(menuItem("Mark as reviewed today", function () { markReviewed(a); }));
    var nv = (hist()[a.id] || []).length;
    menu.appendChild(menuItem("Version history" + (nv ? " (" + nv + ")" : "") + "...", function () { openHistory(a); }));
    menu.appendChild(menuItem("Export this KI to share", function () { exportKb([a]); }));
    menu.appendChild(menuItem("Print", printArticle));
    menu.appendChild(menuItem("Delete", function () { deleteArticle(a); }, true));
    more.appendChild(menu);
    var xb = el("button", "icon-close", "\u00D7"); xb.type = "button"; xb.setAttribute("aria-label", "Close article"); xb.title = "Close (Esc)";
    xb.addEventListener("click", closeArticle);
    tools.appendChild(ap); tools.appendChild(ed); tools.appendChild(more); tools.appendChild(starButton(a)); tools.appendChild(xb);
    head.appendChild(tools);
    box.appendChild(head);

    var meta = el("p", "result-meta", a.category + (a.subcategory ? " / " + a.subcategory : ""));
    box.appendChild(meta);
    var rev = el("p", "result-meta review", a.reviewed ? "Last reviewed: " + a.reviewed : "Not reviewed yet");
    if (isStale(a)) { var badge = el("span", "badge-stale", "Needs review"); rev.appendChild(document.createTextNode(" ")); rev.appendChild(badge); }
    box.appendChild(rev);

    box.appendChild(el("h3", "", "Troubleshooting procedure"));
    var ol = el("ol", "steps");
    (a.steps || []).forEach(function (s) { var li = el("li", ""); SDT.cmd.render(li, s, stepWithBranches); ol.appendChild(li); });
    box.appendChild(ol);

    if (a.questions && a.questions.length) {
      box.appendChild(el("h3", "", "Ask the user"));
      var qul = el("ul", "plain-list"); a.questions.forEach(function (q) { qul.appendChild(el("li", "", q)); }); box.appendChild(qul);
    }
    if (a.template && a.template.description) {
      box.appendChild(el("h3", "", "Ticket description"));
      box.appendChild(el("p", "result-meta", a.template.description));
    }
    if (a.notes) {
      box.appendChild(el("h3", "", "Internal notes"));
      box.appendChild(el("p", "result-meta pre-line", a.notes));
    }

    var tags = (a.keywords || []).concat(a.synonyms || []);
    if (tags.length) {
      box.appendChild(el("h3", "", "Keywords and aliases"));
      var wrap = el("div", "tags");
      tags.forEach(function (t) { wrap.appendChild(el("span", "tag", t)); });
      box.appendChild(wrap);
    }

    var rel = related(a);
    if (rel.length) {
      box.appendChild(el("h3", "", "Related articles"));
      var ul = el("ul", "related");
      rel.forEach(function (r) {
        var li = el("li", "");
        var b = el("button", "link-btn", r.id + " - " + r.title);
        b.type = "button";
        b.addEventListener("click", function () { openArticle(r.id); });
        li.appendChild(b);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    var sc = SDT.scripts ? SDT.scripts.forKi(a.id) : [];
    if (sc.length) {
      box.appendChild(el("h3", "", "Scripts for this article"));
      var sl = el("ul", "related");
      sc.forEach(function (s) {
        var li = el("li", "kb-script");
        li.appendChild(el("span", "kb-script-name", s.title));
        function b(label, kind, fn) { var x = el("button", "btn btn-sm " + kind, label); x.type = "button"; x.addEventListener("click", fn); li.appendChild(x); }
        b(s.type === "run" ? "Copy command" : s.type === "regpath" ? "Copy path" : "Copy code", "", function () { SDT.scripts.copy(s); });
        if (!SDT.scripts.typeOf(s).noFile) b("Download", "", function () { SDT.scripts.download(s); });
        b("Open in library", "btn-ghost", function () { SDT.scripts.show(s.id); global.location.hash = "#scripts"; });
        sl.appendChild(li);
      });
      box.appendChild(sl);
    }

    var fw = SDT.flows ? SDT.flows.forKi(a.id) : [];
    if (fw.length) {
      box.appendChild(el("h3", "", "Question flows that lead here"));
      var fl = el("ul", "related");
      fw.forEach(function (f) {
        var li = el("li", ""), b = el("button", "link-btn", f.title); b.type = "button";
        b.addEventListener("click", function () { SDT.flows.show(f.id); global.location.hash = "#flows"; });
        li.appendChild(b); fl.appendChild(li);
      });
      box.appendChild(fl);
    }
  }
  function closeArticle() { state.selectedId = null; renderKb(); }

  function renderAll() {
    renderKb();
    renderFavorites();
    if (SDT.app) SDT.app.renderDashboard();
  }

  function renderKb() {
    var kb = all();
    var q = state.query.trim();
    var results = q ? S.search(q, kb) :
      kb.slice().sort(function (x, y) { return x.id.localeCompare(y.id); }).map(function (a) { return { article: a, score: 0, via: [] }; });

    var stale = kb.filter(isStale).length;
    $("kb-summary").textContent = q
      ? (results.fuzzy ? "No exact match for \u201C" + q + "\u201D. Showing " + results.length + " close " + (results.length === 1 ? "match." : "matches.")
        : results.length + (results.length === 1 ? " result for \u201C" : " results for \u201C") + q + "\u201D")
      : kb.length + " articles." + (stale ? " " + stale + " not reviewed in 6 months." : "") + " Type in the search bar to filter.";

    var ul = $("kb-results");
    ul.innerHTML = "";
    if (!results.length) ul.appendChild(el("li", "empty", "No articles match. Try a synonym, a KB ID, or a category name."));
    // paging: back to page 1 when the search changes; jump to the page of an article that was just opened
    kbPager = kbPager || SDT.pager.create({ onChange: renderKb });
    var at = -1;
    if (state.jump && state.selectedId) { results.some(function (r, i) { if (r.article.id === state.selectedId) { at = i; return true; } return false; }); }
    state.jump = false;
    kbPager.slice(results, q, at).forEach(function (r) { ul.appendChild(resultItem(r, q)); });
    kbPager.mount(ul);
    renderDetail();
  }

  function renderFavorites() {
    var ul = $("favorites-list");
    if (!ul) return;
    ul.innerHTML = "";
    var favs = all().filter(function (a) { return a.favorite; });
    if (!favs.length) { ul.appendChild(el("li", "empty", "No favorites yet. Select the star on any article.")); return; }
    favPager = favPager || SDT.pager.create({ onChange: renderFavorites });
    favPager.slice(favs, "favorites").forEach(function (a) {
      var li = resultItem({ article: a, via: [] }, "");
      li.querySelector(".result-main").addEventListener("click", function () { global.location.hash = "#kb"; });
      ul.appendChild(li);
    });
    favPager.mount(ul);
  }

  /* ---- Import / export the Knowledge Base on its own (to share KIs) ---- */
  function exportKb(list) {
    var items = Array.isArray(list) ? list : all();
    var name = items.length === 1 ? items[0].id : "kb";
    SDT.app.download("service-desk-toolkit-" + name + "-" + today() + ".json",
      JSON.stringify({ app: "service-desk-toolkit", type: "kb", exportedAt: new Date().toISOString(), articles: items }, null, 2), "application/json");
    toast(items.length === 1 ? items[0].id + " exported - share the file" : "Knowledge Base exported (" + items.length + " articles)");
  }
  function cleanArticle(x) {
    if (!x || typeof x.id !== "string" || typeof x.title !== "string" || !Array.isArray(x.steps)) return null;
    function strs(v) { return (Array.isArray(v) ? v : []).map(String).filter(Boolean); }
    var id = x.id.trim().toUpperCase();
    if (!/^KB-\d{3,}$/.test(id) || !x.title.trim()) return null;
    var steps = strs(x.steps); if (!steps.length) return null;
    var desc = x.template && typeof x.template.description === "string" ? x.template.description : "";
    return { id: id, title: x.title.trim(), category: String(x.category || ""), subcategory: String(x.subcategory || ""),
      keywords: strs(x.keywords), synonyms: strs(x.synonyms), steps: steps, related: strs(x.related), favorite: !!x.favorite,
      questions: strs(x.questions), notes: String(x.notes || ""), reviewed: /^\d{4}-\d{2}-\d{2}$/.test(x.reviewed || "") ? x.reviewed : "",
      template: { shortDescription: x.title.trim() + " - {{adUserId}}", description: desc } };
  }
  function importKb(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast("That file is not valid JSON"); return; }
      var raw = Array.isArray(obj) ? obj : (obj && obj.articles);
      if (!Array.isArray(raw)) { toast("No Knowledge Base articles found in that file"); return; }
      var incoming = raw.map(cleanArticle).filter(Boolean);
      if (!incoming.length) { toast("No valid articles found in that file"); return; }
      var snap = all(), index = {};
      snap.forEach(function (x) { index[x.id] = x; });
      var rows = incoming.map(function (x) {
        var mine = index[x.id];
        if (!mine) return { a: x, status: "new", fields: [] };
        var f = changedFields(mine, x);
        return { a: x, status: f.length ? "changed" : "same", fields: f };
      });
      var cnt = { "new": 0, changed: 0, same: 0 };
      rows.forEach(function (r) { cnt[r.status]++; });
      if (!cnt["new"] && !cnt.changed) { toast("Nothing new in that file - all " + cnt.same + " articles match yours"); return; }
      var body = el("div", "import-preview");
      body.appendChild(el("p", "modal-message", incoming.length + " articles found: " + cnt["new"] + " new, " + cnt.changed + " changed, " + cnt.same + " the same.\n\nChoose what to import. A changed article replaces yours, and your version is kept in its version history."));
      var tools = el("div", "btn-row");
      function setAll(v) { rows.forEach(function (r) { if (r.status !== "same") r.cb.checked = v; }); }
      var all1 = el("button", "btn btn-ghost btn-sm", "Select all"); all1.type = "button"; all1.addEventListener("click", function () { setAll(true); });
      var none1 = el("button", "btn btn-ghost btn-sm", "Select none"); none1.type = "button"; none1.addEventListener("click", function () { setAll(false); });
      tools.appendChild(all1); tools.appendChild(none1); body.appendChild(tools);
      var ul = el("ul", "import-list");
      rows.forEach(function (r) {
        var li = el("li"), lab = el("label", "check"), cb = el("input");
        cb.type = "checkbox"; cb.checked = r.status !== "same"; cb.disabled = r.status === "same"; r.cb = cb;
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + r.a.id + " - " + r.a.title + " "));
        lab.appendChild(el("span", "tag", r.status === "new" ? "New" : r.status === "changed" ? "Changed: " + r.fields.join(", ") : "Same"));
        li.appendChild(lab); ul.appendChild(li);
      });
      body.appendChild(ul);
      SDT.modal.open({
        title: "Import Knowledge Base", size: "lg", body: body,
        actions: [
          { label: "Import selected", kind: "primary", onClick: function () {
              var chosen = rows.filter(function (r) { return r.cb.checked; });
              if (!chosen.length) { toast("Nothing is selected"); return false; }
              var kb = snap.slice(), pos = {}, added = 0, replaced = 0;
              kb.forEach(function (x, i) { pos[x.id] = i; });
              chosen.forEach(function (r) {
                if (r.a.id in pos) { var old = kb[pos[r.a.id]]; keepVersion(old, r.a); r.a.favorite = old.favorite || r.a.favorite; kb[pos[r.a.id]] = r.a; replaced++; }
                else { kb.push(r.a); added++; }
              });
              store.set("kb", kb); renderAll();
              toast("Imported: " + added + " new, " + replaced + " replaced", undoable(snap));
            } },
          { label: "Cancel", kind: "ghost", cancel: true }
        ]
      });
    };
    reader.onerror = function () { toast("Could not read that file"); };
    reader.readAsText(file);
  }

  function init() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !state.selectedId || !$("view-kb").classList.contains("active")) return;
      if (SDT.modal.isOpen()) return;
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      closeArticle();
    });
    $("kb-new").addEventListener("click", function () { openEditor({ mode: "new" }); });
    $("kb-export").addEventListener("click", function () { exportKb(); });
    $("kb-import").addEventListener("click", function () { $("kb-file").click(); });
    $("kb-file").addEventListener("change", function (e) { importKb(e.target.files[0]); e.target.value = ""; });
  }

  SDT.kb = { init: init, setQuery: setQuery, render: renderKb, renderFavorites: renderFavorites, openArticle: openArticle, openEditor: openEditor, importFile: importKb };
})(window);
