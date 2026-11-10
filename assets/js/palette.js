/* palette.js - command palette (Ctrl+K): jump to pages, run actions, apply KIs, templates, copy responses. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;

  var el = window.SDT.dom.el;
  function go(view) { global.location.hash = "#" + view; }

  function commands() {
    var list = [];
    function add(group, label, run, extra, hint) { list.push({ group: group, label: label, run: run, hint: hint || "", hay: (group + " " + label + " " + (extra || "") + " " + (hint || "")).toLowerCase() }); }

    [["ticket", "Ticket Generator"], ["kb", "Knowledge Base"], ["snippets", "Canned Responses"], ["email", "Email Templates"], ["reports", "Reports"], ["reference", "Quick Reference"], ["library", "Library home"], ["scripts", "Script Library"], ["flows", "Question Flows"], ["checklists", "Checklists"], ["tools", "Tools"], ["history", "Ticket History"],
     ["favorites", "Favorites"], ["dashboard", "Dashboard"], ["settings", "Settings"]].forEach(function (p) {
      add("Go to", p[1], function () { go(p[0]); });
    });
    add("Ticket", "New ticket", function () { go("ticket"); SDT.ticket.newTab(); });
    add("Ticket", "Save ticket and start the next one", function () { go("ticket"); SDT.ticket.saveAndNext(); }, "next new");
    add("Ticket", "Escalation note...", function () { go("ticket"); SDT.escalation.open(); }, "escalate handoff next team");
    add("Ticket", "Save ticket", function () { go("ticket"); SDT.ticket.save(); });
    add("Ticket", "Copy ticket details", function () { go("ticket"); SDT.ticket.copyTicket(); });
    add("Ticket", "Copy work notes", function () { go("ticket"); SDT.ticket.copyNotes(); });
    add("Ticket", "Find and apply KIs...", function () { go("ticket"); SDT.ticket.openPicker(); }, "search picker add");
    add("Ticket", "Review ticket before copying...", function () { go("ticket"); SDT.ticket.openReview(); }, "preview checklist");
    add("Ticket", "Go to temporary notes", function () { go("ticket"); SDT.ticket.focusNotes(); }, "scratchpad notes");
    add("Create", "New KI", function () { go("kb"); SDT.kb.openEditor({ mode: "new" }); }, "article knowledge");
    add("Create", "New email template", function () { go("email"); SDT.email.openEditor(null); }, "mail message");
    add("Create", "New checklist", function () { go("checklists"); SDT.checklists.openEditor(null); }, "steps repeat job");
    add("Create", "Keyboard shortcuts", function () { SDT.tools.openShortcuts(); }, "help keys hotkeys ?");
    add("Create", "New question flow", function () { go("flows"); SDT.flows.openEditor(null); }, "probing questions decision tree triage");
    add("Create", "New script", function () { go("scripts"); SDT.scripts.openEditor(null); }, "batch bat powershell shell registry library");
    add("Create", "New canned response", function () { go("snippets"); SDT.snippets.openEditor(null); });
    add("App", "Toggle dark / light mode", function () { document.getElementById("theme-toggle").click(); }, "theme");
    add("App", "What's new", function () { SDT.version.open(); }, "version changes");
    add("Ticket", "Toggle guided mode (one step at a time)", function () { go("ticket"); document.getElementById("tk-guided-toggle").click(); }, "steps");
    add("App", "Copy weekly summary", function () { SDT.app.copy(SDT.reports.weeklyText(), "Weekly summary copied"); }, "report week");
    add("App", "Shift handoff summary", function () { go("dashboard"); SDT.handoff.open(); }, "end of shift tickets follow-ups");
    add("App", "Back up now to the folder", function () { SDT.backup.auto("manual").then(function (ok) { SDT.app.toast(ok ? "Backup saved to the folder" : "Backup not saved - set the folder in Settings"); }); }, "automatic folder");
    add("App", "Export backup", function () { SDT.settings.exportBackup(); }, "download save");

    add("App", "Add starter content (KIs, flows, scripts, checklists)", function () { go("library"); SDT.library.addStarter(); }, "sample example import pack library");
    add("App", "Quick tour", function () { SDT.shell.openTour(0); }, "help guide welcome");
    add("App", "Toggle call focus mode", function () { SDT.shell.toggleFocus(); }, "distraction hide menu ticket call", "Hides the menu and side panels (Alt+F)");
    add("App", "Pin or unpin this page in the menu", function () { SDT.shell.pinCurrent(); }, "favorite star menu");
    SDT.flows.list().forEach(function (f) {
      var hint = [f.category, (f.tags || []).join(", ")].filter(Boolean).join(" | ");
      add("Flow", "Start flow: " + f.title, function () { go("ticket"); SDT.flows.startOn(f.id); }, (f.keywords || []).join(" ") + " probing questions triage", hint || "Ask guided questions in the ticket");
      add("Flow", "Open flow: " + f.title, function () { SDT.flows.show(f.id); go("flows"); }, "edit map", hint);
    });
    (store.get("checklists", []) || []).forEach(function (c) {
      add("Checklist", "Add checklist to ticket: " + c.title, function () { go("ticket"); SDT.ticket.addCustom(c.items || []); }, (c.items || []).join(" "), (c.items || []).length + " steps");
    });

    var presets = store.get("presets", []);
    (Array.isArray(presets) ? presets : []).forEach(function (p) {
      add("Template", "Apply template: " + p.name, function () { go("ticket"); SDT.ticket.applyPreset(p); }, (p.kis || []).join(" "));
    });
    (SDT.snippets.list() || []).forEach(function (s) {
      add("Canned response", "Copy: " + s.title, function () { SDT.snippets.copy(s); }, s.text);
    });
    (SDT.scripts.list() || []).forEach(function (s) {
      add("Script", "Copy script: " + s.title, function () { SDT.scripts.copy(s); }, s.category + " " + (s.description || "") + " " + (s.filename || ""));
      add("Script", "Download script: " + s.title, function () { SDT.scripts.download(s); }, s.category + " " + (s.filename || ""));
      add("Script", "Open script: " + s.title, function () { SDT.scripts.show(s.id); go("scripts"); SDT.scripts.render(); }, s.category + " " + (s.description || ""));
    });
    (SDT.email.list() || []).forEach(function (t) {
      add("Email", "Write email: " + t.title, function () { SDT.email.compose(t.id); }, t.subject + " " + t.body);
    });
    (store.get("kb", []) || []).forEach(function (a) {
      var kw = (a.keywords || []).concat(a.synonyms || []).join(" ");
      add("KI", "Apply " + a.id + " - " + a.title, function () { if (SDT.ticket.applyKi(a.id)) go("ticket"); }, kw);
      add("KI", "Open " + a.id + " - " + a.title + " in the Knowledge Base", function () { go("kb"); SDT.kb.openArticle(a.id); }, kw);
    });
    return list;
  }

  var CHIPS = [["All", null], ["Pages", ["Go to"]], ["Ticket", ["Ticket", "Template"]], ["KB", ["KI"]], ["Flows", ["Flow"]], ["Scripts", ["Script"]],
               ["Responses", ["Canned response", "Email", "Checklist"]], ["Create", ["Create"]], ["App", ["App"]]];
  var QUIET_GROUPS = ["KI", "Canned response", "Script", "Flow", "Checklist"];

  function recentLabels() { var r = store.get("paletteRecent", []); return Array.isArray(r) ? r : []; }
  function remember(label) {
    var r = recentLabels().filter(function (x) { return x !== label; }); r.unshift(label); store.set("paletteRecent", r.slice(0, 8));
  }
  function filter(list, q, chip) {
    q = q.toLowerCase().trim();
    var groups = chip ? CHIPS[chip][1] : null;
    var pool = groups ? list.filter(function (c) { return groups.indexOf(c.group) > -1; }) : list;
    if (!q) {
      if (groups) return pool.slice(0, 30);
      var rec = recentLabels().map(function (l) { return list.filter(function (c) { return c.label === l; })[0]; }).filter(Boolean);
      var seen = {}; rec.forEach(function (c) { seen[c.label] = true; });
      var base = list.filter(function (c) { return QUIET_GROUPS.indexOf(c.group) === -1 && !seen[c.label]; });
      return rec.map(function (c) { return Object.assign({}, c, { recent: true }); }).concat(base).slice(0, 14);
    }
    var terms = q.split(/\s+/);
    return pool.filter(function (c) { return terms.every(function (t) { return c.hay.indexOf(t) > -1; }); })
      .map(function (c) { return { c: c, s: (c.label.toLowerCase().indexOf(q) === 0 ? 0 : c.label.toLowerCase().indexOf(q) > -1 ? 1 : 2) }; })
      .sort(function (a, b) { return a.s - b.s; }).map(function (x) { return x.c; }).slice(0, groups ? 30 : 14);
  }

  function open() {
    if (SDT.modal.isOpen()) return;
    var all = commands(), chip = 0;
    var body = el("div", "palette");
    var input = el("input", ""); input.type = "text"; input.autocomplete = "off";
    input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "true"); input.setAttribute("aria-controls", "palette-list");
    input.setAttribute("aria-label", "Type a command"); input.placeholder = "Type a command, page, KB ID, flow or response...";
    var chips = el("div", "palette-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filter by kind");
    var ul = el("ul", "palette-list"); ul.id = "palette-list"; ul.setAttribute("role", "listbox");
    body.appendChild(input); body.appendChild(chips); body.appendChild(ul);
    body.appendChild(el("p", "empty small", "Up / Down to choose, Enter to run, Tab to change the filter, Esc to close."));
    var items = [], sel = 0, handle;

    function drawChips() {
      chips.innerHTML = "";
      CHIPS.forEach(function (c, i) {
        var b = el("button", "chip" + (i === chip ? " active" : ""), c[0]); b.type = "button"; b.setAttribute("aria-pressed", i === chip ? "true" : "false");
        b.addEventListener("click", function () { chip = i; sel = 0; drawChips(); render(); input.focus(); }); chips.appendChild(b);
      });
    }
    function render() {
      ul.innerHTML = "";
      items = filter(all, input.value, chip);
      if (sel >= items.length) sel = Math.max(0, items.length - 1);
      if (!items.length) { ul.appendChild(el("li", "empty small", "Nothing matches.")); return; }
      items.forEach(function (c, i) {
        var li = el("li", "palette-item" + (i === sel ? " active" : ""));
        li.setAttribute("role", "option"); li.setAttribute("aria-selected", i === sel ? "true" : "false");
        li.appendChild(el("span", "palette-group", c.recent ? "Recent" : c.group));
        var tx = el("span", "palette-text"); tx.appendChild(el("span", "palette-label", c.label));
        if (c.hint) tx.appendChild(el("span", "palette-hint", c.hint));
        li.appendChild(tx);
        li.addEventListener("mousemove", function () { if (sel !== i) { sel = i; render(); } });
        li.addEventListener("click", function () { run(c); });
        ul.appendChild(li);
      });
      var act = ul.querySelector(".active"); if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
    }
    function run(c) { remember(c.label); handle.close(); setTimeout(c.run, 30); } // after focus returns to the opener
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === "Enter") { e.preventDefault(); if (items[sel]) run(items[sel]); }
      else if (e.key === "Tab" && !e.ctrlKey && !e.altKey) { e.preventDefault(); chip = (chip + (e.shiftKey ? CHIPS.length - 1 : 1)) % CHIPS.length; sel = 0; drawChips(); render(); }
    });
    handle = SDT.modal.open({ title: "Command palette", body: body, size: "md", initialFocus: input });
    drawChips(); render();
  }

  SDT.palette = { open: open };
})(window);
