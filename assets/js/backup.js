/* backup.js - automatic backup to a folder you choose (Chrome and Edge on a computer), plus a request to keep
   the browser data. The folder permission has to be confirmed again each browser session; a "Reconnect" button
   appears when that is needed. One file per day is kept (the last 14 days). Nothing leaves your computer. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var DB_NAME = "sdt-handles", DB_STORE = "h", HANDLE_KEY = "backupDir", KEEP_DAYS = 14;
  var NAME_RE = /^ServiceDeskToolkit-backup-(\d{4}-\d{2}-\d{2})\.json$/;
  var handle = null, state = "none", lastSeq = -1, busy = false, lastError = "";
  // state: none | unsupported | ready | needs-permission | error

  var $ = window.SDT.dom.$;
  var toast = window.SDT.dom.toast;
  function supported() { return typeof global.showDirectoryPicker === "function" && !!global.indexedDB; }
  function enabled() { return !!SDT.settings.values().autoBackup; }

  /* ---- remember the chosen folder between sessions (IndexedDB can store folder handles) ---- */
  function db() {
    return new Promise(function (res, rej) {
      var r = global.indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(DB_STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var req = fn(d.transaction(DB_STORE, mode).objectStore(DB_STORE));
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      });
    });
  }

  function dayName(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "ServiceDeskToolkit-backup-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json";
  }
  function permission(request) {
    if (!handle) return Promise.resolve("denied");
    var opts = { mode: "readwrite" };
    var fn = request ? handle.requestPermission : handle.queryPermission;
    if (!fn) return Promise.resolve("granted");
    return Promise.resolve(fn.call(handle, opts)).catch(function () { return "denied"; });
  }

  async function prune() {
    var names = [];
    for await (var entry of handle.entries()) { if (entry[1].kind === "file" && NAME_RE.test(entry[0])) names.push(entry[0]); }
    names.sort().reverse();
    for (var i = KEEP_DAYS; i < names.length; i++) { try { await handle.removeEntry(names[i]); } catch (e) {} }
  }

  /* Writes today's backup file. Skips when nothing changed since the last backup (unless force). */
  async function run(reason, force) {
    if (!handle || !enabled() || busy) return false;
    var seq = store.seq();
    if (!force && seq === lastSeq) return false;
    busy = true;
    try {
      var perm = await permission(false);
      if (perm !== "granted") { state = "needs-permission"; render(); return false; }
      var now = new Date(), name = dayName(now);
      var data = JSON.stringify(store.exportAll(), null, 2);
      var fh = await handle.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(data); await w.close();
      lastSeq = seq; state = "ready"; lastError = "";
      store.set("lastBackup", now.toISOString());
      store.set("lastAutoBackup", { at: now.toISOString(), file: name, reason: reason || "" });
      try { await prune(); } catch (e) {}
      render();
      return true;
    } catch (e) {
      state = "error"; lastError = (e && e.message) || String(e);
      render();
      return false;
    } finally { busy = false; }
  }

  /* The newest backup file in the chosen folder (used by Settings > Check latest backup) */
  async function latest() {
    if (!handle) throw new Error("No backup folder is connected. Choose a backup folder first.");
    var p = await permission(true);
    if (p !== "granted") throw new Error("Permission to read the backup folder was not granted. Try Reconnect folder.");
    var names = [];
    for await (var entry of handle.entries()) { if (entry[1].kind === "file" && NAME_RE.test(entry[0])) names.push(entry[0]); }
    if (!names.length) throw new Error("There are no backup files in that folder yet.");
    names.sort().reverse();
    var fh = await handle.getFileHandle(names[0]);
    return { name: names[0], file: await fh.getFile() };
  }
  async function choose() {
    if (!supported()) return;
    try {
      var h = await global.showDirectoryPicker({ id: "sdt-backup", mode: "readwrite" });
      handle = h;
      await idb("readwrite", function (s) { return s.put(h, HANDLE_KEY); });
      SDT.settings.update("autoBackup", true);
      state = "ready";
      var ok = await run("folder chosen", true);
      toast(ok ? "Backup folder set - first backup saved" : "Backup folder set");
    } catch (e) {
      if (!e || e.name !== "AbortError") { state = "error"; lastError = (e && e.message) || String(e); toast("Could not use that folder"); }
    }
    render();
  }
  async function reconnect() {
    var perm = await permission(true);
    if (perm === "granted") { state = "ready"; var ok = await run("reconnected", true); toast(ok ? "Backup folder reconnected - backup saved" : "Reconnected"); }
    else toast("Permission was not granted");
    render();
  }
  async function stop() {
    handle = null; state = "none";
    SDT.settings.update("autoBackup", false);
    try { await idb("readwrite", function (s) { return s.delete(HANDLE_KEY); }); } catch (e) {}
    render(); toast("Automatic backup turned off");
  }

  function render() {
    var top = $("bk-reconnect-top");
    if (top) top.hidden = !(handle && enabled() && state === "needs-permission");
    var st = $("bk-status"); if (!st) return;
    var last = store.get("lastAutoBackup", null), persisted = store.get("persisted", null);
    var msg, cls = "";
    if (!supported()) { msg = "Automatic folder backup needs Chrome or Edge on a computer. Use Export backup instead."; cls = "warn-text"; }
    else if (!handle || !enabled()) msg = "Off. Choose a folder (for example one in OneDrive or on a network drive) and the app saves a backup there after each saved ticket and when you leave the page.";
    else if (state === "needs-permission") { msg = "Folder \"" + handle.name + "\" needs your permission again this session. Choose Reconnect."; cls = "warn-text"; }
    else if (state === "error") { msg = "The last backup failed: " + lastError; cls = "warn-text"; }
    else msg = "On. Folder: \"" + handle.name + "\"." + (last ? " Last backup: " + new Date(last.at).toLocaleString() + "." : " No backup written yet.") + " The last " + KEEP_DAYS + " days are kept.";
    st.textContent = msg; st.className = "empty small " + cls;
    var on = supported() && handle && enabled();
    $("bk-choose").textContent = on ? "Change folder" : "Choose backup folder";
    $("bk-choose").disabled = !supported();
    $("bk-now").hidden = !on || state === "needs-permission";
    $("bk-reconnect").hidden = !(on && state === "needs-permission");
    $("bk-stop").hidden = !on;
    var pn = $("bk-persist");
    if (pn) pn.textContent = persisted === true ? "The browser has agreed to keep this app's data, even when disk space runs low."
      : persisted === false ? "The browser did not promise to keep this app's data when disk space is low, so keep a folder backup." : "";
  }

  async function init() {
    if (global.navigator.storage && global.navigator.storage.persist) {
      try { store.set("persisted", await global.navigator.storage.persist()); } catch (e) {}
    }
    if ($("bk-choose")) {
      $("bk-choose").addEventListener("click", choose);
      $("bk-now").addEventListener("click", async function () { var ok = await run("manual", true); toast(ok ? "Backup saved to the folder" : "Backup not saved"); });
      $("bk-reconnect").addEventListener("click", reconnect);
      $("bk-stop").addEventListener("click", stop);
      $("bk-reconnect-top").addEventListener("click", reconnect);
    }
    if (!supported()) { state = "unsupported"; render(); return; }
    try { handle = await idb("readonly", function (s) { return s.get(HANDLE_KEY); }) || null; } catch (e) { handle = null; }
    if (handle && enabled()) { state = (await permission(false)) === "granted" ? "ready" : "needs-permission"; }
    render();
    document.addEventListener("visibilitychange", function () { if (document.hidden) run("leaving the page", false); });
    global.addEventListener("pagehide", function () { run("closing", false); });
    setInterval(function () { run("timer", false); }, 10 * 60 * 1000);
  }

  SDT.backup = { latest: latest, init: init, render: render, auto: function (reason) { return run(reason, true); }, run: run, status: function () { return state; } };
})(window);
