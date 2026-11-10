const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
/* Damaged or hand-edited data: every page must still open, and nothing may throw. */
const { JSDOM } = require("jsdom"), path = require("path");
const root = process.env.SDT_ROOT || (ROOT + "");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 200000);
const wait = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
const bad = {
  tickets: [null, 5, "text", {}, { id: "x" }, { id: "y", createdAt: "garbage", kis: "nope", snapshot: null, shortDescription: 7 }, { id: "z", createdAt: new Date().toISOString(), shortDescription: "ok", userId: "u", kis: [null, { id: 5 }], snapshot: { kis: "bad", custom: null }, flow: "bad", outcome: {} }],
  kb: [null, 7, { id: "KB-900" }, { id: "KB-901", title: 5, steps: "x", keywords: null, related: "KB-1", questions: 4 }, { id: "KB-902", title: "Fine", category: "Network", steps: ["a", null, 5], keywords: ["k"] }],
  flows: [null, { id: "f1", title: "No nodes" }, { id: "f2", title: "Bad nodes", nodes: "bad", start: 5 }, { id: "f3", title: "Dangling", start: "zz", nodes: [{ id: "n1" }, { id: "n2", type: "q", text: "Q", answers: [{ label: "A", next: "gone" }, null] }, { id: "n3", type: "r", kis: "KB-1", text: 5 }] }],
  scripts: [null, { id: "s1" }, { id: "s2", title: "No code", category: "X" }, { id: "s3", title: "Odd", category: "X", type: "weird", code: 5, tags: "x", kis: "KB-1", history: "bad" }],
  snippets: [null, { id: "a" }, { id: "b", title: 5, text: null }],
  emailTemplates: [null, { id: "e1" }, { id: "e2", title: "T", subject: 5, body: null }],
  checklists: [null, { id: "c1", title: "No items" }, { id: "c2", title: "Bad items", items: "bad" }],
  presets: [null, 5, { id: "p" }], quickRef: [null, { id: "q" }], emailLog: [null, 5],
  settings: "not an object", uiPrefs: ["x"], flowRecent: "bad", flowPins: { a: 1 }, scriptsSeed2: true, favorites: "bad"
};
JSDOM.fromFile(path.join(root, "index.html"), { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "file://" + root + "/index.html",
  beforeParse(w) {
    const ls = require("./harness").installStorage(w);
    Object.keys(bad).forEach(k => ls.setItem("sdt." + k, JSON.stringify(bad[k])));
    w.addEventListener("error", e => errs.push(e.message + " @" + String(e.filename || "").split("/").pop() + ":" + e.lineno));
    w.addEventListener("unhandledrejection", e => errs.push("rejection: " + (e.reason && e.reason.message)));
  } }).then(async dom => {
  const w = dom.window, d = w.document; w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  await wait(1600); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
  console.log("errors during start-up with damaged data:", errs.length); errs.slice(0, 8).forEach(e => console.log("   " + e));
  const views = ["ticket", "history", "favorites", "library", "kb", "flows", "checklists", "snippets", "email", "scripts", "reference", "tools", "dashboard", "reports", "settings"];
  const perView = {};
  for (const v of views) {
    const before = errs.length; w.location.hash = "#" + v; await wait(120);
    const view = d.getElementById("view-" + v);
    // open every card / click every button once
    Array.from(view.querySelectorAll("details")).slice(0, 30).forEach(x => { x.open = true; }); await wait(40);
    for (const b of Array.from(view.querySelectorAll("button")).filter(b => !b.disabled && !b.hidden).slice(0, 60)) {
      if (!b.isConnected) continue; if (/Restore|Free the old|Use large|Back to normal/.test(b.textContent)) continue;
      try { b.click(); } catch (e) { errs.push("click threw: " + e.message); } await wait(8);
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(8);
      const dis = Array.from(d.querySelectorAll(".modal button")).find(x => /^(discard|leave)/i.test(x.textContent.trim())); if (dis) dis.click();
      if (w.location.hash !== "#" + v) { w.location.hash = "#" + v; await wait(30); }
    }
    perView[v] = errs.length - before;
  }
  Object.keys(perView).filter(v => perView[v]).forEach(v => console.log("   page '" + v + "': " + perView[v] + " error(s)"));
  const total = errs.length; console.log((total === 0 ? "PASS" : "FAIL") + " every page opened and every button worked with damaged data (" + total + " errors)");
  if (total) { const seen = {}; errs.forEach(e => { seen[e] = (seen[e] || 0) + 1; }); Object.keys(seen).slice(0, 25).forEach(e => console.log("   " + seen[e] + "x " + e)); }
  process.exit(total ? 1 : 0);
});
