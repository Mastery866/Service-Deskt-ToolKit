const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const vm = require("vm"), fs = require("fs"), path = require("path");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const src = fs.readFileSync(path.join(process.env.SDT_ROOT || (ROOT + ""), "assets/js/storage.js"), "utf8");
function makeLS(limit) {
  const m = new Map();
  return { get length() { return m.size; }, key: i => Array.from(m.keys())[i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { let tot = 0; m.forEach((x, y) => { if (y !== k) tot += x.length + y.length; }); if (limit && tot + String(v).length + k.length > limit) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    removeItem: k => m.delete(k), _m: m };
}
function session(ls) {
  const win = { localStorage: ls, indexedDB, IDBKeyRange, SDT: {}, SDT_SEED_KB: [] }; win.window = win; vm.createContext(win); vm.runInContext(src, win); return win.SDT.storage;
}
let pass = 0, fail = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
(async () => {
  // ---- unreadable data is set aside, never overwritten ----
  let ls = makeLS(), s = session(ls), flagged = [];
  s.onCorrupt = k => flagged.push(k);
  ls.setItem("sdt.kb", "{this is not json");
  ok("unreadable value returns the fallback", JSON.stringify(s.get("kb", "FALLBACK")) === '"FALLBACK"');
  ok("the owner was told once", flagged.length === 1 && flagged[0] === "kb"); s.get("kb"); ok("not told twice", flagged.length === 1);
  const set = Object.keys(s.corruptItems());
  ok("a copy was set aside with the original text", set.length === 1 && s.corruptItems()[set[0]] === "{this is not json");
  s.set("kb", [{ id: "KB-001" }]);
  ok("saving new data does not destroy the set-aside copy", Object.keys(s.corruptItems()).length === 1);
  ok("set-aside data is hidden from keys() and backups", !s.keys().some(k => k.startsWith("corrupt.")) && !Object.keys(s.exportAll().data).some(k => k.startsWith("corrupt.")));
  ok("clearCorrupt removes it", s.clearCorrupt() === 1 && Object.keys(s.corruptItems()).length === 0);

  // ---- no room to keep the set-aside copy: still offered for this session ----
  ls = makeLS(120); s = session(ls); ls.setItem("sdt.kb", "{bad" + "z".repeat(50)); s.setItem; 
  s.get("kb"); ls.setItem("sdt.pad", "p".repeat(40));
  ok("the copy is kept in memory when the browser has no room", Object.keys(s.corruptItems()).length === 1 && Object.values(s.corruptItems())[0].startsWith("{bad"));

  // ---- a save that does not fit is still readable this session ----
  ls = makeLS(400); s = session(ls); let full = 0; s.onFull = () => full++;
  ok("small save works", s.set("a", { v: 1 }) === true);
  const bigVal = { v: "x".repeat(2000) };
  ok("oversized save reports failure", s.set("a", bigVal) === false && full === 1);
  ok("the newest value is still what the app reads (not stale data)", s.get("a").v.length === 2000);
  s.set("a", { v: 2 }); ok("a later save that fits clears the temporary copy", s.get("a").v === 2 && ls.getItem("sdt.a").includes('"v":2'));

  // ---- backup validation ----
  ls = makeLS(); s = session(ls);
  const good = { app: "service-desk-toolkit", data: { tickets: [], kb: [{ id: "KB-001" }], theme: "dark" } };
  ok("a good backup has no problems", s.validateBackup(good).length === 0);
  ok("not a backup", s.validateBackup({ app: "other", data: {} }).length > 0 && s.validateBackup(null).length > 0 && s.validateBackup("text").length > 0);
  ok("data must be an object, not a list", s.validateBackup({ app: "service-desk-toolkit", data: [1, 2] }).length > 0);
  const evil = JSON.parse('{"app":"service-desk-toolkit","data":{"__proto__":{"polluted":1}}}');
  ok("a __proto__ key is refused", s.validateBackup(evil).length > 0 && ({}).polluted === undefined);
  ok("unsafe item names are refused", s.validateBackup({ app: "service-desk-toolkit", data: { "../x": 1 } }).length > 0 && s.validateBackup({ app: "service-desk-toolkit", data: { "a b": 1 } }).length > 0);
  ok("lists must be lists", s.validateBackup({ app: "service-desk-toolkit", data: { tickets: "not a list" } }).length > 0 && s.validateBackup({ app: "service-desk-toolkit", data: { kb: { a: 1 } } }).length > 0);
  let threw = ""; try { s.importAll({ app: "service-desk-toolkit", data: { tickets: 5 } }); } catch (e) { threw = e.message; }
  ok("importAll refuses it before touching anything", /cannot be restored/.test(threw));

  // ---- a failed restore puts everything back ----
  ls = makeLS(1500); s = session(ls);
  s.set("tickets", [{ id: "T1", t: "keep me" }]); s.set("kb", [{ id: "KB-001", title: "original" }]);
  const beforeSnap = JSON.stringify(s.exportAll().data);
  threw = ""; try { s.importAll({ app: "service-desk-toolkit", data: { tickets: [{ id: "N1", pad: "y".repeat(5000) }], kb: [] } }); } catch (e) { threw = e.message; }
  ok("an oversized restore fails with a clear message", /not enough room/.test(threw));
  ok("and the original data is exactly as before", JSON.stringify(s.exportAll().data) === beforeSnap);

  // ---- checksums ----
  ls = makeLS(); s = session(ls); s.set("tickets", [{ id: "T1" }]); s.set("kb", [{ id: "KB-1" }]);
  const exp = JSON.parse(JSON.stringify(s.exportAll()));
  ok("exports carry a checksum", typeof exp.checksum === "string" && exp.checksum.length >= 6);
  s.clearAll(); ok("an untouched export restores", s.importAll(exp) === 2 && s.get("tickets")[0].id === "T1");
  const tampered = JSON.parse(JSON.stringify(exp)); tampered.data.tickets[0].id = "HACKED";
  threw = null; try { s.importAll(tampered); } catch (e) { threw = e; }
  ok("an edited export is flagged as damaged", threw && threw.checksum === true);
  ok("and the data was not changed by the failed attempt", s.get("tickets")[0].id === "T1");
  ok("it can still be restored on purpose", s.importAll(tampered, { ignoreChecksum: true }) === 2 && s.get("tickets")[0].id === "HACKED");
  const old = { app: "service-desk-toolkit", data: { tickets: [] } };
  ok("older backups without a checksum still restore", s.importAll(old) === 1);

  // ---- the same protections in large-storage mode ----
  ls = makeLS(); s = session(ls); s.set("tickets", [{ id: "T1" }]); await s.enableLarge();
  s = session(ls); await s.ready(); ok("large storage is on", s.mode() === "idb");
  s.set("kb", [{ id: "KB-1" }]);
  const e2 = s.exportAll(); ok("large mode exports a checksum", !!e2.checksum);
  threw = ""; try { s.importAll({ app: "service-desk-toolkit", data: { tickets: "bad" } }); } catch (e) { threw = e.message; }
  ok("large mode refuses bad backups", /cannot be restored/.test(threw) && s.get("tickets")[0].id === "T1");
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})().catch(e => { console.log("THROW", e); process.exit(1); });
