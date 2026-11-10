/* Test helper: gives the jsdom window a real, quota-limited localStorage (jsdom refuses it on file:// pages),
   so the app is tested on its normal storage path, not on the in-memory fallback. */
module.exports.installStorage = function (w, quota, shared) {
  const m = shared || new Map(), LIMIT = quota || 5000000;
  const ls = {
    get length() { return m.size; }, key: i => Array.from(m.keys())[i] ?? null, getItem: k => m.has(String(k)) ? m.get(String(k)) : null,
    setItem(k, v) { k = String(k); v = String(v); let tot = 0; m.forEach((x, y) => { if (y !== k) tot += x.length + y.length; }); if (tot + k.length + v.length > LIMIT) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } m.set(k, v); },
    removeItem: k => { m.delete(String(k)); }, clear: () => m.clear(), _map: m
  };
  Object.defineProperty(w, "localStorage", { value: ls, configurable: true });
  return ls;
};
