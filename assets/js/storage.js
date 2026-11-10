/* storage.js - safe wrapper around localStorage. All keys are prefixed. Every call is wrapped in try/catch
   so a blocked or corrupted store never breaks the app. Also: versioned data, export/import for backups.
   Optional "large storage": when you switch it on in Settings, the data moves to IndexedDB (hundreds of MB instead
   of about 5 MB). The calls below stay synchronous either way. Switching copies and verifies first, and can be undone. */
(function (global) {
  "use strict";
  var PREFIX = "sdt.";
  var SEED_VERSION = 2;       // bump when new starter articles are added
  var DATA_VERSION = 3;       // bump when the shape of saved data changes (see migrate)
  var APP_ID = "service-desk-toolkit";
  var memoryFallback = {};    // used only if localStorage is unavailable
  var LIMIT_CHARS = 5000000;  // browsers allow roughly 5 million characters per site
  var seq = 0;                // counts changes, so the folder backup can skip when nothing changed
  var QUIET = { lastBackup: 1, lastAutoBackup: 1, persisted: 1 };
  var ARRAY_KEYS = { tickets: 1, kb: 1, snippets: 1, emailTemplates: 1, flows: 1, scripts: 1, checklists: 1, presets: 1, quickRef: 1, emailLog: 1 };
  var OBJECT_KEYS = { settings: 1, uiPrefs: 1, lastUsed: 1 };
  var NAME_OK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, BLOCKED = { "__proto__": 1, "constructor": 1, "prototype": 1 };
  var quarantined = {}, quarantineMem = {};   // quarantineMem keeps the copy for this session when the browser has no room to store it
  /* ---- Record repair: wrong or missing fields are filled in with safe values (records are fixed in place only when needed) ---- */
  function S(x) { return typeof x === "string" ? x : (x == null || typeof x === "object" ? "" : String(x)); }
  function A(x) {
    if (Array.isArray(x)) { for (var i = 0; i < x.length; i++) if (typeof x[i] !== "string") return x.filter(function (v) { return v != null && typeof v !== "object"; }).map(S); return x; }
    return typeof x === "string" && x ? [x] : [];
  }
  function O(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : null; }
  function strs(r, names) { names.forEach(function (n) { if (typeof r[n] !== "string") r[n] = S(r[n]); }); }
  function arrs(r, names) { names.forEach(function (n) { r[n] = A(r[n]); }); }
  function idTitle(list) { return (Array.isArray(list) ? list : []).filter(O).map(function (k) { if (typeof k.id !== "string") k.id = S(k.id); if (typeof k.title !== "string") k.title = S(k.title); return k; }); }
  var FIX = {
    tickets: function (t) {
      strs(t, ["id", "createdAt", "shortDescription", "userId", "userName", "hostname", "outcome", "ticketText", "workNotes", "followUp"]);
      t.kis = idTitle(t.kis); if (t.minutes !== undefined && (typeof t.minutes !== "number" || t.minutes !== t.minutes)) t.minutes = 0;
      if (t.flow !== null && t.flow !== undefined && !O(t.flow)) t.flow = null;
      if (t.snapshot !== null && t.snapshot !== undefined) {
        if (!O(t.snapshot)) t.snapshot = null;
        else { var sn = t.snapshot; sn.kis = (Array.isArray(sn.kis) ? sn.kis : []).filter(O).map(function (k) { k.steps = (Array.isArray(k.steps) ? k.steps : []).filter(O); return k; }); sn.custom = (Array.isArray(sn.custom) ? sn.custom : []).filter(O); }
      }
      return t.id ? t : null;
    },
    kb: function (a) {
      strs(a, ["id", "title", "category", "subcategory", "notes", "reviewed"]); arrs(a, ["keywords", "synonyms", "steps", "related", "questions"]);
      if (!O(a.template)) a.template = { shortDescription: "", description: "" }; else strs(a.template, ["shortDescription", "description"]);
      a.favorite = !!a.favorite; return a.id ? a : null;
    },
    flows: function (f) {
      strs(f, ["id", "title", "category", "owner", "reviewed", "description", "start", "updatedAt"]); arrs(f, ["keywords", "tags"]);
      f.nodes = (Array.isArray(f.nodes) ? f.nodes : []).filter(O).map(function (n) {
        strs(n, ["id", "text", "search", "note"]); n.type = n.type === "q" ? "q" : "r"; arrs(n, ["kis"]);
        n.answers = (Array.isArray(n.answers) ? n.answers : []).filter(O).map(function (a) { strs(a, ["label", "next"]); return a; });
        if (n.goto !== undefined) n.goto = S(n.goto); if (n.unsure !== undefined) n.unsure = S(n.unsure); return n;
      }).filter(function (n) { return n.id; });
      return f.id ? f : null;
    },
    scripts: function (s2) {
      strs(s2, ["id", "title", "category", "filename", "description", "code", "createdAt", "updatedAt"]); arrs(s2, ["tags", "kis"]);
      if (!/^(bat|ps1|sh|reg|run|regpath|txt)$/.test(s2.type)) s2.type = "txt"; if (!/^(safe|changes|danger)$/.test(s2.risk)) s2.risk = "safe";
      s2.history = (Array.isArray(s2.history) ? s2.history : []).filter(O); s2.admin = !!s2.admin; s2.favorite = !!s2.favorite; return s2.id ? s2 : null;
    },
    snippets: function (x) { strs(x, ["id", "title", "text"]); return x.id ? x : null; },
    emailTemplates: function (x) { strs(x, ["id", "title", "to", "cc", "subject", "body"]); return x.id ? x : null; },
    checklists: function (c) { strs(c, ["id", "title", "description"]); arrs(c, ["items"]); return c.id ? c : null; }
  };
  /* A list must be a list of records, and a settings object must be an object. Anything else is set aside and replaced by the
     fallback, so one damaged entry can never stop the app from starting. Records that are usable are kept as they are. */
  function sane(key, v, raw, fallback) {
    if (ARRAY_KEYS[key] && v !== null) {
      if (!Array.isArray(v)) { quarantine(key, raw); return fallback; }
      var fix = FIX[key], good = [];
      for (var i = 0; i < v.length; i++) { var r = v[i]; if (r && typeof r === "object" && !Array.isArray(r)) { r = fix ? fix(r) : r; if (r) good.push(r); } }
      if (good.length !== v.length) quarantine(key, raw);
      return good;
    }
    if (OBJECT_KEYS[key] && v !== null && (typeof v !== "object" || Array.isArray(v))) { quarantine(key, raw); return fallback; }
    return v;
  }
  function isHiddenName(k) { return !!HIDDEN[k] || k.indexOf("corrupt.") === 0; }
  /* Data that cannot be read is set aside (never overwritten), so it can still be recovered from Settings. */
  function quarantine(key, raw) {
    if (quarantined[key] || key.indexOf("corrupt.") === 0) return;
    quarantined[key] = true;
    var name = "corrupt." + key + "." + Date.now();
    quarantineMem[name] = String(raw);
    try {
      if (mode === "idb") { memRaw[name] = String(raw); idbWrite(function (st) { st.put(String(raw), name); }); }
      else global.localStorage.setItem(PREFIX + name, String(raw));
    } catch (e) {}
    if (global.SDT.storage && global.SDT.storage.onCorrupt) global.SDT.storage.onCorrupt(key);
  }
  function checksum(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return h.toString(16);
  }
  var MODE_KEY = PREFIX + "storageMode";   // always kept in localStorage, never exported
  var HIDDEN = { storageMode: 1 };
  var EXTERNAL = { errorLog: 1 };          // written straight to localStorage by errorlog.js
  var BIG_LIMIT = 250000000;               // display limit for large storage (characters)
  var mode = "ls", memRaw = {}, db = null, readyP = null, channel = null, problem = "";

  /* ---- IndexedDB helpers (used only in large-storage mode) ---- */
  function openDb() {
    return new Promise(function (res, rej) {
      if (!global.indexedDB) { rej(new Error("This browser does not offer large storage.")); return; }
      var r = global.indexedDB.open("sdt-data", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error("Could not open large storage.")); };
      r.onblocked = function () { rej(new Error("Large storage is blocked by another open tab. Close other copies of the app and try again.")); };
    });
  }
  function readAll(d) {
    return new Promise(function (res, rej) {
      var out = {}, req = d.transaction("kv", "readonly").objectStore("kv").openCursor();
      req.onsuccess = function () { var c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function fail() { if (global.SDT.storage && global.SDT.storage.onFull) global.SDT.storage.onFull("write"); }
  function idbWrite(fn) {
    if (!db) return;
    try { var tx = db.transaction("kv", "readwrite"); fn(tx.objectStore("kv")); tx.onerror = fail; tx.onabort = fail; } catch (e) { fail(); }
  }
  function announce(key) { try { if (channel) channel.postMessage({ key: key }); } catch (e) {} }
  function listen() {
    if (typeof global.BroadcastChannel !== "function") return;
    try {
      channel = new global.BroadcastChannel("sdt-storage");
      channel.onmessage = function (m) {
        var key = m && m.data && m.data.key; if (!key || !db) return;
        var rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
        rq.onsuccess = function () { if (rq.result === undefined) delete memRaw[key]; else memRaw[key] = rq.result; seq++; };
      };
    } catch (e) { channel = null; }
  }
  function wantsBig() { try { return global.localStorage.getItem(MODE_KEY) === "idb"; } catch (e) { return false; } }
  /* Resolves when the data is loaded. In normal mode this is instant. */
  function ready() {
    if (!readyP) readyP = wantsBig() ? openDb().then(function (d) { db = d; return readAll(d); }).then(function (rec) { memRaw = rec; mode = "idb"; listen(); })
      .catch(function (e) { mode = "ls"; problem = (e && e.message) || "Large storage could not be opened."; }) : Promise.resolve();
    return readyP;
  }
  function big() { return mode === "idb"; }

  function get(key, fallback) {
    if (big() && !EXTERNAL[key]) {
      var r = memRaw[key];
      if (r === undefined) return key in memoryFallback ? memoryFallback[key] : fallback;
      var pv; try { pv = JSON.parse(r); } catch (e) { quarantine(key, r); return fallback; }
      return sane(key, pv, r, fallback);
    }
    if (key in memoryFallback) return memoryFallback[key];     // the newest value when the last save did not fit
    var raw = null;
    try { raw = global.localStorage.getItem(PREFIX + key); } catch (e) { return fallback; }
    if (raw === null) return fallback;
    var v; try { v = JSON.parse(raw); } catch (e) { quarantine(key, raw); return fallback; }
    return sane(key, v, raw, fallback);
  }
  function set(key, value) {
    if (!QUIET[key]) seq++;
    if (big() && !EXTERNAL[key]) {
      var raw = JSON.stringify(value);
      if (raw === undefined) { remove(key); return true; }
      memRaw[key] = raw; idbWrite(function (st) { st.put(raw, key); }); announce(key); return true;
    }
    try {
      global.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      delete memoryFallback[key];
      return true;
    } catch (e) {
      memoryFallback[key] = value;
      if (global.SDT.storage && global.SDT.storage.onFull) global.SDT.storage.onFull(key);
      return false;
    }
  }
  function usage() {
    var n = 0;
    if (big()) {
      Object.keys(memRaw).forEach(function (k) { n += k.length + memRaw[k].length; });
      return { chars: n, limit: BIG_LIMIT, pct: Math.min(100, Math.round(n * 100 / BIG_LIMIT)) };
    }
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) n += k.length + (global.localStorage.getItem(k) || "").length;
      }
    } catch (e) {}
    return { chars: n, limit: LIMIT_CHARS, pct: Math.min(100, Math.round(n * 100 / LIMIT_CHARS)) };
  }
  /* A read-only view of a collection. The same parsed copy is returned until anything is saved, so screens that read the
     list several times while drawing do not parse it again each time. Treat the result as read-only (copy before sorting). */
  var readCache = {};
  function cached(key, fallback) {
    var c = readCache[key];
    if (c && c.seq === seq && c.big === mode) return c.v;
    var v = get(key, fallback); readCache[key] = { seq: seq, big: mode, v: v }; return v;
  }
  function remove(key) {
    if (!QUIET[key]) seq++;
    if (big() && !EXTERNAL[key]) { delete memRaw[key]; idbWrite(function (st) { st.delete(key); }); announce(key); delete memoryFallback[key]; return; }
    delete memoryFallback[key];
    try { global.localStorage.removeItem(PREFIX + key); } catch (e) {}
    delete memoryFallback[key];
  }
  function keys() {
    var out = [];
    if (big()) out = Object.keys(memRaw);
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0) continue;
        var name = k.slice(PREFIX.length);
        if (isHiddenName(name) || out.indexOf(name) > -1) continue;
        if (!big() || EXTERNAL[name]) out.push(name);
      }
    } catch (e) {}
    if (big()) out = out.filter(function (n) { return !isHiddenName(n); });
    Object.keys(memoryFallback).forEach(function (k) { if (out.indexOf(k) === -1) out.push(k); });
    return out;
  }

  /* ---- Backup / restore ---- */
  function exportAll() {
    var data = {};
    keys().forEach(function (k) { data[k] = get(k, null); });
    return { app: APP_ID, dataVersion: get("dataVersion", DATA_VERSION), exportedAt: new Date().toISOString(), checksum: checksum(JSON.stringify(data)), data: data };
  }
  /* Checks a backup before anything is touched. Returns a list of problems (empty means it is fine). */
  function validateBackup(obj) {
    var errs = [];
    if (!obj || obj.app !== APP_ID || !obj.data || typeof obj.data !== "object" || Array.isArray(obj.data)) return ["This file is not a Service Desk Toolkit backup."];
    var names = Object.keys(obj.data);
    if (names.length > 500) errs.push("It has too many items (" + names.length + ").");
    names.forEach(function (k) {
      if (BLOCKED[k] || !NAME_OK.test(k)) { errs.push("It contains an item with an unsafe name."); return; }
      if (isHiddenName(k)) return;
      var v = obj.data[k];
      if (ARRAY_KEYS[k] && v !== null && !Array.isArray(v)) errs.push("\"" + k + "\" is damaged (expected a list).");
    });
    return errs.filter(function (e, i) { return errs.indexOf(e) === i; });
  }
  /* Replaces all data with a backup. It checks the file first, and puts everything back if the restore cannot finish. */
  function importAll(obj, opts) {
    opts = opts || {};
    var errs = validateBackup(obj);
    if (errs.length) throw new Error("This backup cannot be restored. " + errs.slice(0, 3).join(" "));
    if (obj.checksum && !opts.ignoreChecksum && obj.checksum !== checksum(JSON.stringify(obj.data))) {
      var ce = new Error("This backup file looks damaged, or it was edited after it was saved."); ce.checksum = true; throw ce;
    }
    var before = exportAll().data, names = Object.keys(obj.data).filter(function (k) { return !isHiddenName(k); });
    try {
      keys().forEach(remove);
      names.forEach(function (k) { if (obj.data[k] !== null && set(k, obj.data[k]) === false) throw new Error("There is not enough room to restore everything, so nothing was changed."); });
    } catch (e) {
      keys().forEach(remove);
      Object.keys(before).forEach(function (k) { if (before[k] !== null) set(k, before[k]); });
      throw e;
    }
    return names.length;
  }
  /* Unreadable data that was set aside (see Settings > Stored data) */
  function corruptItems() {
    var out = {};
    try {
      for (var i = 0; i < global.localStorage.length; i++) { var k = global.localStorage.key(i); if (k && k.indexOf(PREFIX + "corrupt.") === 0) out[k.slice(PREFIX.length)] = global.localStorage.getItem(k); }
    } catch (e) {}
    Object.keys(memRaw).forEach(function (k) { if (k.indexOf("corrupt.") === 0) out[k] = memRaw[k]; });
    Object.keys(quarantineMem).forEach(function (k) { if (out[k] === undefined) out[k] = quarantineMem[k]; });
    return out;
  }
  function clearCorrupt() {
    var n = 0;
    Object.keys(corruptItems()).forEach(function (k) { try { global.localStorage.removeItem(PREFIX + k); } catch (e) {} delete quarantineMem[k]; if (memRaw[k] !== undefined) { delete memRaw[k]; idbWrite(function (st) { st.delete(k); }); } n++; });
    return n;
  }
  function clearAll() { keys().forEach(remove); }

  /* ---- Switching between normal and large storage (Settings > Data) ---- */
  function lsEntries() {
    var out = {};
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0) continue;
        var name = k.slice(PREFIX.length);
        if (!isHiddenName(name) && !EXTERNAL[name]) out[name] = global.localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  }
  /* Copies everything to IndexedDB, reads it back to check, and only then turns large storage on. The old copy stays
     until you choose to free it, so nothing is lost if something goes wrong. */
  function enableLarge() {
    if (big()) return Promise.resolve(0);
    var entries = lsEntries(), names = Object.keys(entries), d;
    return openDb().then(function (x) {
      d = x;
      return new Promise(function (res, rej) {
        var tx = d.transaction("kv", "readwrite"), st = tx.objectStore("kv");
        names.forEach(function (k) { st.put(entries[k], k); });
        tx.oncomplete = res; tx.onerror = tx.onabort = function () { rej(tx.error || new Error("Writing to large storage failed.")); };
      });
    }).then(function () { return readAll(d); }).then(function (back) {
      names.forEach(function (k) { if (back[k] !== entries[k]) throw new Error("Check failed for \"" + k + "\". Nothing was changed."); });
      d.close();
      global.localStorage.setItem(MODE_KEY, "idb");
      return names.length;
    });
  }
  /* Copies everything back to localStorage. If it does not fit, nothing changes. */
  function disableLarge() {
    if (!big()) return Promise.resolve(0);
    var names = Object.keys(memRaw), written = [];
    try {
      names.forEach(function (k) { global.localStorage.setItem(PREFIX + k, memRaw[k]); written.push(k); });
    } catch (e) {
      return Promise.reject(new Error("There is not enough room in normal browser storage (about 5 MB). Large storage stays on."));
    }
    global.localStorage.removeItem(MODE_KEY);
    return Promise.resolve(names.length);
  }
  function legacyCount() {
    if (!big()) return 0;
    return Object.keys(lsEntries()).length;
  }
  function freeLegacy() {
    if (!big()) return 0;
    var n = 0, e = lsEntries();
    Object.keys(e).forEach(function (k) { try { global.localStorage.removeItem(PREFIX + k); n++; } catch (x) {} });   // in large mode these old copies are never read
    return n;
  }

  /* ---- Data migrations (run on every start; safe to repeat) ---- */
  function migrate() {
    var v = get("dataVersion", 0);
    if (v < 3) {
      // v3: tickets hold a list of KIs; temporary notes are no longer stored in history.
      var tickets = get("tickets", []);
      if (Array.isArray(tickets)) {
        tickets.forEach(function (t) {
          if (t.ki && !t.kis) t.kis = [t.ki];
          delete t.ki;
          delete t.tempNotes;
        });
        set("tickets", tickets);
      }
    }
    set("dataVersion", DATA_VERSION);
  }

  /* First run: copy the starter KB. Upgrade: add starter articles whose ID is missing.
     Existing articles (including your edits and favorites) are never overwritten. */
  function seed() {
    var seedKb = JSON.parse(JSON.stringify(global.SDT_SEED_KB || []));
    var kb = get("kb", null);
    if (!Array.isArray(kb)) {
      set("kb", seedKb);
    } else if (get("seedVersion", 0) < SEED_VERSION) {
      var have = {};
      kb.forEach(function (a) { have[a.id] = true; });
      seedKb.forEach(function (a) { if (!have[a.id]) kb.push(a); });
      set("kb", kb);
    }
    set("seedVersion", SEED_VERSION);
    migrate();
  }

  global.SDT = global.SDT || {};
  if (global.addEventListener) global.addEventListener("storage", function (e) { if (e.key && e.key.indexOf(PREFIX) === 0 && !QUIET[e.key.slice(PREFIX.length)]) seq++; });

  global.SDT.storage = { ready: ready, mode: function () { return mode; }, problem: function () { return problem; }, enableLarge: enableLarge, disableLarge: disableLarge,
                         legacyCount: legacyCount, freeLegacy: freeLegacy, seq: function () { return seq; }, usage: usage, onFull: null, get: get, set: set, remove: remove, keys: keys, seed: seed,
                         cached: cached, exportAll: exportAll, importAll: importAll, clearAll: clearAll, validateBackup: validateBackup, checksumOf: function (data) { return checksum(JSON.stringify(data)); }, corruptItems: corruptItems, clearCorrupt: clearCorrupt, onCorrupt: null };
})(window);
