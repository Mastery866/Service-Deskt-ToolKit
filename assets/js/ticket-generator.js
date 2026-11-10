/* ticket-generator.js - Ticket workflow.
   Several tickets open at once (tabs). Per ticket: type the user details, temporary notes (always-visible side panel),
   templates, KI picker (modal) / auto-suggest, steps with branches and collapsible groups, extra steps, outcome,
   follow-up reminder, call timer, sticky copy bar, and a review modal (previews + pre-copy checklist). */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage, S = SDT.search, M = SDT.modal;
  var KEY = "ticketTabs";
  var MAX_TABS = 8;
  var REQUIRED = [["tk-userid", "userId", "User ID"], ["tk-username", "userName", "User Name"],
                  ["tk-host", "host", "Machine Hostname"], ["tk-short", "shortDesc", "Short Description"]];
  var FINAL = [["identity", "tk-f-identity", "Identity verified"], ["informed", "tk-f-informed", "User told the outcome"],
               ["reviewed", "tk-f-reviewed", "Fields reviewed"]];
  var SENSITIVE = /\b(password|passwd|pwd|passcode|secret|token)\b\s*(is|was|=|:)\s*\S+/i;

  var tabs = [], activeId = null, state = null;
  var pickerRefresh = null; // set while the KI picker is open

  function uid() { return window.SDT.dom.uid("t"); }
  function blank() {
    var d = SDT.settings.values(), last = store.get("lastUsed", {}) || {};
    var tz = d.rememberTz && last.tz ? last.tz : d.tz;
    var outcome = d.rememberOutcome && last.outcome ? last.outcome : d.outcome;
    return { id: uid(), userId: "", userName: "", host: "", tz: tz, issue: "", said: "", notes: "", escalation: null, asked: {}, guided: false,
             shortDesc: "", desc: "", shortEdited: false, descEdited: false, aiReply: "",
             kis: [], custom: [], outcome: outcome, outcomeNote: "", followUp: "", stamp: false,
             timerMs: 0, timerStart: null, timerInclude: false,
             final: { identity: false, informed: false, reviewed: false }, savedId: null };
  }
  function normalize(t) {
    var n = Object.assign(blank(), t);
    if (!Array.isArray(n.kis)) n.kis = [];
    if (!Array.isArray(n.custom)) n.custom = [];
    n.final = Object.assign({ identity: false, informed: false, reviewed: false }, t.final || {});
    return n;
  }
  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function kbAll() { var k = store.get("kb", []); return Array.isArray(k) ? k : []; }
  function save() {
    store.set(KEY, { active: activeId, tabs: tabs });
    var s = $("tk-saved"); if (s) s.textContent = "Draft kept in this browser at " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  var toast = window.SDT.dom.toast;
  function hasKi(id) { return state.kis.some(function (k) { return k.id === id; }); }
  function label(k) { return k.id + " - " + k.title; }
  function isDone(s) { return s.done; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function nowHm() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function setDone(s, v) { s.done = !!v; if (v) s.at = nowHm(); else delete s.at; }
  function dirty(t) { return !!(t.userId || t.userName || t.host || t.issue || t.notes || t.kis.length || t.custom.length || (t.flow && t.flow.path && t.flow.path.length) || String(t.said || "").trim()); }

  /* ---- Placeholders: {{employeeName}}, {{adUserId}}, {{hostname}}, {{timeZone}}, {{articleTitle}} ---- */
  function fill(tpl, title) {
    var map = { employeeName: state.userName.trim(), adUserId: state.userId.trim(), hostname: state.host.trim(),
                timeZone: state.tz.trim(), articleTitle: title };
    return String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return k in map ? map[k] : ""; })
      .replace(/ {2,}/g, " ").replace(/\s+([.,])/g, "$1").replace(/ - $/, "").trim();
  }

  /* Auto-fill short description and description from the applied KIs, unless the analyst edited them.
     Clearing a field hands control back to auto-fill. */
  function refreshAuto() {
    if (!state.shortEdited) state.shortDesc = state.kis.map(function (k) { return k.title; }).join(" / ");
    if (!state.descEdited) state.desc = state.kis.map(function (k) { return fill(k.tpl, k.title) || k.title; }).join("\n");
    $("tk-short").value = state.shortDesc;
    $("tk-desc").value = state.desc;
  }

  /* ---- Tabs ---- */
  function tabLabel(t, i) { return t.userId.trim() || t.userName.trim() || ("Ticket " + (i + 1)); }
  function renderTabs() {
    var box = $("tk-tabs");
    box.innerHTML = "";
    tabs.forEach(function (t, i) {
      var tab = el("div", "tab" + (t.id === activeId ? " active" : ""));
      tab.setAttribute("role", "presentation");
      var main = el("button", "tab-main", tabLabel(t, i)); main.type = "button";
      main.setAttribute("role", "tab"); main.setAttribute("aria-selected", t.id === activeId ? "true" : "false");
      main.tabIndex = t.id === activeId ? 0 : -1;
      main.title = tabLabel(t, i);
      main.addEventListener("click", function () { switchTab(t.id); });
      main.addEventListener("keydown", function (e) { // arrow keys move between tickets
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!n) return;
        e.preventDefault();
        switchTab(tabs[(i + n + tabs.length) % tabs.length].id);
        var b = $("tk-tabs").querySelector('[aria-selected="true"]'); if (b) b.focus();
      });
      var x = el("button", "tab-x", "\u00D7"); x.type = "button";
      x.title = "Close this ticket"; x.setAttribute("aria-label", "Close ticket " + tabLabel(t, i));
      x.addEventListener("click", function () { closeTab(t.id); });
      tab.appendChild(main); tab.appendChild(x);
      box.appendChild(tab);
    });
    var add = el("button", "tab-add", "+ New"); add.type = "button";
    add.title = "Open another ticket"; add.disabled = tabs.length >= MAX_TABS;
    add.addEventListener("click", addTab);
    box.appendChild(add);
  }
  function switchTab(id) {
    var t = tabs.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    activeId = id; state = t; touched.userId = touched.host = false; guidedUndo = [];
    save(); renderAll();
  }
  function addTab() {
    if (tabs.length >= MAX_TABS) { toast("Close a ticket tab first (max " + MAX_TABS + ")"); return; }
    var t = blank(); tabs.push(t); switchTab(t.id);
  }
  function closeTab(id) {
    function doClose() {
      var i = tabs.map(function (t) { return t.id; }).indexOf(id);
      if (i < 0) return;
      tabs.splice(i, 1);
      if (!tabs.length) tabs.push(blank());
      if (id === activeId) { state = tabs[Math.min(i, tabs.length - 1)]; activeId = state.id; }
      save(); renderAll();
    }
    var t = tabs.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    if (dirty(t)) {
      M.confirm({ title: "Close this ticket?", message: "Anything not saved or copied will be lost.", confirmLabel: "Close ticket", danger: true })
        .then(function (ok) { if (ok) doClose(); });
    } else doClose();
  }

  /* ---- Apply / remove KIs ---- */
  function bump(id) {
    var usage = store.get("usage", {});
    usage[id] = (usage[id] || 0) + 1;
    store.set("usage", usage);
  }
  function applyKi(id, quiet) {
    var a = kbAll().filter(function (x) { return x.id === id; })[0];
    if (!a) return false;
    if (hasKi(id)) { if (!quiet) toast(id + " is already applied"); return true; }
    var tpl = (a.template || global.SDT_DEFAULT_TEMPLATE || {}).description;
    state.kis.push({
      id: a.id, title: a.title, tpl: tpl || "", collapsed: false,
      steps: (a.steps || []).map(function (t) { return { text: t, done: false }; })
    });
    bump(a.id);
    if (!quiet) { save(); renderAll(); toast(a.id + " applied"); }
    return true;
  }
  function removeKi(id) {
    var k = state.kis.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    function doRemove() { state.kis = state.kis.filter(function (x) { return x.id !== id; }); save(); renderAll(); }
    if (k.steps.some(isDone)) {
      M.confirm({ title: "Remove " + id + "?", message: "Its checked steps will be lost.", confirmLabel: "Remove", danger: true })
        .then(function (ok) { if (ok) doRemove(); });
    } else doRemove();
  }

  /* ---- Templates (preset KI combinations) ---- */
  function defaultPresets() {
    var ids = kbAll().map(function (a) { return a.id; });
    function pick(arr) { return arr.filter(function (i) { return ids.indexOf(i) > -1; }); }
    return [
      { id: "p-reset", name: "Password reset", kis: pick(["KB-001"]), outcome: "Resolved", outcomeNote: "" },
      { id: "p-unlock", name: "Account unlock", kis: pick(["KB-002"]), outcome: "Resolved", outcomeNote: "" },
      { id: "p-both", name: "Password reset + unlock", kis: pick(["KB-001", "KB-002"]), outcome: "Resolved", outcomeNote: "" }
    ].filter(function (p) { return p.kis.length; });
  }
  function presets() {
    var p = store.get("presets", null);
    if (!Array.isArray(p)) { p = defaultPresets(); store.set("presets", p); }
    return p;
  }
  function templateButtons(into) {
    into.innerHTML = "";
    var list = presets();
    if (!list.length) into.appendChild(el("span", "empty small", "No templates yet."));
    list.forEach(function (p) {
      var b = el("button", "btn btn-ghost btn-sm", p.name); b.type = "button";
      b.title = (p.kis || []).join(" + ") + (p.outcome ? " - " + p.outcome : "");
      b.addEventListener("click", function () { applyPreset(p); });
      into.appendChild(b);
    });
  }
  function applyPreset(p) {
    var added = 0;
    (p.kis || []).forEach(function (id) { if (!hasKi(id) && applyKi(id, true)) added++; });
    if (p.outcome && !state.outcome) state.outcome = p.outcome;
    if (p.outcomeNote && !state.outcomeNote) state.outcomeNote = p.outcomeNote;
    save(); renderAll();
    toast("Template \u201C" + p.name + "\u201D applied" + (added ? "" : " (KIs were already applied)"));
  }
  function saveTemplate() {
    if (!state.kis.length) { toast("Apply at least one KI first"); return; }
    M.prompt({ title: "Save as template", label: "Template name", value: state.kis.map(function (k) { return k.title; }).join(" + "), confirmLabel: "Save template" })
      .then(function (name) {
        if (!name) return;
        var list = presets().filter(function (p) { return p.name.toLowerCase() !== name.toLowerCase(); });
        list.push({ id: uid(), name: name, kis: state.kis.map(function (k) { return k.id; }), outcome: state.outcome, outcomeNote: state.outcomeNote });
        store.set("presets", list);
        renderAll();
        toast("Template \u201C" + name + "\u201D saved");
      });
  }

  /* ---- KI suggestion from the issue text ---- */
  function renderSuggest() {
    var box = $("tk-suggest");
    box.innerHTML = "";
    var q = (state.issue + " " + (state.said || "")).trim();
    var pick = null;
    if (q.length >= 3) {
      var res = S.search(q, kbAll(), 4);
      if (!res.fuzzy) pick = res.filter(function (r) { return r.score >= 20 && !hasKi(r.article.id); })[0] || null;
    }
    box.hidden = !pick;
    if (!pick) return;
    box.appendChild(el("span", "", "Suggested KI: "));
    box.appendChild(el("strong", "", label(pick.article)));
    var b = el("button", "btn btn-sm", "Apply"); b.type = "button";
    b.setAttribute("aria-label", "Apply suggested KI " + label(pick.article));
    b.addEventListener("click", function () { applyKi(pick.article.id); });
    box.appendChild(b);
  }

  /* ---- KI picker (modal): search, preview steps, apply several ---- */
  function openPicker() {
    if (M.isOpen()) return;
    var previews = {}, lastResults = [];
    var body = el("div", "picker");
    var ctx = el("p", "empty small", "");
    var input = el("input", ""); input.type = "text"; input.autocomplete = "off";
    input.setAttribute("aria-label", "Search KIs"); input.value = state.issue.trim();
    input.placeholder = "Search by title, keyword, category, or KB ID";
    var tplRow = el("div", "tpl-row");
    tplRow.appendChild(el("span", "tpl-label", "Templates:"));
    var tplList = el("div", "tpl-list"); tplRow.appendChild(tplList);
    var ul = el("ul", "result-list picker-results"); ul.setAttribute("aria-live", "polite");
    [ctx, input, tplRow, ul, el("p", "empty small", "Enter applies the top result. This window stays open so you can add more than one KI.")]
      .forEach(function (n) { body.appendChild(n); });

    function row(a, q) {
      var applied = hasKi(a.id);
      var li = el("li", "result picker-item" + (applied ? " selected" : ""));
      var main = el("div", "result-main");
      var title = el("div", "result-title");
      title.appendChild(el("span", "kb-id", a.id));
      var t = el("span", ""); S.highlight(t, a.title, q); title.appendChild(t);
      main.appendChild(title);
      main.appendChild(el("div", "result-meta", a.category + (a.subcategory ? " / " + a.subcategory : "")));
      li.appendChild(main);
      var act = el("div", "result-actions");
      var pv = el("button", "btn btn-ghost btn-sm", previews[a.id] ? "Hide steps" : "Preview steps"); pv.type = "button";
      pv.setAttribute("aria-expanded", previews[a.id] ? "true" : "false");
      pv.addEventListener("click", function () { previews[a.id] = !previews[a.id]; renderList(); });
      var ap = el("button", "btn btn-sm", applied ? "Applied" : "Apply"); ap.type = "button"; ap.disabled = applied;
      ap.setAttribute("aria-label", (applied ? "Already applied: " : "Apply ") + label(a));
      ap.addEventListener("click", function () { applyKi(a.id); });
      act.appendChild(pv); act.appendChild(ap);
      li.appendChild(act);
      if (previews[a.id]) {
        var box = el("div", "result-preview");
        var ol = el("ol", "steps");
        (a.steps || []).forEach(function (s) { ol.appendChild(el("li", "", s)); });
        box.appendChild(ol); li.appendChild(box);
      }
      return li;
    }
    function renderList() {
      ul.innerHTML = ""; lastResults = [];
      var q = input.value.trim();
      if (!q) {
        var usage = store.get("usage", {});
        var top = kbAll().filter(function (a) { return usage[a.id]; }).sort(function (a, b) { return usage[b.id] - usage[a.id]; }).slice(0, 8);
        if (!top.length) { ul.appendChild(el("li", "empty small", "Type to search the Knowledge Base.")); return; }
        ul.appendChild(el("li", "empty small", "Frequently used KIs"));
        top.forEach(function (a) { lastResults.push(a); ul.appendChild(row(a, "")); });
        return;
      }
      var res = S.search(q, kbAll(), 8);
      if (!res.length) { ul.appendChild(el("li", "empty small", "No KI matches. Try a synonym, a KB ID, or a category name.")); return; }
      if (res.fuzzy) ul.appendChild(el("li", "empty small", "No exact match - showing close matches"));
      res.forEach(function (r) { lastResults.push(r.article); ul.appendChild(row(r.article, q)); });
    }
    pickerRefresh = function () {
      ctx.textContent = "Ticket for " + (state.userId.trim() || "(no user ID yet)") + (state.issue.trim() ? " - " + state.issue.trim() : "") +
        (state.kis.length ? "  |  Applied: " + state.kis.map(function (k) { return k.id; }).join(", ") : "");
      templateButtons(tplList); renderList();
    };
    input.addEventListener("input", renderList);
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var first = lastResults.filter(function (a) { return !hasKi(a.id); })[0];
      if (first) applyKi(first.id);
    });
    M.open({ title: "Find and apply KIs", body: body, size: "lg", initialFocus: input,
             actions: [{ label: "Done", kind: "primary" }], onClose: function () { pickerRefresh = null; } });
    pickerRefresh();
  }

  /* ---- KI Used chips ---- */
  function renderChips() {
    var box = $("tk-ki-used");
    box.innerHTML = "";
    if (!state.kis.length) { box.appendChild(el("span", "empty", "No KI applied yet.")); return; }
    state.kis.forEach(function (k) {
      var c = el("span", "chip", label(k));
      var x = el("button", "", "\u00D7"); x.type = "button";
      x.title = "Remove " + k.id; x.setAttribute("aria-label", "Remove " + label(k));
      x.addEventListener("click", function () { removeKi(k.id); });
      c.appendChild(x);
      box.appendChild(c);
    });
  }

  /* ---- Steps checklist: one collapsible group per KI (with branch buttons), plus additional steps ---- */
  function stepItem(s, i, onToggle, onRemove, ownId) {
    var li = el("li", (s.done ? "done" : "") + (onRemove ? " has-x" : ""));
    var lab = el("label", "");
    var cb = el("input", ""); cb.type = "checkbox"; cb.checked = !!s.done;
    cb.addEventListener("change", function () {
      setDone(s, cb.checked); li.classList.toggle("done", s.done);
      if (onToggle) onToggle();
      save(); renderOutput();
    });
    lab.appendChild(cb);
    var span = el("span", "", (i + 1) + ". ");
    SDT.cmd.render(span, s.text);
    lab.appendChild(span);
    li.appendChild(lab);
    if (onRemove) {
      var x = el("button", "icon-btn", "\u00D7"); x.type = "button"; x.title = "Remove this step"; x.setAttribute("aria-label", "Remove step");
      x.addEventListener("click", onRemove);
      li.appendChild(x);
    }
    var ids = (s.text.match(/\bKB-\d{3,}\b/g) || []).filter(function (id, n, arr) { return arr.indexOf(id) === n && id !== ownId; });
    var kb = kbAll();
    ids.forEach(function (id) {
      var target = kb.filter(function (a) { return a.id === id; })[0];
      if (!target) return;
      var btn = el("button", "branch-btn", hasKi(id) ? id + " applied" : "+ Apply " + id + " - " + target.title);
      btn.type = "button"; btn.disabled = hasKi(id);
      btn.addEventListener("click", function () { applyKi(id); });
      var wrap = el("div", "branch"); wrap.appendChild(btn); li.appendChild(wrap);
    });
    return li;
  }
  function kiGroup(k) {
    var group = el("div", "ki-group" + (k.collapsed ? " collapsed" : ""));
    var head = el("div", "ki-group-head");
    var tog = el("button", "group-toggle", k.collapsed ? "\u25B8" : "\u25BE"); tog.type = "button";
    tog.setAttribute("aria-expanded", k.collapsed ? "false" : "true");
    tog.setAttribute("aria-label", (k.collapsed ? "Expand " : "Collapse ") + label(k));
    tog.addEventListener("click", function () { k.collapsed = !k.collapsed; save(); renderSteps(); });
    head.appendChild(tog);
    head.appendChild(el("span", "ki-group-title", label(k)));
    var prog = el("span", "ki-progress");
    function updateProg() { prog.textContent = k.steps.filter(isDone).length + "/" + k.steps.length + " done"; }
    updateProg();
    head.appendChild(prog);
    var all = el("button", "btn btn-ghost btn-sm", "Check all"); all.type = "button";
    all.setAttribute("aria-label", "Check all steps of " + k.id);
    all.addEventListener("click", function () {
      var target = !k.steps.every(isDone);
      k.steps.forEach(function (s) { setDone(s, target); });
      save(); renderSteps(); renderOutput();
    });
    head.appendChild(all);
    group.appendChild(head);
    if (!k.collapsed) {
      var ul = el("ul", "checklist");
      k.steps.forEach(function (s, i) { ul.appendChild(stepItem(s, i, updateProg, null, k.id)); });
      group.appendChild(ul);
    }
    return group;
  }
  function customGroup() {
    var group = el("div", "ki-group");
    var head = el("div", "ki-group-head");
    head.appendChild(el("span", "ki-group-title", "Additional steps"));
    group.appendChild(head);
    var ul = el("ul", "checklist");
    state.custom.forEach(function (s, i) {
      ul.appendChild(stepItem(s, i, null, function () { state.custom.splice(i, 1); save(); renderSteps(); renderOutput(); }, null));
    });
    if (ul.childNodes.length) group.appendChild(ul);
    var row = el("div", "add-row");
    var inp = el("input", ""); inp.type = "text"; inp.id = "tk-custom-input"; inp.autocomplete = "off";
    inp.setAttribute("aria-label", "Add an additional step");
    inp.placeholder = "Add a step you performed, e.g. Escalated to the network team";
    var add = el("button", "btn btn-ghost btn-sm", "Add"); add.type = "button";
    function commit() {
      var text = inp.value.trim();
      if (!text) return;
      var s = { text: text }; setDone(s, true);
      state.custom.push(s);
      save(); renderSteps(true); renderOutput();
    }
    add.addEventListener("click", commit);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    row.appendChild(inp); row.appendChild(add);
    group.appendChild(row);
    return group;
  }
  function renderSteps(focusInput) {
    var wrap = $("tk-steps");
    wrap.innerHTML = "";
    if (!state.kis.length) wrap.appendChild(el("p", "empty small", "Apply a KI to load its steps, or add your own steps below."));
    state.kis.forEach(function (k) { wrap.appendChild(kiGroup(k)); });
    wrap.appendChild(customGroup());
    renderGuided(); renderAsk();
    if (focusInput) $("tk-custom-input").focus();
  }

  /* ---- Ask the user: questions stored with each applied KI ---- */
  function questionsFor(k) { var a = kbAll().filter(function (x) { return x.id === k.id; })[0]; return a && Array.isArray(a.questions) ? a.questions : []; }
  function renderAsk() {
    var box = $("tk-ask"), host = $("tk-ask-list");
    if (!state.asked || typeof state.asked !== "object") state.asked = {};
    host.innerHTML = "";
    var groups = state.kis.map(function (k) { return { k: k, q: questionsFor(k) }; }).filter(function (g) { return g.q.length; });
    box.hidden = !groups.length;
    if (!groups.length) return;
    function count() {
      var total = 0, got = 0;
      groups.forEach(function (g) { g.q.forEach(function (q, i) { total++; if (state.asked[g.k.id + "|" + i]) got++; }); });
      $("tk-ask-count").textContent = got + " of " + total + " asked";
    }
    groups.forEach(function (g) {
      host.appendChild(el("p", "ask-ki", label(g.k)));
      var ul = el("ul", "ask-list");
      g.q.forEach(function (q, i) {
        var key = g.k.id + "|" + i, li = el("li"), lab = el("label"), cb = el("input");
        cb.type = "checkbox"; cb.checked = !!state.asked[key];
        cb.addEventListener("change", function () { if (cb.checked) state.asked[key] = true; else delete state.asked[key]; save(); count(); });
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + q)); li.appendChild(lab); ul.appendChild(li);
      });
      host.appendChild(ul);
    });
    count();
  }

  /* ---- Guided mode: one step at a time ---- */
  var guidedUndo = [];
  function allSteps() {
    var out = [];
    state.kis.forEach(function (k) { (k.steps || []).forEach(function (s) { out.push({ s: s, ki: k }); }); });
    (state.custom || []).forEach(function (s) { out.push({ s: s, ki: null }); });
    return out;
  }
  function guidedAct(kind, s) {
    if (kind === "done") setDone(s, true); else s.skipped = true;
    guidedUndo.push({ kind: kind, s: s });
    save(); renderSteps(); renderOutput();
  }
  function renderGuided() {
    var box = $("tk-guided"), steps = $("tk-steps"), tog = $("tk-guided-toggle"), on = !!state.guided;
    tog.setAttribute("aria-pressed", on ? "true" : "false");
    tog.textContent = on ? "Show the full list" : "Guided mode";
    box.hidden = !on; steps.hidden = on;
    if (!on) return;
    box.innerHTML = "";
    var list = allSteps();
    if (!list.length) { box.appendChild(el("p", "empty small", "Apply a KI to load its steps, or show the full list to add your own.")); return; }
    var idx = -1, done = 0, skipped = 0;
    list.forEach(function (x, i) { if (x.s.done) done++; else if (x.s.skipped) skipped++; else if (idx === -1) idx = i; });
    box.appendChild(el("p", "guided-progress", done + " of " + list.length + " done" + (skipped ? ", " + skipped + " skipped" : "")));
    var bar = el("div", "guided-track"); var fill = el("span", "guided-fill"); fill.style.width = Math.round((done + skipped) * 100 / list.length) + "%"; bar.appendChild(fill); box.appendChild(bar);
    var card = el("div", "guided-card");
    if (idx === -1) {
      card.appendChild(el("h3", "", "All steps handled"));
      if (skipped) {
        card.appendChild(el("p", "empty small", skipped + " step" + (skipped === 1 ? " was" : "s were") + " skipped."));
        var again = el("button", "btn btn-sm", "Go back to the skipped steps"); again.type = "button";
        again.addEventListener("click", function () { list.forEach(function (x) { delete x.s.skipped; }); guidedUndo = []; save(); renderGuided(); });
        card.appendChild(again);
      }
    } else {
      var cur = list[idx];
      card.appendChild(el("p", "result-meta", "Step " + (idx + 1) + " of " + list.length + (cur.ki ? " | " + label(cur.ki) : " | Your own steps")));
      var tx = el("p", "guided-text"); SDT.cmd.render(tx, cur.s.text); card.appendChild(tx);
      (cur.s.text.match(/\bKB-\d{3,}\b/g) || []).filter(function (id, n, arr) { return arr.indexOf(id) === n && (!cur.ki || id !== cur.ki.id); }).forEach(function (id) {
        var t = kbAll().filter(function (a) { return a.id === id; })[0]; if (!t) return;
        var b = el("button", "branch-btn", hasKi(id) ? id + " applied" : "+ Apply " + id + " - " + t.title); b.type = "button"; b.disabled = hasKi(id);
        b.addEventListener("click", function () { applyKi(id); }); card.appendChild(b);
      });
      var row = el("div", "btn-row");
      var d = el("button", "btn", "Done"); d.type = "button"; d.addEventListener("click", function () { guidedAct("done", cur.s); });
      var k = el("button", "btn btn-ghost", "Skip"); k.type = "button"; k.addEventListener("click", function () { guidedAct("skip", cur.s); });
      row.appendChild(d); row.appendChild(k); card.appendChild(row);
    }
    var back = el("button", "btn btn-ghost btn-sm", "Back one step"); back.type = "button"; back.disabled = !guidedUndo.length;
    back.addEventListener("click", function () {
      var last = guidedUndo.pop(); if (!last) return;
      if (last.kind === "done") setDone(last.s, false); else delete last.s.skipped;
      save(); renderSteps(); renderOutput();
    });
    card.appendChild(back);
    box.appendChild(card);
  }

  /* ---- Repeat callers: earlier saved tickets for this User ID or hostname ---- */
  function savedTickets() { var t = store.get("tickets", []); return Array.isArray(t) ? t : []; }
  function norm(x) { return String(x || "").trim().toLowerCase(); }
  function repeatMatches() {
    var uid = norm(state.userId), host = norm(state.host), out = { user: [], host: [] };
    savedTickets().forEach(function (t) {
      if (state.savedId && t.id === state.savedId) return;
      if (uid && norm(t.userId) === uid) out.user.push(t);
      if (host && norm(t.hostname) === host) out.host.push(t);
    });
    return out;
  }
  function within30(list) { var cut = Date.now() - 30 * 86400000; return list.filter(function (t) { return new Date(t.createdAt).getTime() >= cut; }); }
  function newestFirst(list) { return list.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString([], { month: "short", day: "numeric" }); }
  function summarize(label, value, list) {
    if (!list.length) return "";
    var r = within30(list), last = newestFirst(list)[0];
    return label + " " + value + ": " + r.length + " ticket" + (r.length === 1 ? "" : "s") + " in the last 30 days (" + list.length + " in total). Last: " +
      (last.shortDescription || "no description") + ", " + shortDate(last.createdAt) + ".";
  }
  function openRepeatList() {
    if (M.isOpen()) return;
    var m = repeatMatches(), seen = {}, all = [];
    m.user.concat(m.host).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = true; all.push(t); } });
    all = newestFirst(all);
    var ul = el("ul", "list"), h;
    all.forEach(function (t) {
      var li = el("li", "follow-item");
      var tx = el("span", "follow-text");
      tx.appendChild(el("strong", "", t.shortDescription || "(no description)"));
      tx.appendChild(el("div", "result-meta", [shortDate(t.createdAt), t.userId, t.hostname, t.outcome].filter(Boolean).join(" | ")));
      var b = el("button", "btn btn-ghost btn-sm", "Open"); b.type = "button"; b.setAttribute("aria-label", "Open ticket " + (t.shortDescription || t.id));
      b.addEventListener("click", function () { if (openSaved(t) && h) h.close(); });
      li.appendChild(tx); li.appendChild(b); ul.appendChild(li);
    });
    h = M.open({ title: "Earlier tickets", body: ul, size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }
  function renderRepeat() {
    var box = $("tk-repeat"), m = repeatMatches();
    var parts = [summarize("User", state.userId.trim(), m.user), summarize("Machine", state.host.trim(), m.host)].filter(Boolean);
    box.innerHTML = ""; box.hidden = !parts.length;
    if (!parts.length) return;
    var hot = within30(m.user).length >= 3 || within30(m.host).length >= 3;
    box.className = "repeat-note" + (hot ? " hot" : "");
    var txt = el("div", "repeat-text");
    if (hot) txt.appendChild(el("p", "repeat-flag", "Repeat issue - look for a recurring cause before closing."));
    parts.forEach(function (p) { txt.appendChild(el("p", "", p)); });
    var b = el("button", "btn btn-ghost btn-sm", "View tickets"); b.type = "button";
    b.addEventListener("click", openRepeatList);
    box.appendChild(txt); box.appendChild(b);
  }

  /* ---- Gentle format reminders for User ID and hostname (never block) ---- */
  var touched = { userId: false, host: false };
  function pattern(key) {
    var p = String(SDT.settings.values()[key] || "").trim();
    if (!p) return null;
    try { return new RegExp(p); } catch (e) { return null; }
  }
  function problem(kind) {
    var v, re;
    if (kind === "userId") {
      v = state.userId.trim(); if (!v) return "";
      if (/\s/.test(v)) return "A User ID has no spaces.";
      re = pattern("userIdPattern");
      if (re && !re.test(v)) return "This does not match your User ID format (see Settings > Defaults).";
    } else {
      v = state.host.trim(); if (!v) return "";
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)) return "A hostname uses letters, numbers, hyphens, dots or underscores - no spaces.";
      re = pattern("hostPattern");
      if (re && !re.test(v)) return "This does not match your hostname format (see Settings > Defaults).";
    }
    return "";
  }
  function renderHints() {
    [["userId", "tk-hint-userid", "tk-userid"], ["host", "tk-hint-host", "tk-host"]].forEach(function (x) {
      var p = touched[x[0]] ? problem(x[0]) : "", n = $(x[1]), inp = $(x[2]);
      n.hidden = !p; n.textContent = p;
      if (p) { inp.setAttribute("aria-invalid", "true"); inp.setAttribute("aria-describedby", x[1]); }
      else { inp.removeAttribute("aria-invalid"); inp.removeAttribute("aria-describedby"); }
    });
  }

  /* ---- Timer ---- */
  function elapsed() { return state.timerMs + (state.timerStart ? Date.now() - state.timerStart : 0); }
  function fmtElapsed(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(s % 60);
  }
  function renderTimer() {
    $("tk-timer-display").textContent = fmtElapsed(elapsed());
    $("tk-timer-toggle").textContent = state.timerStart ? "Pause" : (state.timerMs ? "Resume" : "Start");
    $("tk-timer-include").checked = !!state.timerInclude;
  }
  function toggleTimer() {
    if (state.timerStart) { state.timerMs += Date.now() - state.timerStart; state.timerStart = null; }
    else state.timerStart = Date.now();
    save(); renderTimer(); renderOutput();
  }
  function resetTimer() { state.timerMs = 0; state.timerStart = null; save(); renderTimer(); renderOutput(); }

  /* ---- Output text ---- */
  function ticketText() {
    return [
      "User ID: " + state.userId.trim(),
      "User Name: " + state.userName.trim(),
      "Machine Hostname: " + state.host.trim(),
      "Issue (Short Description): " + state.shortDesc.trim(),
      "Description: " + state.desc.trim(),
      "KI Used: " + state.kis.map(label).join(", "),
      "Time Zone: " + state.tz.trim()
    ].join("\n");
  }
  function stepText(s) { return (state.stamp && s.at ? "[" + s.at + "] " : "") + SDT.cmd.strip(s.text); }
  function sentence(t) { return /[.!?]$/.test(t) ? t : t + "."; }
  function block(name, steps, named) {
    var style = SDT.settings.values().notesStyle;
    var head = "Troubleshooting procedure" + (named ? " (" + name + ")" : "");
    if (style === "bullets") return head + "\n\n" + steps.map(function (s) { return "- " + stepText(s); }).join("\n");
    if (style === "plain") return head + ": " + steps.map(function (s) { return sentence(stepText(s)); }).join(" ");
    return head + "\n\n" + steps.map(function (s, i) { return (i + 1) + ". " + stepText(s); }).join("\n");
  }
  function notesText() {
    var blocks = [];
    state.kis.forEach(function (k) {
      var done = k.steps.filter(isDone);
      if (done.length) blocks.push({ name: label(k), steps: done });
    });
    var cd = state.custom.filter(isDone);
    if (cd.length) blocks.push({ name: "Additional steps", steps: cd });
    var named = state.kis.length > 1 || blocks.length > 1;
    var out = blocks.map(function (b) { return block(b.name, b.steps, named); });
    var qa = SDT.flows ? SDT.flows.notes(state) : "";
    if (qa) out.unshift(qa);
    if (state.outcome) out.push("Outcome: " + state.outcome + (state.outcomeNote.trim() ? " - " + state.outcomeNote.trim() : ""));
    if (state.timerInclude && elapsed() >= 1000) out.push("Time spent: " + Math.max(1, Math.round(elapsed() / 60000)) + " min");
    var cfg = SDT.settings.values();
    if (out.length && cfg.signNotes && cfg.analystName) out.push("Analyst: " + cfg.analystName);
    return out.join("\n\n");
  }
  function setText(id, txt) { var n = $(id); if (n) n.textContent = txt; }

  function renderStatus() {
    var total = 0, done = 0;
    state.kis.forEach(function (k) { total += k.steps.length; done += k.steps.filter(isDone).length; });
    state.custom.forEach(function (s) { total++; if (s.done) done++; });
    var miss = REQUIRED.filter(function (r) { return !String(state[r[1]]).trim(); });
    var n = $("tk-status"), sig = state.kis.length + "|" + done + "/" + total + "|" + miss.map(function (r) { return r[0]; }).join();
    if (n.getAttribute("data-sig") === sig) return;          // only rebuild when something changed, so screen readers are not spammed
    n.setAttribute("data-sig", sig); n.innerHTML = ""; n.classList.remove("warn-text");
    n.appendChild(el("span", "st-chip", state.kis.length + " KI" + (state.kis.length === 1 ? "" : "s")));
    n.appendChild(el("span", "st-chip", done + "/" + total + " steps done"));
    if (miss.length) {
      n.appendChild(el("span", "st-missing", "Still needed to save:"));
      miss.forEach(function (r) {
        var b = el("button", "st-link", r[2]); b.type = "button"; b.setAttribute("aria-label", "Go to " + r[2]);
        b.addEventListener("click", function () { var f = $(r[0]); if (f) { if (f.scrollIntoView) f.scrollIntoView({ block: "center" }); f.focus(); } });
        n.appendChild(b);
      });
    } else n.appendChild(el("span", "st-ready", "Ready to save"));
  }
  function renderOutput() {
    var t = ticketText(), n = notesText() || "Check the completed steps and they will appear here.";
    setText("tk-out-ticket", t); setText("tk-out-notes", n);        // review modal (if open)
    setText("tk-live-ticket", t); setText("tk-live-notes", n);      // live preview column (wide screens)
    renderStatus();
  }

  /* ---- Temporary notes (always-visible side panel) ---- */
  function focusNotes() { $("tk-notes").focus(); }
  function renderNotesIndicator() {
    $("tk-notes-warn").hidden = !SENSITIVE.test(state.notes);
  }

  /* ---- AI rewrite of the temporary notes: copy a prompt, paste the reply, apply it to the ticket ----
     Nothing is sent anywhere by the app. You paste the prompt into an AI tool your company approves. */
  var DEFAULT_AI_PROMPT = [
    "Act as an experienced IT Service Desk Analyst (L1 Support).",
    "",
    "I will provide a raw user-reported issue. Your task is to convert it into a concise, professional, and technically appropriate ServiceNow incident report.",
    "",
    "Follow this format:",
    "",
    "Short Title:",
    "- Create a clear, concise incident title.",
    "- Use professional IT terminology.",
    "- Keep it short and focused on the reported issue.",
    "- Do not assume the root cause.",
    "",
    "Incident Description:",
    "- Rewrite the user's statement into a professional incident description.",
    "- Clearly explain the reported symptoms or behavior.",
    "- State what assistance or investigation is required.",
    "- Use neutral language and avoid making assumptions about the cause.",
    "- Keep the description concise and suitable for ServiceNow.",
    "",
    "Important Guidelines:",
    "- Use third-person wording (e.g., \"The user reported...\").",
    "- Do not invent technical details, troubleshooting steps, or error messages.",
    "- Do not provide troubleshooting instructions unless requested.",
    "- Preserve the original meaning of the user's report.",
    "- Use standard IT Service Desk terminology.",
    "",
    "Reply with only the two sections, using exactly the headings \"Short Title:\" and \"Incident Description:\", in plain text with no extra commentary.",
    "",
    "Example",
    "Raw report: The user is reporting that his machine is having difficulty to run most application and needed assistance to check if the issue if from the software or hardware side.",
    "",
    "Short Title: Application Performance Issues",
    "",
    "Incident Description: The user reported that their machine is experiencing performance issues when running multiple applications. Assistance is required to investigate and determine whether the issue is software-related or hardware-related."
  ].join("\n");

  var REQUEST_PROMPT = DEFAULT_AI_PROMPT
    .replace("convert it into a concise, professional, and technically appropriate ServiceNow incident report.", "convert it into a concise, professional, and technically appropriate ServiceNow service request.")
    .replace("Incident Description:\n- Rewrite the user's statement into a professional incident description.\n- Clearly explain the reported symptoms or behavior.\n- State what assistance or investigation is required.",
             "Request Description:\n- Rewrite the user's statement into a professional request description.\n- Clearly state what the user is asking for.\n- State who or what the request is for, only if the user said so.")
    .replace("Short Title:\n- Create a clear, concise incident title.", "Short Title:\n- Create a clear, concise request title.")
    .replace("Do not assume the root cause.", "Do not assume approvals, ticket numbers or reasons the user did not give.")
    .replace(/Reply with only the two sections[^\n]*/, "Reply with only the two sections, using exactly the headings \"Short Title:\" and \"Request Description:\", in plain text with no extra commentary.")
    .replace(/Example[\s\S]*$/, "");
  var DETAILED_PROMPT = DEFAULT_AI_PROMPT
    .replace("- Keep the description concise and suitable for ServiceNow.", "- Keep the description concise and suitable for ServiceNow.\n- If the user said what they already tried, when it started, how many people are affected or any error message, include each of those facts in one short sentence. Leave them out if the user did not say them.");
  var DEFAULT_AI_PRESETS = [
    { id: "incident", name: "Incident (ServiceNow)", prompt: DEFAULT_AI_PROMPT },
    { id: "detailed", name: "Incident - with impact and what was tried", prompt: DETAILED_PROMPT },
    { id: "request", name: "Service request", prompt: REQUEST_PROMPT.trim() + "\n\nExample\nRaw report: user needs access to the shared finance folder for the new job\n\nShort Title: Shared Folder Access Request\n\nRequest Description: The user requested access to the shared finance folder required for their new role." }
  ];
  function aiPresets() {
    var st = SDT.settings.values();
    if (Array.isArray(st.aiPresets) && st.aiPresets.length) return st.aiPresets;
    var list = DEFAULT_AI_PRESETS.slice();
    if (String(st.aiPrompt || "").trim()) list.push({ id: "custom", name: "My earlier prompt", prompt: String(st.aiPrompt).trim() });
    return list;
  }
  function currentPreset() {
    var list = aiPresets(), id = SDT.settings.values().aiPreset;
    var p = list.filter(function (x) { return x.id === id; })[0];
    if (!p) p = list.filter(function (x) { return x.id === "custom"; })[0] || list[0];
    return p;
  }
  function aiPrompt() { return currentPreset().prompt; }
  function renderAiPresetSelect() {
    var sel = $("tk-ai-preset"), cur = currentPreset();
    sel.innerHTML = "";
    aiPresets().forEach(function (p) { var o = el("option", "", p.name); o.value = p.id; sel.appendChild(o); });
    sel.value = cur.id;
  }

  function copyAiPrompt() {
    var notes = state.notes.trim();
    if (!notes) { toast("Type the user's report in Temporary notes first"); $("tk-notes").focus(); return; }
    SDT.app.copy(aiPrompt() + "\n\nRaw report:\n" + notes, "Prompt copied - paste it into your AI tool, then paste its reply below");
  }

  /* Reads "Short Title:" and "Incident Description:" out of an AI reply (tolerates bold, headings, numbering, quotes). */
  function parseAiReply(raw) {
    var text = String(raw || "").replace(/\r/g, "").replace(/\*\*|__|`/g, "").replace(/^[ \t]*#{1,6}[ \t]*/gm, "").replace(/^[ \t]*>[ \t]?/gm, "");
    var re = /(short\s*title|short\s*description|incident\s*description|request\s*description|issue\s*description)(?:[ \t]*[:\-\u2013\u2014][ \t]*|[ \t]*\n[ \t]*)/ig, marks = [], m;
    while ((m = re.exec(text))) marks.push({ key: /^short/i.test(m[1]) ? "title" : "desc", end: re.lastIndex, start: m.index });
    var seg = {};
    marks.forEach(function (mk, i) {
      if (seg[mk.key] != null) return;
      seg[mk.key] = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : text.length);
    });
    if (seg.title == null || seg.desc == null) return null;
    function tidy(x) {
      x = x.replace(/\s+$/, "");
      x = x.replace(/\n[ \t]*(?:\d+[.)]|[-*\u2022])$/, "");     // a list number or bullet that belonged to the next heading
      x = x.replace(/\n[ \t]*-{3,}$/, "");                      // a divider line
      return x.replace(/[ \t]+$/gm, "").trim();
    }
    var title = tidy(seg.title).replace(/\s*\n\s*/g, " ").replace(/^["'\u201C\u2018]+|["'\u201D\u2019]+$/g, "").trim();
    var desc = tidy(seg.desc).replace(/\n{3,}/g, "\n\n");
    return title && desc ? { title: title, desc: desc } : null;
  }

  function renderAiStatus() {
    var st = $("tk-ai-status"), btn = $("tk-ai-apply"), raw = state.aiReply || "";
    if (!raw.trim()) { st.textContent = "Paste the AI's reply here, then apply it."; st.className = "ai-status"; btn.disabled = true; return; }
    var p = parseAiReply(raw);
    if (!p) { st.textContent = "Could not find both \"Short Title:\" and \"Incident Description:\" in this text."; st.className = "ai-status bad"; btn.disabled = true; return; }
    st.textContent = "Ready: title (" + p.title.length + " characters) and description (" + p.desc.length + " characters)." +
      (p.title.length > 160 ? " The title is long - ServiceNow short descriptions are often limited to 160 characters." : "");
    st.className = "ai-status ok"; btn.disabled = false;
  }

  function applyAiReply() {
    var p = parseAiReply(state.aiReply);
    if (!p) { renderAiStatus(); return; }
    var t = state, prev = { s: t.shortDesc, d: t.desc, se: t.shortEdited, de: t.descEdited, r: t.aiReply };
    function doApply() {
      t.shortDesc = p.title; t.shortEdited = true; t.desc = p.desc; t.descEdited = true; t.aiReply = "";
      save();
      if (state === t) { writeFields(); renderOutput(); renderAiStatus(); renderTabs(); }
      toast("Applied to Short Description and Description", function () {
        t.shortDesc = prev.s; t.desc = prev.d; t.shortEdited = prev.se; t.descEdited = prev.de; t.aiReply = prev.r;
        save();
        if (state === t) { refreshAuto(); writeFields(); renderOutput(); renderAiStatus(); }
      });
    }
    if ((t.shortEdited && t.shortDesc.trim()) || (t.descEdited && t.desc.trim())) {
      M.confirm({ title: "Replace the current Short Description and Description?", message: "Both fields already have text. You can undo right after.", confirmLabel: "Replace" })
        .then(function (ok) { if (ok) doApply(); });
    } else doApply();
  }

  function renderSnippetSelect() {
    var sel = $("tk-snippet"), list = SDT.snippets.list();
    sel.innerHTML = "";
    var first = el("option", "", "Copy a canned response..."); first.value = ""; sel.appendChild(first);
    list.forEach(function (s) { var o = el("option", "", s.title); o.value = s.id; sel.appendChild(o); });
  }

  function renderEmailSelect() {
    var sel = $("tk-email"), list = SDT.email.list();
    sel.innerHTML = "";
    var first = el("option", "", "Write an email..."); first.value = ""; sel.appendChild(first);
    list.forEach(function (t) { var o = el("option", "", t.title); o.value = t.id; sel.appendChild(o); });
  }

  function writeFields() {
    $("tk-ai-reply").value = state.aiReply || "";
    $("tk-userid").value = state.userId; $("tk-username").value = state.userName;
    $("tk-host").value = state.host; $("tk-tz").value = state.tz; $("tk-issue").value = state.issue;
    $("tk-said").value = state.said || ""; $("tk-notes").value = state.notes; $("tk-short").value = state.shortDesc; $("tk-desc").value = state.desc;
    $("tk-outcome").value = state.outcome; $("tk-outcome-note").value = state.outcomeNote;
    $("tk-followup").value = state.followUp;
    $("tk-stamp").checked = !!state.stamp;
    REQUIRED.forEach(function (r) { $(r[0]).classList.remove("invalid"); });
  }
  /* ---- What the user said: their own words feed the flow and KI suggestions ---- */
  function suggestText() { return (state.issue + " " + state.shortDesc + " " + (state.said || "")).trim(); }
  function firstSentence(t) { var s = String(t).split(/[.!?\n]/).map(function (x) { return x.trim(); }).filter(Boolean)[0] || ""; return s.length > 140 ? s.slice(0, 139) + "\u2026" : s; }
  function renderSaid() {
    var box = $("tk-said-hints"), warn = $("tk-said-warn"); if (!box) return;
    if (warn) warn.hidden = !SENSITIVE.test(state.said || "");
    var ta = $("tk-said"); if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(180, Math.max(46, ta.scrollHeight + 2)) + "px"; }
    box.innerHTML = ""; var t = String(state.said || "").trim();
    if (t.length < 4) { box.hidden = true; return; }
    box.hidden = false;
    var text = suggestText(), flows = SDT.flows ? SDT.flows.match(text).slice(0, 3) : [], kis = [];
    var res = S.search(text, kbAll(), 6);
    if (!res.fuzzy) kis = res.filter(function (r) { return r.score >= 20 && !hasKi(r.article.id); }).slice(0, 3);
    var row = el("div", "said-row");
    row.appendChild(el("span", "said-label", flows.length || kis.length ? "Looks like:" : "No match yet. Keep typing, or describe the symptom in a few words."));
    flows.forEach(function (f) {
      var b = el("button", "chip chip-flow", "Flow: " + f.title); b.type = "button"; b.setAttribute("aria-label", "Start the flow " + f.title);
      b.addEventListener("click", function () { if (SDT.shell) SDT.shell.showFlows(); SDT.flows.startOn(f.id); }); row.appendChild(b);
    });
    kis.forEach(function (r) {
      var b = el("button", "chip chip-ki", "KI: " + label(r.article)); b.type = "button"; b.setAttribute("aria-label", "Apply the KI " + label(r.article));
      b.addEventListener("click", function () { applyKi(r.article.id); }); row.appendChild(b);
    });
    box.appendChild(row);
    var act = el("div", "said-actions");
    function a(txt, fn) { var b = el("button", "btn btn-ghost btn-sm", txt); b.type = "button"; b.addEventListener("click", fn); act.appendChild(b); }
    a("Use as issue", function () { state.issue = firstSentence(t); save(); renderAll(); toast("Added to Issue reported"); });
    a("Add to description", function () { state.desc = (state.desc ? state.desc + "\n" : "") + "The user says: \u201C" + t.replace(/\s+/g, " ") + "\u201D"; state.descEdited = true; save(); renderAll(); toast("Added to the description"); });
    a("Clear", function () { state.said = ""; save(); renderAll(); $("tk-said").focus(); });
    box.appendChild(act);
  }

  /* ---- Remember callers: offer the name and hostname from the last ticket for the same User ID ---- */
  function renderCaller() {
    var box = $("tk-caller"); if (!box) return;
    box.innerHTML = ""; box.hidden = true;
    var id = state.userId.trim().toLowerCase(); if (id.length < 3) return;
    var all = store.get("tickets", []); if (!Array.isArray(all)) return;
    var t = all.filter(function (x) { return String(x.userId || "").trim().toLowerCase() === id; })[0];
    if (!t) return;
    var needName = !state.userName.trim() && t.userName, needHost = !state.host.trim() && t.hostname;
    if (!needName && !needHost) return;
    box.hidden = false;
    box.appendChild(el("span", "", "Last ticket for this user: "));
    box.appendChild(el("strong", "", [needName ? t.userName : "", needHost ? t.hostname : ""].filter(Boolean).join(" | ")));
    var b = el("button", "btn btn-sm", "Fill in"); b.type = "button";
    b.addEventListener("click", function () {
      if (needName) state.userName = t.userName; if (needHost) state.host = t.hostname;
      save(); renderAll(); toast("Filled in from the last ticket");
    });
    box.appendChild(b);
  }

  /* ---- The user's local time, worked out from the Time Zone field ---- */
  var TZ_HOURS = { PST: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4, AKST: -9, AKDT: -8, HST: -10, AST: -4, NST: -3.5,
    UTC: 0, GMT: 0, BST: 1, WET: 0, CET: 1, CEST: 2, EET: 2, EEST: 3, MSK: 3, GST: 4, IST: 5.5, PKT: 5, ICT: 7, PHT: 8, PHST: 8, SGT: 8, HKT: 8, AWST: 8,
    JST: 9, KST: 9, PH: 8, SG: 8, HK: 8, JP: 9, KR: 9, ACST: 9.5, AEST: 10, AEDT: 11, NZST: 12, NZDT: 13 };
  var TZ_CITIES = { manila: "Asia/Manila", philippines: "Asia/Manila", singapore: "Asia/Singapore", "hong kong": "Asia/Hong_Kong", tokyo: "Asia/Tokyo", seoul: "Asia/Seoul",
    sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", auckland: "Pacific/Auckland", dubai: "Asia/Dubai", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata",
    london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", "new york": "America/New_York", chicago: "America/Chicago", denver: "America/Denver",
    "los angeles": "America/Los_Angeles", toronto: "America/Toronto", vancouver: "America/Vancouver", johannesburg: "Africa/Johannesburg" };
  function localTimeText(tz) {
    tz = String(tz || "").trim(); if (!tz) return "";
    if (TZ_CITIES[tz.toLowerCase()]) tz = TZ_CITIES[tz.toLowerCase()];
    var up = tz.toUpperCase(), now = new Date();
    var om = /^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(tz);   // UTC+8, GMT-5, +05:30
    if (om) {
      var hrs = (om[1] === "-" ? -1 : 1) * (parseInt(om[2], 10) + (om[3] ? parseInt(om[3], 10) / 60 : 0));
      try { return new Intl.DateTimeFormat([], { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(now.getTime() + hrs * 3600000)); } catch (e) { return ""; }
    }
    try {
      var o = { weekday: "short", hour: "numeric", minute: "2-digit" };
      if (Object.prototype.hasOwnProperty.call(TZ_HOURS, up)) { o.timeZone = "UTC"; return new Intl.DateTimeFormat([], o).format(new Date(now.getTime() + TZ_HOURS[up] * 3600000)); }
      if (tz.indexOf("/") > -1) { o.timeZone = tz; return new Intl.DateTimeFormat([], o).format(now); }
    } catch (e) { return ""; }
    return "";
  }
  function renderLocalTime() {
    var n = $("tk-localtime"); if (!n) return;
    var t = localTimeText(state.tz);
    n.textContent = t ? "Their time now: " + t : "";
  }

  /* ---- Used by the Script Library, checklists and the Knowledge gaps report ---- */
  function logStep(text) {
    state.custom.push({ text: text, done: true, at: nowHm() });
    save(); renderAll(); toast("Added to the work notes: " + text);
  }
  function addCustom(lines) {
    (lines || []).forEach(function (t) { if (String(t).trim()) state.custom.push({ text: String(t).trim(), done: false }); });
    save(); renderAll();
  }
  /* A starting point for a new KI from a finished ticket: the steps that were completed */
  function kiDraft(snap, rec) {
    snap = snap || {}; rec = rec || {};
    var steps = [];
    (snap.kis || []).forEach(function (k) { (k.steps || []).forEach(function (s) { if (s.done) steps.push(SDT.cmd.strip(s.text)); }); });
    (snap.custom || []).forEach(function (s) { if (s.done) steps.push(SDT.cmd.strip(s.text)); });
    var title = String(rec.shortDescription || snap.shortDesc || "").trim();
    var kw = title.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; }).filter(function (w, i, a) { return a.indexOf(w) === i; }).slice(0, 6);
    var qs = snap.flow && Array.isArray(snap.flow.path) ? snap.flow.path.map(function (p) { return p.q; }) : [];
    return { title: title, steps: steps, keywords: kw, questions: qs, notes: "Drafted from ticket" + (rec.id ? " " + rec.id : "") + ". Check each step before saving." };
  }

  /* ---- Probing questions (Question Flows) ---- */
  function renderFlow() {
    var host = $("tk-flow"); if (!host || !SDT.flows) return;
    SDT.flows.mount(host, state, {
      persist: save, changed: function () { renderAll(); },
      applyKi: function (id) { applyKi(id); }, hasKi: hasKi,
      find: function () { openPicker(); },
      issue: function () { return state.issue + " " + state.shortDesc + " " + (state.said || ""); }
    });
  }
  function renderAll() {
    refreshAuto(); writeFields(); renderTabs(); renderFlow(); renderCaller(); renderLocalTime(); renderSaid(); templateButtons($("tk-templates")); renderChips(); renderSteps(); renderSuggest();
    renderOutput(); renderNotesIndicator(); renderTimer(); renderSnippetSelect(); renderEmailSelect(); renderAiPresetSelect(); renderAiStatus(); renderRepeat(); renderHints();
    if (pickerRefresh) pickerRefresh();
  }

  /* ---- Required fields and the pre-copy checklist: remind, never block ---- */
  function checkRequired() {
    var missing = [];
    REQUIRED.forEach(function (r) {
      var empty = !String(state[r[1]]).trim();
      $(r[0]).classList.toggle("invalid", empty);
      if (empty) missing.push(r[2]);
    });
    return missing;
  }
  function copyTicket() {
    var notes = [], missing = checkRequired();
    if (missing.length) notes.push("missing: " + missing.join(", "));
    var open = FINAL.filter(function (f) { return !state.final[f[0]]; }).map(function (f) { return f[2].toLowerCase(); });
    if (open.length) notes.push("not confirmed: " + open.join(", "));
    var fmt = [];
    if (problem("userId")) fmt.push("User ID format");
    if (problem("host")) fmt.push("hostname format");
    if (fmt.length) notes.push("check: " + fmt.join(", "));
    SDT.app.copy(ticketText(), notes.length ? "Copied - " + notes.join(" | ") : "Ticket details copied");
  }
  function copyNotes() { SDT.app.copy(notesText(), "Work notes copied"); }

  /* ---- Review modal: previews, work-notes format, pre-copy checklist ---- */
  function openReview() {
    if (M.isOpen()) return;
    var body = el("div", "review");
    var pre = el("div", "precheck");
    pre.appendChild(el("span", "precheck-title", "Before you copy:"));
    FINAL.forEach(function (f) {
      var lab = el("label", "check");
      var cb = el("input", ""); cb.type = "checkbox"; cb.id = f[1]; cb.checked = !!state.final[f[0]];
      cb.addEventListener("change", function () { state.final[f[0]] = cb.checked; save(); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + f[2]));
      pre.appendChild(lab);
    });
    body.appendChild(pre);

    body.appendChild(el("h3", "", "Ticket details"));
    var p1 = el("pre", "output compact"); p1.id = "tk-out-ticket"; p1.tabIndex = 0; p1.setAttribute("aria-label", "Ticket details preview");
    body.appendChild(p1);

    var fmtRow = el("div", "precheck");
    var fl = el("label", "precheck-title", "Work notes format:"); fl.htmlFor = "tk-notes-style";
    var sel = el("select", "inline-select"); sel.id = "tk-notes-style";
    [["numbered", "Numbered list"], ["bullets", "Bullets"], ["plain", "Plain sentences"]].forEach(function (o) {
      var op = el("option", "", o[1]); op.value = o[0]; sel.appendChild(op);
    });
    sel.value = SDT.settings.values().notesStyle;
    sel.addEventListener("change", function () { SDT.settings.update("notesStyle", sel.value); renderOutput(); });
    fmtRow.appendChild(fl); fmtRow.appendChild(sel);
    body.appendChild(el("h3", "", "Work notes"));
    body.appendChild(fmtRow);
    var p2 = el("pre", "output compact"); p2.id = "tk-out-notes"; p2.tabIndex = 0; p2.setAttribute("aria-label", "Work notes preview");
    body.appendChild(p2);

    var det = el("details", "em-ai");
    det.appendChild(el("summary", "", "Tidy the work notes with AI (optional)"));
    det.appendChild(el("p", "empty small", "Copy the prompt, paste it into your approved AI tool, then paste its reply below. While this dialog is open, Copy work notes uses your pasted version. The ticket itself is not changed."));
    var aiBtn = el("button", "btn btn-ghost btn-sm", "Copy AI prompt"); aiBtn.type = "button";
    var aiBox = el("textarea", ""); aiBox.rows = 6; aiBox.setAttribute("aria-label", "Work notes from the AI tool");
    aiBtn.addEventListener("click", function () {
      var n = notesText();
      if (!n) { toast("Check some steps first - there are no work notes yet"); return; }
      SDT.app.copy("Tidy the following IT Service Desk work notes for a ServiceNow ticket. Keep every step, in the same order, and keep it factual. " +
        "Do not add steps, causes, results or details that are not in the notes. Fix grammar and wording only. Reply with only the notes.\n\n" + n, "Prompt copied - paste the AI's reply below");
    });
    var aiRow = el("div", "btn-row"); aiRow.appendChild(aiBtn);
    det.appendChild(aiRow); det.appendChild(aiBox);
    body.appendChild(det);

    M.open({
      title: "Review before copying", body: body, size: "lg",
      actions: [
        { label: "Copy ticket details", kind: "primary", onClick: function () { copyTicket(); return false; } },
        { label: "Copy work notes", kind: "primary", onClick: function () { if (aiBox.value.trim()) SDT.app.copy(aiBox.value.trim(), "Work notes copied (AI version)"); else copyNotes(); return false; } },
        { label: "Close", kind: "ghost", cancel: true }
      ]
    });
    renderOutput();
  }

  /* ---- Save to history; reopen from history ---- */
  function saveTicket() {
    if (!state.shortDesc.trim() && !state.userId.trim()) { toast("Fill in some details first"); return false; }
    var missing = checkRequired();
    var snap = JSON.parse(JSON.stringify(state));
    snap.notes = ""; snap.said = ""; snap.savedId = null; // temporary notes and what the user said are never saved to history
    snap.timerMs = elapsed(); snap.timerStart = null;
    var tickets = store.get("tickets", []);
    if (!Array.isArray(tickets)) tickets = [];
    var existing = state.savedId ? tickets.filter(function (t) { return t.id === state.savedId; })[0] : null;
    var rec = {
      id: existing ? existing.id : "T" + Date.now(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      shortDescription: state.shortDesc, userId: state.userId, userName: state.userName,
      hostname: state.host, timeZone: state.tz,
      kis: state.kis.map(function (k) { return { id: k.id, title: k.title }; }),
      flow: SDT.flows ? SDT.flows.summary(state) : null,
      outcome: state.outcome, minutes: Math.round(elapsed() / 60000),
      followUp: state.followUp, followUpDone: !!(existing && existing.followUpDone && existing.followUp === state.followUp),
      ticketText: ticketText(), workNotes: notesText(), snapshot: snap
    };
    if (existing) tickets = tickets.map(function (t) { return t.id === rec.id ? rec : t; });
    else tickets.unshift(rec);
    var cap = SDT.history && SDT.history.cap ? SDT.history.cap() : 500, extra = "";
    store.set("tickets", tickets);                       // nothing is removed here; old tickets go only after you confirm a CSV copy
    if (tickets.length > cap) extra = "History is over its limit of " + cap + ". You will be asked before anything is removed";
    else if (tickets.length >= Math.round(cap * 0.9) && !existing) extra = "History is nearly full (" + tickets.length + " of " + cap + ")";
    state.savedId = rec.id; save();
    toast((existing ? "Ticket updated" : "Ticket saved") + (missing.length ? " - missing: " + missing.join(", ") : "") + (extra ? ". " + extra : ""));
    store.set("lastUsed", { tz: state.tz, outcome: state.outcome });
    if (tickets.length > cap && SDT.history) setTimeout(SDT.history.offerArchive, 400);
    if (SDT.app) { SDT.app.renderDashboard(); SDT.app.checkFollowUps(false); }
    if (SDT.backup) SDT.backup.auto("ticket saved");
    return true;
  }
  /* Save, close this tab and open a fresh ticket */
  function saveAndNext() {
    var cur = state;
    if (!saveTicket()) return;
    tabs = tabs.filter(function (x) { return x !== cur; });
    var t = blank(); tabs.push(t); switchTab(t.id);
    toast("Ticket saved - ready for the next one");
    $("tk-userid").focus();
  }
  function openSaved(rec) {
    if (tabs.length >= MAX_TABS) { toast("Close a ticket tab first (max " + MAX_TABS + ")"); return false; }
    var t;
    if (rec.snapshot) t = normalize(rec.snapshot);
    else {
      t = blank();
      t.userId = rec.userId || ""; t.userName = rec.userName || ""; t.host = rec.hostname || ""; t.tz = rec.timeZone || "";
      t.shortDesc = rec.shortDescription || ""; t.shortEdited = true;
      t.kis = (rec.kis || (rec.ki ? [rec.ki] : [])).map(function (k) { return { id: k.id, title: k.title, tpl: "", steps: [] }; });
    }
    t.id = uid(); t.savedId = rec.id; t.notes = ""; t.timerStart = null;
    tabs.push(t);
    switchTab(t.id);
    return true;
  }

  /* ---- Wiring ---- */
  function bind(id, key, after) {
    $(id).addEventListener("input", function (e) {
      state[key] = e.target.value;
      if (e.target.value && e.target.classList) e.target.classList.remove("invalid");
      if (after) after();
      save(); renderOutput();
    });
  }
  function init() {
    var d = store.get(KEY, null), old = store.get("ticketDraft", null);
    if (d && Array.isArray(d.tabs) && d.tabs.length) {
      tabs = d.tabs.map(normalize);
      var found = tabs.filter(function (t) { return t.id === d.active; })[0];
      state = found || tabs[0]; activeId = state.id;
    } else {
      var t = blank();
      if (old && typeof old === "object") { // migrate the single-ticket draft of earlier versions
        t = normalize(old); t.id = uid();
        if (old.ki && !Array.isArray(old.kis)) {
          t.kis = [{ id: old.ki.id, title: old.ki.title, tpl: old.desc || "", steps: old.steps || [] }];
          t.shortEdited = t.descEdited = true;
        }
        delete t.ki; delete t.steps;
      }
      tabs = [t]; state = t; activeId = t.id;
    }
    store.remove("ticketDraft");

    function auto() { refreshAuto(); renderTabs(); renderRepeat(); renderHints(); renderCaller(); }
    bind("tk-userid", "userId", auto); bind("tk-username", "userName", auto);
    bind("tk-host", "host", auto); bind("tk-tz", "tz", function () { refreshAuto(); renderLocalTime(); });
    $("tk-userid").addEventListener("blur", function () { touched.userId = true; renderHints(); });
    $("tk-host").addEventListener("blur", function () { touched.host = true; renderHints(); });
    bind("tk-notes", "notes", renderNotesIndicator);
    bind("tk-said", "said", function () { renderSaid(); renderSuggest(); if (!state.flow) renderFlow(); });
    $("tk-said").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        var m = SDT.flows ? SDT.flows.match(suggestText())[0] : null;
        if (m) { if (SDT.shell) SDT.shell.showFlows(); SDT.flows.startOn(m.id); } else toast("No flow matches yet. Add a few more words.");
      }
    });
    bind("tk-ai-reply", "aiReply", renderAiStatus);
    $("tk-ai-copy").addEventListener("click", copyAiPrompt);
    $("tk-ai-apply").addEventListener("click", applyAiReply);
    bind("tk-short", "shortDesc", function () { state.shortEdited = state.shortDesc !== ""; if (!state.shortEdited) refreshAuto(); });
    bind("tk-desc", "desc", function () { state.descEdited = state.desc !== ""; if (!state.descEdited) refreshAuto(); });
    bind("tk-outcome", "outcome"); bind("tk-outcome-note", "outcomeNote"); bind("tk-followup", "followUp");
    bind("tk-issue", "issue", function () { renderSuggest(); if (!state.flow) renderFlow(); });
    $("tk-issue").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); openPicker(); } });
    $("tk-stamp").addEventListener("change", function (e) { state.stamp = e.target.checked; save(); renderOutput(); });

    $("tk-find").addEventListener("click", openPicker);
    $("tk-tpl-save").addEventListener("click", saveTemplate);

    $("tk-timer-toggle").addEventListener("click", toggleTimer);
    $("tk-timer-reset").addEventListener("click", resetTimer);
    $("tk-timer-include").addEventListener("change", function (e) { state.timerInclude = e.target.checked; save(); renderOutput(); });
    SDT.dom.every(function () { var v = $("view-ticket"); if (!v || !v.classList.contains("active")) return; renderTimer(); if (state.timerStart && state.timerInclude) renderOutput(); }, 1000);

    $("tk-save-next").addEventListener("click", saveAndNext);
    $("tk-guided-toggle").addEventListener("click", function () { state.guided = !state.guided; save(); renderGuided(); });
    $("tk-ai-preset").addEventListener("change", function (e) { SDT.settings.update("aiPreset", e.target.value); });
    $("tk-escalate").addEventListener("click", function () { SDT.escalation.open(); });
    $("tk-email").addEventListener("change", function (e) {
      var id = e.target.value; e.target.value = "";
      if (id) SDT.email.compose(id);
    });
    $("tk-snippet").addEventListener("change", function (e) {
      var s = SDT.snippets.list().filter(function (x) { return x.id === e.target.value; })[0];
      if (s) SDT.snippets.copy(s);
      e.target.value = "";
    });

    $("tk-copy-ticket").addEventListener("click", copyTicket);
    $("tk-copy-notes").addEventListener("click", copyNotes);
    $("tk-live-copy-ticket").addEventListener("click", copyTicket);
    $("tk-live-copy-notes").addEventListener("click", copyNotes);
    $("tk-review").addEventListener("click", openReview);
    $("tk-save").addEventListener("click", saveTicket);
    $("tk-new").addEventListener("click", addTab);

    document.addEventListener("keydown", function (e) { // shortcuts only while the Ticket Generator is showing
      if (!$("view-ticket").classList.contains("active") || M.isOpen()) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") { e.preventDefault(); if (e.shiftKey) copyNotes(); else copyTicket(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveTicket(); }
      else if (e.altKey && !mod && e.code === "KeyS") { e.preventDefault(); saveAndNext(); }
    });

    var cb = $("tk-add-checklist"); if (cb) cb.addEventListener("click", function () { if (SDT.checklists) SDT.checklists.pick(); });
    SDT.dom.every(renderLocalTime, 30000);
    renderAll();
  }

  SDT.ticket = { kiDraft: kiDraft, logStep: logStep, addCustom: addCustom, init: init, render: renderAll, applyKi: applyKi, applyPreset: applyPreset, openSaved: openSaved,
    current: function () { return state; }, openPicker: openPicker, openReview: openReview, newTab: addTab, save: saveTicket, saveAndNext: saveAndNext, persist: save,
    copyTicket: copyTicket, copyNotes: copyNotes, focusNotes: focusNotes, defaultAiPrompt: DEFAULT_AI_PROMPT, aiPresets: aiPresets, defaultAiPresets: DEFAULT_AI_PRESETS, parseAiReply: parseAiReply };
})(window);
