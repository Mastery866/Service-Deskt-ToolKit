const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, wait = ms => new Promise(r => setTimeout(r, ms));
  setTimeout(async () => {
    const S = w.SDT;
    const snap = { kis: [{ steps: [{ text: "Restart the VPN client", done: true }, { text: "Skipped step", done: false }] }], custom: [{ text: "Cleared cache", done: true }], flow: { path: [{ q: "Is this the first time?", a: "No" }] } };
    const d = S.ticket.kiDraft(snap, { id: "T9", shortDescription: "VPN certificate expired for user" });
    console.log(JSON.stringify(d));
    console.log((d.steps.length === 2 && d.steps[0] === "Restart the VPN client" && d.steps[1] === "Cleared cache" ? "PASS" : "FAIL") + " a KI draft keeps the completed steps");
    // old stored data: scripts without new fields still render
    S.storage.set("scripts", [{ id: "old1", title: "Old script", category: "Old", type: "bat", code: "echo hi", description: "", createdAt: "", updatedAt: "" }]);
    S.storage.set("scriptsSeed2", false);
    S.scripts.render(); await wait(50);
    console.log((S.scripts.list().some(s => s.id === "old1") && S.scripts.list().length > 50 ? "PASS" : "FAIL") + " upgrading keeps old scripts and adds the new ones");
    // secrets scan false-positive check on starter content
    const bad = S.scripts.list().filter(s => S.secrets.scan(s.code).length);
    console.log((bad.length === 0 ? "PASS" : "FAIL") + " no built-in script is flagged as a secret");
    console.log((S.secrets.scan("password=Sup3rS3cret99").length === 1 && S.secrets.scan("password={{pw}} and %PASSWORD%").length === 0 ? "PASS" : "FAIL") + " the secret scanner flags real secrets and ignores placeholders");
    process.exit(0);
  }, 1500);
});
