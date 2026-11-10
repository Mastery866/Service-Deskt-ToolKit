/* app.js - bootstrap: theme, routing, shared helpers (toast with undo, copy, download), dashboard,
   follow-up reminders, global shortcuts, backup reminder on close. */
(function (global) {
  "use strict";
  var SDT = global.SDT;
  var store = SDT.storage;
  var VIEWS = ["ticket", "kb", "snippets", "email", "history", "favorites", "reports", "reference", "scripts", "flows", "checklists", "tools", "library", "dashboard", "settings"];
  var BASE_TITLE = "Service Desk Toolkit";
  var lastDue = 0;

  var $ = window.SDT.dom.$;

  /* Toast; pass an undo function to show an Undo button. */
  function toast(msg, undo) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("has-action");
    if (typeof undo === "function") {
      var b = document.createElement("button");
      b.type = "button"; b.className = "toast-undo"; b.textContent = "Undo";
      b.addEventListener("click", function () { t.classList.remove("show"); undo(); });
      t.appendChild(b); t.classList.add("has-action");
    }
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, undo ? 7000 : 2400);
  }

  /* Clipboard helper that also works when the page is opened from a file. */
  function copy(text, okMsg, opts) {
    if (!text) { toast("Nothing to copy yet"); return; }
    var found = (opts && opts.skipGuard) || !SDT.guard || SDT.settings.values().guardCopy === false ? [] : SDT.guard.scan(text);
    if (found.length) {
      SDT.modal.confirm({ title: "This text looks sensitive", message: "It may contain " + found.join(", ") + ".\n\nCopy it anyway?", confirmLabel: "Copy anyway", danger: true })
        .then(function (ok) { if (ok) doCopy(text, okMsg); });
      return;
    }
    doCopy(text, okMsg);
  }
  function doCopy(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? okMsg : "Copy failed - select the text and press Ctrl+C");
    }
    if (global.navigator.clipboard && global.isSecureContext) {
      global.navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---- Display preferences: density ---- */
  function applyPrefs() {
    var v = SDT.settings.values();
    document.documentElement.setAttribute("data-density", v.density === "compact" ? "compact" : "comfortable");
  }

  /* ---- Theme ---- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    store.set("theme", theme);
  }
  function initTheme() {
    var saved = store.get("theme", null);
    var prefersDark = global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
    $("theme-toggle").addEventListener("click", function () {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }

  /* ---- Storage warning in the top bar (full meter is in Settings) ---- */
  function updateStoragePill() {
    var p = $("storage-pill"); if (!p) return;
    var u = store.usage();
    p.hidden = u.pct < 80;
    if (u.pct >= 80) {
      p.textContent = "Storage " + u.pct + "% full - back up";
      p.classList.toggle("bad", u.pct >= 90);
      p.title = "Browser storage is almost full. Open Settings, export a backup and delete old tickets.";
    }
  }

  /* ---- Routing (hash based, works on file://) ---- */
  function showView(name, moveFocus) {
    if (VIEWS.indexOf(name) === -1) name = "ticket";
    VIEWS.forEach(function (v) { $("view-" + v).classList.toggle("active", v === name); });
    var links = document.querySelectorAll("#nav a");
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute("data-view") === name;
      links[i].classList.toggle("active", on);
      if (on) links[i].setAttribute("aria-current", "page"); else links[i].removeAttribute("aria-current");
    }
    if (name === "ticket") SDT.ticket.render();
    if (name === "kb") SDT.kb.render();
    if (name === "snippets") SDT.snippets.render();
    if (name === "email") SDT.email.render();
    if (name === "reports") SDT.reports.render();
    if (name === "reference") SDT.reference.render();
    if (name === "scripts") SDT.scripts.render();
    if (name === "flows") SDT.flows.render();
    if (name === "checklists") SDT.checklists.render();
    if (name === "tools") SDT.tools.render();
    if (name === "library") SDT.library.render();
    if (name === "history") SDT.history.render();
    if (name === "favorites") SDT.kb.renderFavorites();
    if (name === "dashboard") renderDashboard();
    if (name === "settings") SDT.settings.render();
    updateStoragePill();
    if (SDT.shell) SDT.shell.onView(name);
    // keyboard / screen-reader users: land on the page heading (but never steal focus from the search box)
    if (moveFocus && document.activeElement && document.activeElement.id !== "global-search") {
      var h = document.querySelector("#view-" + name + " h1");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }
  function route(moveFocus) { showView((global.location.hash || "#ticket").slice(1), moveFocus === true); }

  /* ---- Dashboard ---- */
  function fillList(id, items, emptyText) {
    var ul = $(id);
    ul.innerHTML = "";
    if (!items.length) {
      var li = document.createElement("li");
      li.className = "empty small";
      li.textContent = emptyText;
      ul.appendChild(li);
      return;
    }
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text; // textContent, never innerHTML, for stored data
      ul.appendChild(li);
    });
  }
  function articleLabel(a) { return a.id + " - " + a.title; }
  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  function renderBars(tickets) {
    var box = $("dash-bars");
    box.innerHTML = "";
    var days = [], counts = {}, i;
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (i = 6; i >= 0; i--) {
      var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push(d); counts[dayKey(d)] = 0;
    }
    tickets.forEach(function (t) {
      var k = dayKey(new Date(t.createdAt));
      if (k in counts) counts[k]++;
    });
    var max = Math.max.apply(null, days.map(function (d) { return counts[dayKey(d)]; }).concat([1]));
    days.forEach(function (d) {
      var n = counts[dayKey(d)];
      var col = document.createElement("div"); col.className = "bar-col";
      col.setAttribute("role", "img"); col.setAttribute("aria-label", names[d.getDay()] + ": " + n + " tickets");
      var num = document.createElement("span"); num.textContent = n;
      var track = document.createElement("div"); track.className = "bar-track";
      var bar = document.createElement("div"); bar.className = "bar"; bar.style.height = (n ? Math.max(6, Math.round(n / max * 100)) : 2) + "%";
      track.appendChild(bar);
      var lab = document.createElement("span"); lab.textContent = names[d.getDay()];
      col.appendChild(num); col.appendChild(track); col.appendChild(lab);
      box.appendChild(col);
    });
  }

  /* ---- Follow-up reminders (set on a ticket, shown once the ticket is saved) ---- */
  function pendingFollowUps(tickets) {
    return tickets.filter(function (t) { return t.followUp && !t.followUpDone && !isNaN(new Date(t.followUp)); })
      .sort(function (a, b) { return new Date(a.followUp) - new Date(b.followUp); });
  }
  function dueCount() {
    var now = new Date();
    return pendingFollowUps(store.get("tickets", [])).filter(function (t) { return new Date(t.followUp) <= now; }).length;
  }
  function notifyDue() {
    var now = new Date();
    var due = pendingFollowUps(store.get("tickets", [])).filter(function (t) { return new Date(t.followUp) <= now; });
    var seen = store.get("notifiedFollowUps", []); if (!Array.isArray(seen)) seen = [];
    var fresh = due.filter(function (t) { return seen.indexOf(t.id + "@" + t.followUp) === -1; });
    if (!fresh.length) return;
    store.set("notifiedFollowUps", seen.concat(fresh.map(function (t) { return t.id + "@" + t.followUp; })).slice(-200));
    if (SDT.settings.values().followNotify && "Notification" in global && global.Notification.permission === "granted") {
      fresh.slice(0, 3).forEach(function (t) {
        try { new global.Notification("Follow-up due", { body: (t.userId ? t.userId + " - " : "") + (t.shortDescription || "ticket"), tag: t.id }); } catch (e) {}
      });
    }
  }
  function checkFollowUps(announce) {
    if (announce) notifyDue();
    var n = dueCount();
    document.title = (n ? "(" + n + ") " : "") + BASE_TITLE;
    if (announce && n > lastDue) toast(n + " follow-up" + (n === 1 ? " is" : "s are") + " due - see the Dashboard");
    lastDue = n;
  }
  function renderFollowUps(tickets) {
    var panel = $("dash-follow-panel"), ul = $("dash-followups");
    ul.innerHTML = "";
    var pend = pendingFollowUps(tickets);
    panel.hidden = !pend.length;
    var now = new Date();
    pend.slice(0, 8).forEach(function (t) {
      var due = new Date(t.followUp) <= now;
      var li = document.createElement("li");
      li.className = "follow-item" + (due ? " overdue" : "");
      var txt = document.createElement("span");
      txt.className = "follow-text";
      txt.textContent = (due ? "Due: " : "") + new Date(t.followUp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) +
        " - " + (t.shortDescription || "(untitled ticket)") + (t.userId ? " - " + t.userId : "");
      li.appendChild(txt);
      var open = document.createElement("button"); open.type = "button"; open.className = "btn btn-ghost btn-sm"; open.textContent = "Open";
      open.addEventListener("click", function () { if (SDT.ticket.openSaved(t)) global.location.hash = "#ticket"; });
      var done = document.createElement("button"); done.type = "button"; done.className = "btn btn-sm"; done.textContent = "Done";
      done.addEventListener("click", function () {
        var all = store.get("tickets", []);
        all.forEach(function (x) { if (x.id === t.id) x.followUpDone = true; });
        store.set("tickets", all); renderDashboard(); checkFollowUps(false);
      });
      li.appendChild(open); li.appendChild(done);
      ul.appendChild(li);
    });
  }

  function renderDashboard() {
    var kb = store.get("kb", []);
    var tickets = store.get("tickets", []);
    var recentIds = store.get("recent", []);
    var usage = store.get("usage", {});
    var favs = kb.filter(function (a) { return a.favorite; });
    var today = dayKey(new Date());

    $("stat-kb").textContent = kb.length;
    $("stat-tickets").textContent = tickets.length;
    $("stat-today").textContent = tickets.filter(function (t) { return dayKey(new Date(t.createdAt)) === today; }).length;
    $("stat-favs").textContent = favs.length;

    function find(id) { return kb.filter(function (a) { return a.id === id; })[0]; }
    var recent = recentIds.map(find).filter(Boolean).slice(0, 5).map(articleLabel);
    var top = Object.keys(usage).filter(function (id) { return find(id); })
      .sort(function (a, b) { return usage[b] - usage[a]; }).slice(0, 5)
      .map(function (id) { return articleLabel(find(id)) + "  (" + usage[id] + "x)"; });

    fillList("dash-recent", recent, "No articles opened yet.");
    fillList("dash-top", top, "No KIs applied yet.");
    fillList("dash-tickets", tickets.slice(0, 5).map(function (t) {
      return (t.shortDescription || "(untitled ticket)") + (t.userId ? " - " + t.userId : "");
    }), "No tickets saved yet.");
    renderBars(tickets);
    renderFollowUps(tickets);

    var warn = $("dash-backup"), last = store.get("lastBackup", null), msg = "";
    if (tickets.length || kb.some(function (a) { return a.favorite; })) {
      var days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      if (last === null) msg = "You have not made a backup yet. Export one from Settings so your data is safe.";
      else if (days >= 7) msg = "Your last backup was " + days + " days ago. Export a fresh one from Settings.";
    }
    warn.hidden = !msg; warn.textContent = msg;

    var u = store.usage(), sw = $("dash-storage"), sm = "";
    if (u.pct >= 80) sm = "Browser storage is " + u.pct + "% full. Export a backup, then delete old tickets in Ticket History (or export them to CSV first).";
    sw.hidden = !sm; sw.textContent = sm;
    $("dash-restore").hidden = !(!tickets.length && last === null && !store.get("welcomeDismissed", false));
  }

  /* ---- Global search: typing jumps to the Knowledge Base view ---- */
  function initSearch() {
    var input = $("global-search"), timer;
    function run() {
      SDT.kb.setQuery(input.value);
      if (global.location.hash !== "#kb") global.location.hash = "#kb"; // route() renders
      else SDT.kb.render();
    }
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { clearTimeout(timer); run(); } });
  }

  /* ---- Global shortcuts: "/" or Ctrl+K focuses the KB search ---- */
  function initShortcuts() {
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!SDT.modal.isOpen()) SDT.palette.open();
        return;
      }
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !SDT.modal.isOpen()) {
        e.preventDefault();
        $("global-search").focus();
        $("global-search").select();
      }
    });
    $("skip-link").addEventListener("click", function (e) {
      e.preventDefault();
      var m = $("main"); m.setAttribute("tabindex", "-1"); m.focus();
    });
  }

  /* ---- Ask for a backup when closing the tab if the last one is old ---- */
  function initCloseReminder() {
    global.addEventListener("beforeunload", function (e) {
      if (SDT.app.skipUnloadPrompt || !SDT.settings.values().backupReminder) return;
      if (!(store.get("tickets", []) || []).length) return;
      var last = store.get("lastBackup", null);
      var days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
      if (days < 7) return;
      e.preventDefault();
      e.returnValue = "You have not backed up recently. Export a backup from Settings.";
    });
  }

  /* ---- Init ---- */
  document.addEventListener("DOMContentLoaded", function () { store.ready().then(start); });

  function start() {
    store.onCorrupt = function (key) { toast("Some saved data could not be read (" + key + "). A copy was set aside. See Settings > Stored data to recover it."); if (SDT.shell) SDT.shell.refreshStorage(); };
    store.seed();
    applyPrefs();
    initTheme();
    initSearch();
    initShortcuts();
    initCloseReminder();
    SDT.snippets.init();
    SDT.email.init();
    SDT.ticket.init();
    SDT.kb.init();
    SDT.history.init();
    SDT.settings.init();
    SDT.reports.init();
    SDT.reference.init();
    SDT.scripts.init();
    SDT.flows.init();
    SDT.checklists.init();
    SDT.insights.init();
    SDT.sharepack.init();
    SDT.tools.init();
    SDT.library.init();
    SDT.shell.init();
    $("storage-pill").addEventListener("click", function () { global.location.hash = "#settings"; });
    $("palette-btn").addEventListener("click", function () { if (SDT.palette) SDT.palette.open(); });
    updateStoragePill(); SDT.dom.every(updateStoragePill, 60000);
    SDT.errors.init();
    var fullAt = 0;
    store.onFull = function () { if (Date.now() - fullAt > 10000) { fullAt = Date.now(); toast("Browser storage is full - export a backup and delete old tickets"); } };
    $("dash-restore-btn").addEventListener("click", function () { $("set-file").click(); });
    $("dash-restore-dismiss").addEventListener("click", function () { store.set("welcomeDismissed", true); renderDashboard(); });
    SDT.handoff.init();
    SDT.backup.init();
    SDT.version.init();
    global.addEventListener("hashchange", function () { route(true); });
    route(false);
    checkFollowUps(true);
    setInterval(function () { checkFollowUps(true); }, 60000);
  }

  SDT.app = { toast: toast, copy: copy, download: download, showView: showView, renderDashboard: renderDashboard,
              checkFollowUps: checkFollowUps, applyPrefs: applyPrefs, skipUnloadPrompt: false };
})(window);
