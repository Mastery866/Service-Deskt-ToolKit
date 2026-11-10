/* shell.js - how the app feels: collapsible menu groups, an icon-only menu, pinned pages, call focus mode,
   a quick tour, remembered filters, category colours and the large-storage switch in Settings.
   Preferences are saved in the browser (key uiPrefs) and never leave it. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {}, store = SDT.storage;

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  var toast = window.SDT.dom.toast;

  /* ---- Remembered preferences (filters, menu layout) ---- */
  function allPrefs() { var p = store.get("uiPrefs", {}); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; }
  SDT.prefs = {
    get: function (ns, def) { var v = allPrefs()[ns]; return v === undefined ? def : v; },
    set: function (ns, val) { var p = allPrefs(); p[ns] = val; store.set("uiPrefs", p); }
  };

  /* A steady colour for each category name, so Printing is always the same colour */
  function catColor(name) {
    var h = 0, s = String(name || "General");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return "hsl(" + h + ", 55%, 48%)";
  }

  /* ---- Menu: collapsible groups, icon-only mode, pinned pages ---- */
  var nav = { collapsed: [], slim: false, pins: [] };
  function loadNav() { var n = SDT.prefs.get("nav", {}); nav.collapsed = Array.isArray(n.collapsed) ? n.collapsed : []; nav.slim = !!n.slim; nav.pins = Array.isArray(n.pins) ? n.pins : []; }
  function saveNav() { SDT.prefs.set("nav", { collapsed: nav.collapsed, slim: nav.slim, pins: nav.pins }); }

  function buildNav() {
    var menu = $("nav"); if (!menu || menu.getAttribute("data-built")) return;
    menu.setAttribute("data-built", "1");
    var kids = Array.prototype.slice.call(menu.children), group = null, links = {};
    menu.innerHTML = "";
    var pinned = el("div", "nav-section"); pinned.id = "nav-pinned"; menu.appendChild(pinned);
    kids.forEach(function (k) {
      if (k.tagName === "P") {
        var name = k.textContent.trim();
        var sec = el("div", "nav-section"), btn = el("button", "nav-group", name); btn.type = "button";
        btn.setAttribute("aria-expanded", nav.collapsed.indexOf(name) > -1 ? "false" : "true"); btn.setAttribute("data-group", name);
        var body = el("div", "nav-body"); body.hidden = nav.collapsed.indexOf(name) > -1;
        btn.addEventListener("click", function () {
          body.hidden = !body.hidden; btn.setAttribute("aria-expanded", body.hidden ? "false" : "true");
          nav.collapsed = nav.collapsed.filter(function (x) { return x !== name; }); if (body.hidden) nav.collapsed.push(name); saveNav();
        });
        sec.appendChild(btn); sec.appendChild(body); menu.appendChild(sec); group = body;
      } else if (k.tagName === "A") {
        var item = el("div", "nav-item"); k.title = k.textContent.trim();
        var pin = el("button", "nav-pin", "\u2606"); pin.type = "button"; pin.setAttribute("data-pin", k.getAttribute("data-view"));
        pin.addEventListener("click", function () { togglePin(k.getAttribute("data-view")); });
        item.appendChild(k); item.appendChild(pin); (group || menu).appendChild(item);
        links[k.getAttribute("data-view")] = k;
      }
    });
    nav.links = links; refreshPins();
  }
  function refreshPins() {
    var box = $("nav-pinned"); if (!box) return; box.innerHTML = "";
    var valid = nav.pins.filter(function (v) { return nav.links && nav.links[v]; });
    Array.prototype.forEach.call(document.querySelectorAll(".nav-pin"), function (b) {
      var on = valid.indexOf(b.getAttribute("data-pin")) > -1;
      b.textContent = on ? "\u2605" : "\u2606"; b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", (on ? "Unpin " : "Pin ") + nav.links[b.getAttribute("data-pin")].title);
      b.title = on ? "Unpin from the top of the menu" : "Pin to the top of the menu";
    });
    if (!valid.length) return;
    var head = el("p", "nav-group nav-group-static", "Pinned"); box.appendChild(head);
    valid.forEach(function (v) {
      var a = nav.links[v].cloneNode(true); a.setAttribute("data-clone", "1");
      if (location.hash.replace("#", "") === v) { a.classList.add("active"); a.setAttribute("aria-current", "page"); }
      box.appendChild(a);
    });
  }
  function togglePin(view) {
    var i = nav.pins.indexOf(view); if (i > -1) nav.pins.splice(i, 1); else nav.pins.push(view);
    saveNav(); refreshPins(); toast(i > -1 ? "Unpinned" : "Pinned to the top of the menu");
  }
  var tabletQuery = global.matchMedia ? global.matchMedia("(min-width: 721px) and (max-width: 1024px)") : null;
  function applySlim() {
    var slim = nav.slim || !!(tabletQuery && tabletQuery.matches);   // tablets get the icon-only menu automatically
    document.body.classList.toggle("nav-slim", slim);
    var b = $("nav-slim-toggle"); if (b) { b.setAttribute("aria-pressed", slim ? "true" : "false"); b.textContent = slim ? "\u00BB" : "\u00AB"; b.title = slim ? "Show the full menu" : "Collapse the menu to icons"; b.setAttribute("aria-label", b.title); }
  }

  /* ---- Call focus mode ---- */
  /* Compact view: tighter spacing on the ticket page only */
  function applyCompact(on, say) {
    document.body.classList.toggle("tk-compact", on);
    var b = $("tk-compact"); if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
    if (say) { SDT.prefs.set("ticketCompact", on); toast(on ? "Compact view on" : "Compact view off"); }
  }
  function setFocus(on) {
    document.body.classList.toggle("focus-call", on);
    var b = $("tk-focus"); if (b) { b.setAttribute("aria-pressed", on ? "true" : "false"); var lb = b.querySelector(".btn-label"); (lb || b).textContent = on ? "Exit focus" : "Focus"; }
    var x = $("focus-exit"); if (x) x.hidden = !on;
  }
  function toggleFocus() {
    if (!global.location.hash || global.location.hash === "#" || global.location.hash.indexOf("ticket") === -1) global.location.hash = "#ticket";
    setFocus(!document.body.classList.contains("focus-call"));
  }

  /* ---- Quick tour ---- */
  var STEPS = [
    ["Start in the Ticket Generator", "Type the user, the machine and the issue. The app suggests KIs and a question flow. Tick the steps you do, and the work notes write themselves. Press Alt+S to save and start the next ticket."],
    ["Ask guided questions", "When the issue matches a Question Flow you can click the answers the user gives. The flow narrows it down to the right KI, and the questions go into the work notes. Build and edit flows on the Question Flows page, or write them as text."],
    ["Your library", "Library home shows what you have and what needs attention. Keep scripts and commands in the Script Library, repeat jobs in Checklists, and handy calculators in Tools. Items can be searched, sorted, tagged and exported."],
    ["Find anything fast", "Press Ctrl+K to open the command palette. Use the chips to narrow to flows, scripts or KIs, and your recent choices come first. Press ? to see every keyboard shortcut."],
    ["Keep your data safe", "Choose a backup folder in Settings so the app saves a copy automatically. If your library grows big, Settings also lets you switch to large storage. Nothing leaves your computer."]
  ];
  function openTour(start) {
    if (SDT.modal.isOpen()) return;
    var i = start || 0, body = el("div", "tour"), h;
    var title = el("h3", "tour-title"), text = el("p", "tour-text"), dots = el("div", "tour-dots"); dots.setAttribute("aria-hidden", "true");
    body.appendChild(title); body.appendChild(text); body.appendChild(dots);
    function draw() {
      title.textContent = (i + 1) + " of " + STEPS.length + ": " + STEPS[i][0]; text.textContent = STEPS[i][1]; dots.innerHTML = "";
      STEPS.forEach(function (s, k) { dots.appendChild(el("span", "tour-dot" + (k === i ? " on" : ""))); });
      var nx = h && h.el && h.el.querySelector("[data-tour=next]"), pv = h && h.el && h.el.querySelector("[data-tour=prev]");
      if (nx) nx.textContent = i === STEPS.length - 1 ? "Done" : "Next"; if (pv) pv.disabled = i === 0;
    }
    h = SDT.modal.open({ title: "Quick tour", body: body, size: "sm", onClose: function () { store.set("tourDone", true); }, actions: [
      { label: "Back", kind: "ghost", onClick: function () { if (i > 0) { i--; draw(); } return false; } },
      { label: "Next", kind: "primary", onClick: function () { if (i < STEPS.length - 1) { i++; draw(); return false; } } }
    ] });
    if (h && h.el) { var bs = h.el.querySelectorAll(".modal-foot .btn"); if (bs[0]) bs[0].setAttribute("data-tour", "prev"); if (bs[1]) bs[1].setAttribute("data-tour", "next"); }
    draw();
  }

  /* ---- Large storage panel (Settings > Backup > Stored data) ---- */
  function mb(n) { return (n / 1000000).toFixed(n > 10000000 ? 0 : 1) + " MB"; }
  function renderStorage() {
    var t = $("st-text"); if (!t) return;
    var big = store.mode() === "idb", u = store.usage(), legacy = store.legacyCount();
    var msg = big ? "Large storage is on. Your data is kept in IndexedDB, with room for hundreds of MB (using about " + mb(u.chars) + " now)."
      : "Your data is kept in normal browser storage, which holds about 5 MB (using about " + mb(u.chars) + ", " + u.pct + "%). Switch to large storage if your library is growing.";
    if (store.problem()) msg = "Large storage could not be opened (" + store.problem() + "). The app is showing an older copy. Do not edit anything until this is fixed.";
    t.textContent = msg;
    $("st-enable").hidden = big; $("st-disable").hidden = !big; $("st-free").hidden = !(big && legacy > 0);
    if (big && legacy > 0) $("st-free").textContent = "Free the old copy (" + legacy + " items)";
  }
  function bindStorage() {
    function ask(o) { return SDT.modal.confirm(o); }
    function fail(e) { SDT.modal.confirm({ title: "Nothing was changed", message: (e && e.message) || "Something went wrong.", confirmLabel: "OK" }); }
    $("st-enable").addEventListener("click", function () {
      ask({ title: "Switch to large storage?", confirmLabel: "Switch", message: "Your data is copied to large storage and checked before anything changes. The old copy stays until you free it yourself.\n\nBefore you start: export a backup from Settings, and close any other tab that has this app open." }).then(function (ok) {
        if (!ok) return;
        store.enableLarge().then(function (n) { toast("Large storage is on (" + n + " items copied and checked). Reloading..."); setTimeout(function () { global.location.reload(); }, 900); }).catch(fail);
      });
    });
    $("st-disable").addEventListener("click", function () {
      ask({ title: "Go back to normal browser storage?", confirmLabel: "Switch back", message: "Your data is copied back to normal browser storage (about 5 MB). If it does not fit, nothing changes." }).then(function (ok) {
        if (!ok) return;
        store.disableLarge().then(function () { toast("Back to normal storage. Reloading..."); setTimeout(function () { global.location.reload(); }, 900); }).catch(fail);
      });
    });
    $("st-free").addEventListener("click", function () {
      ask({ title: "Free the old copy?", danger: true, confirmLabel: "Free it", message: "This deletes the old copy that was left in normal browser storage after the switch. Only do it after you have checked that everything looks right and you have a backup." }).then(function (ok) {
        if (!ok) return; var n = store.freeLegacy(); renderStorage(); toast("Freed " + n + " old items");
      });
    });
  }

  /* ---- Ticket page: side column tabs (Notes | Live preview | AI rewrite) and the collapsible probing panel ---- */
  function setSideTab(v, focus) {
    var aside = document.querySelector(".tk-live"); if (!aside) return;
    var btn = $("tk-tab-" + v);
    if (!btn || (btn.offsetParent === null && v === "preview")) v = "notes";          // live preview is hidden on narrow screens
    aside.setAttribute("data-tab", v);
    Array.prototype.forEach.call(aside.querySelectorAll('[role="tab"]'), function (t) {
      var on = t.getAttribute("data-tab") === v; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; t.classList.toggle("active", on);
    });
    if (focus) $("tk-tab-" + v).focus();
  }
  function bindSideTabs() {
    var tabs = document.querySelector(".tk-tabs"); if (!tabs) return;
    tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) { SDT.prefs.set("tkTab", b.getAttribute("data-tab")); setSideTab(b.getAttribute("data-tab")); } });
    tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var vis = Array.prototype.filter.call(tabs.querySelectorAll('[role="tab"]'), function (t) { return t.offsetParent !== null; });
      var i = vis.indexOf(document.activeElement); if (i < 0) return; e.preventDefault();
      var n = vis[(i + (e.key === "ArrowRight" ? 1 : vis.length - 1)) % vis.length]; SDT.prefs.set("tkTab", n.getAttribute("data-tab")); setSideTab(n.getAttribute("data-tab"), true);
    });
    setSideTab(SDT.prefs.get("tkTab", "notes"));
    global.addEventListener("resize", function () { setSideTab(document.querySelector(".tk-live").getAttribute("data-tab")); });
  }
  function setFlowCollapsed(on, remember) {
    var p = $("tk-flow-panel"), b = $("tk-flow-toggle"); if (!p || !b) return;
    p.classList.toggle("is-collapsed", on); b.textContent = on ? "Show" : "Hide"; b.setAttribute("aria-expanded", on ? "false" : "true");
    if (remember) SDT.prefs.set("tkFlowCollapsed", on);
  }
  function bindFlowToggle() {
    var b = $("tk-flow-toggle"); if (!b) return;
    b.addEventListener("click", function () { setFlowCollapsed(!$("tk-flow-panel").classList.contains("is-collapsed"), true); });
    setFlowCollapsed(!!SDT.prefs.get("tkFlowCollapsed", false), false);
  }

  /* ---- Offline status ---- */
  function renderNet() {
    var p = $("net-pill"); if (!p) return;
    var on = global.navigator.onLine !== false;
    p.textContent = on ? "Works offline" : "Offline: all features work";
    p.title = on ? "This app never uses the internet. Your data stays on this computer." : "No internet connection. The app works the same, and your data stays on this computer.";
    p.classList.toggle("is-off", !on);
  }

  /* ---- Warn when the app is open in a second tab (the last tab to save would overwrite the other) ---- */
  function bindTabWarning() {
    var banner = $("tab-banner"); if (!banner) return;
    var text = $("tab-banner-text"), me = Math.random().toString(36).slice(2), shown = false;
    function show(msg) { if (shown) return; shown = true; text.textContent = msg; banner.hidden = false; }
    $("tab-banner-close").addEventListener("click", function () { banner.hidden = true; shown = false; });
    $("tab-banner-reload").addEventListener("click", function () { global.location.reload(); });
    if (typeof global.BroadcastChannel === "function") {
      try {
        var ch = new global.BroadcastChannel("sdt-tabs");
        ch.onmessage = function (m) {
          var d = m.data || {}; if (d.id === me) return;
          if (d.t === "hello") { ch.postMessage({ t: "here", id: me }); show("This app is also open in another tab or window. Changes saved in one can overwrite changes in the other. Close the extra tab to be safe."); }
          if (d.t === "here") show("This app is also open in another tab or window. Changes saved in one can overwrite changes in the other. Close the extra tab to be safe.");
        };
        ch.postMessage({ t: "hello", id: me });
      } catch (e) {}
    }
    global.addEventListener("storage", function (e) {   // fires only for changes made by another tab
      if (e.key && e.key.indexOf("sdt.") === 0 && !/lastBackup|lastAutoBackup|persisted|uiPrefs|errorLog|paletteRecent/.test(e.key)) show("Your data was changed in another tab. Reload this tab to see the latest, or saving here may overwrite it.");
    });
  }

  /* ---- Sensible length limits on every text box (a runaway paste cannot fill the browser's storage) ---- */
  var LIMITS = { "tk-userid": 64, "tk-username": 120, "tk-host": 64, "tk-tz": 40, "tk-issue": 300, "tk-short": 250 };
  function limitField(n) {
    if (!n || n.nodeType !== 1) return;
    var list = n.matches && n.matches("input, textarea") ? [n] : (n.querySelectorAll ? Array.prototype.slice.call(n.querySelectorAll("input, textarea")) : []);
    list.forEach(function (f) {
      if (f.hasAttribute("maxlength")) return;
      if (LIMITS[f.id]) { f.setAttribute("maxlength", LIMITS[f.id]); return; }
      if (f.tagName === "TEXTAREA") f.setAttribute("maxlength", 60000);
      else if (/^(text|search|email|url|tel|password)$/.test(f.type)) f.setAttribute("maxlength", 300);
    });
  }
  function guardInputs() {
    limitField(document.body);
    if (typeof global.MutationObserver !== "function") return;
    new global.MutationObserver(function (muts) { muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, limitField); }); }).observe(document.body, { childList: true, subtree: true });
  }

  function renderCorrupt() {
    var p = $("st-corrupt"); if (!p) return;
    var n = Object.keys(store.corruptItems ? store.corruptItems() : {}).length;
    p.hidden = !n; $("st-corrupt-dl").hidden = !n; $("st-corrupt-del").hidden = !n;
    if (n) p.textContent = n + " saved item" + (n === 1 ? " was" : "s were") + " unreadable and set aside instead of being overwritten. Download it to keep a copy, or delete it once you no longer need it.";
  }
  function bindCorrupt() {
    var dl = $("st-corrupt-dl"), del = $("st-corrupt-del"); if (!dl) return;
    dl.addEventListener("click", function () { var d = new Date(); SDT.app.download("sdt-unreadable-data-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json", JSON.stringify(store.corruptItems(), null, 2), "application/json"); });
    del.addEventListener("click", function () {
      SDT.modal.confirm({ title: "Delete the unreadable data?", danger: true, confirmLabel: "Delete it", message: "This permanently deletes the items that could not be read. Download them first if you might need them." }).then(function (ok) { if (ok) { var n = store.clearCorrupt(); renderCorrupt(); toast("Deleted " + n + " unreadable item" + (n === 1 ? "" : "s")); } });
    });
  }

  function onView(name) {
    if (name !== "ticket" && document.body.classList.contains("focus-call")) setFocus(false);
    if (name === "settings") { renderStorage(); renderCorrupt(); }
    refreshPins();
  }

  function init() {
    loadNav(); buildNav(); applySlim();
    var st = $("nav-slim-toggle"); if (st) st.addEventListener("click", function () { nav.slim = !document.body.classList.contains("nav-slim"); saveNav(); applySlim(); });
    if (tabletQuery && tabletQuery.addEventListener) tabletQuery.addEventListener("change", applySlim);
    var f = $("tk-focus"); if (f) f.addEventListener("click", toggleFocus);
    var x = $("focus-exit"); if (x) x.addEventListener("click", function () { setFocus(false); });
    document.addEventListener("keydown", function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "f" || e.key === "F") && !SDT.modal.isOpen()) { e.preventDefault(); toggleFocus(); }
      if (e.key === "Escape" && document.body.classList.contains("focus-call") && !SDT.modal.isOpen()) { var t = e.target && e.target.tagName; if (t !== "INPUT" && t !== "TEXTAREA" && t !== "SELECT") setFocus(false); }
    });
    bindSideTabs(); bindFlowToggle();
    applyCompact(!!SDT.prefs.get("ticketCompact", false));
    var cb = $("tk-compact"); if (cb) cb.addEventListener("click", function () { applyCompact(!document.body.classList.contains("tk-compact"), true); });
    document.addEventListener("keydown", function (e) {   // Alt+D compact view, Alt+W what the user said
      if (!e.altKey || e.ctrlKey || e.metaKey || SDT.modal.isOpen()) return;
      var k = String(e.key).toLowerCase();
      if (k === "d") { e.preventDefault(); if (global.location.hash !== "#ticket") global.location.hash = "#ticket"; applyCompact(!document.body.classList.contains("tk-compact"), true); }
      if (k === "w") { e.preventDefault(); if (global.location.hash !== "#ticket") global.location.hash = "#ticket"; setTimeout(function () { var s = $("tk-said"); if (s) s.focus(); }, 60); }
    });
    document.addEventListener("keydown", function (e) {   // Alt+Q: jump to the question flow search
      if (!(e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "q" || e.key === "Q")) || SDT.modal.isOpen()) return;
      e.preventDefault(); if (global.location.hash !== "#ticket") global.location.hash = "#ticket";
      setFlowCollapsed(false, false);
      setTimeout(function () { var f = document.querySelector("#tk-flow .fl-find"); if (f) f.focus(); else { var a = document.querySelector("#tk-flow .fl-answer, #tk-flow .fl-question"); if (a) a.focus(); } }, 60);
    });
    if ($("st-enable")) bindStorage();
    bindCorrupt(); renderCorrupt(); renderNet(); bindTabWarning(); guardInputs();
    global.addEventListener("online", renderNet); global.addEventListener("offline", renderNet);
    renderStorage();
    if (store.problem()) toast("Large storage could not be opened: " + store.problem());
    if (!store.get("tourDone", false) && !store.get("welcomeDismissed", false) && !(store.get("tickets", []) || []).length) setTimeout(function () { openTour(0); }, 600);
  }

  SDT.shell = { refreshStorage: function () { renderStorage(); renderCorrupt(); }, showFlows: function () { setFlowCollapsed(false, false); }, applyCompact: applyCompact, init: init, onView: onView, catColor: catColor, expandFlow: function () { setFlowCollapsed(false, false); }, openTour: openTour, toggleFocus: toggleFocus, togglePin: togglePin, pinCurrent: function () { var v = global.location.hash.replace("#", "") || "ticket"; if (nav.links && nav.links[v]) togglePin(v); }, renderStorage: renderStorage };
})(window);
