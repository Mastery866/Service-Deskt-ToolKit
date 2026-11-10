const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const vm = require("vm"), fs = require("fs");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const src = fs.readFileSync((ROOT + "/assets/js/storage.js"), "utf8");
function makeLS(limit) {
  const m = new Map();
  return { get length() { return m.size; }, key: i => Array.from(m.keys())[i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { let tot = 0; m.forEach((x, y) => { if (y !== k) tot += x.length + y.length; }); if (limit && tot + v.length + k.length > limit) throw new Error("quota"); m.set(k, String(v)); },
    removeItem: k => m.delete(k), _m: m };
}
function session(ls) {
  const win = { localStorage: ls, indexedDB, IDBKeyRange, SDT: {}, SDT_SEED_KB: [], BroadcastChannel: undefined };
  win.window = win; vm.createContext(win); vm.runInContext(src, win); return win.SDT.storage;
}
let pass = 0, fail = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
(async () => {
  const ls = makeLS();
  let s = session(ls);
  await s.ready(); ok("normal mode by default", s.mode() === "ls");
  s.set("tickets", [{ id: "T1", t: "héllo ✓" }]); s.set("kb", [{ id: "KB-001" }]); s.set("theme", "dark");
  ls.setItem("sdt.errorLog", "[]");
  ok("exportAll in normal mode has 3+ keys", Object.keys(s.exportAll().data).length >= 3);
  const n = await s.enableLarge();
  ok("enableLarge moved keys: " + n, n === 3);
  ok("mode flag kept in localStorage", ls.getItem("sdt.storageMode") === "idb");

  // "reload"
  s = session(ls); await s.ready();
  ok("big mode after reload", s.mode() === "idb");
  ok("data intact (records keep their own values; missing fields get safe defaults)", s.get("tickets").length === 1 && s.get("tickets")[0].id === "T1" && s.get("tickets")[0].t === "héllo ✓" && s.get("theme") === "dark");
  ok("storageMode not exported", !("storageMode" in s.exportAll().data));
  s.set("tickets", [{ id: "T1" }, { id: "T2" }]); s.remove("theme");
  ok("get returns copies (no shared mutation)", (() => { const a = s.get("tickets"); a.push({ id: "X" }); return s.get("tickets").length === 2; })());
  ok("legacy copy still in localStorage (rollback)", ls.getItem("sdt.tickets") !== null);
  ok("stale legacy NOT resurrected after remove", s.get("theme", "none") === "none");
  ok("big usage limit", s.usage().limit > 100000000);
  ok("keys() has no storageMode and no duplicates", (() => { const k = s.keys(); return !k.includes("storageMode") && new Set(k).size === k.length; })());

  // "reload" again: writes persisted?
  await new Promise(r => setTimeout(r, 50));
  s = session(ls); await s.ready();
  ok("writes persisted across reload", s.get("tickets").length === 2 && s.get("theme", "none") === "none");

  ok("legacy count > 0", s.legacyCount() > 0);
  const freed = s.freeLegacy(); ok("freeLegacy removed copies: " + freed, freed > 0 && s.legacyCount() === 0 && ls.getItem("sdt.tickets") === null);
  ok("errorLog untouched", ls.getItem("sdt.errorLog") === "[]");

  // back to normal
  const back = await s.disableLarge(); ok("disableLarge copied " + back, back >= 2);
  s = session(ls); await s.ready();
  ok("normal mode again with data", s.mode() === "ls" && s.get("tickets").length === 2);

  // quota failure on the way back keeps big mode
  const ls2 = makeLS(); let t = session(ls2); await t.ready();
  t.set("kb", [{ id: "KB-001", body: "x".repeat(500) }]); await t.enableLarge();
  t = session(ls2); await t.ready(); t.freeLegacy();
  ls2._limit = 1; const tiny = makeLS(300); // simulate tiny quota by swapping the store used for disable
  let threw = false; try { const big = session(ls2); await big.ready(); big.set("kb", [{ blob: "y".repeat(2000) }]); Object.defineProperty(ls2, "setItem", { value: () => { throw new Error("quota"); } }); await big.disableLarge(); } catch (e) { threw = /not enough room/i.test(e.message); }
  ok("disableLarge fails safely when it does not fit", threw);
  const stay = session(ls2); await stay.ready(); ok("still large after failed switch-back", stay.mode() === "idb");
  console.log(pass + " passed, " + fail + " failed");
})().catch(e => { console.log("THROW", e); process.exit(1); });
