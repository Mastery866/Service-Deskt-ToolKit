const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..", "..");
const { JSDOM } = require("jsdom");
const path = require("path"), root = process.env.SDT_ROOT || (ROOT + "");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 150000);
JSDOM.fromFile(path.join(root, "index.html"), { runScripts: "dangerously", beforeParse(w) { require("../harness").installStorage(w, 60000000); }, resources: "usable", pretendToBeVisual: true, url: "file://" + root + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document; w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows = []; const t = async (label, fn, n = 1) => { const a = process.hrtime.bigint(); for (let i = 0; i < n; i++) await fn(); const ms = Number(process.hrtime.bigint() - a) / 1e6 / n; rows.push([label, ms]); console.log(label.padEnd(52), ms.toFixed(0).padStart(5) + " ms"); };
  setTimeout(async () => {
    Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
    const S = w.SDT, store = S.storage;
    const cats = ["Account Management", "Network", "Microsoft 365", "Hardware", "Software", "Security"], outs = ["Resolved", "Escalated", "Waiting on user"];
    const kb = store.get("kb"), tickets = [];
    for (let i = 0; i < 900; i++) {
      const day = new Date(Date.now() - i * 3600e3 * 1.7).toISOString(), k = kb[i % kb.length];
      const steps = Array.from({ length: 6 }, (_, j) => ({ text: "Step " + j + " for " + k.title, done: j < 4 }));
      tickets.push({ id: "T" + (1e12 + i), createdAt: day, updatedAt: day, shortDescription: cats[i % 6] + " issue " + i + " " + k.title, userId: "user" + (i % 120), userName: "User Number " + (i % 120), hostname: "PC-" + (i % 200), timeZone: "PHT",
        kis: [{ id: k.id, title: k.title }], flow: i % 4 === 0 ? { id: "f1", title: "Flow", resultId: "n3", resultText: "r", noKi: i % 8 === 0 } : null, outcome: outs[i % 3], minutes: 3 + (i % 25), followUp: "", ticketText: "Ticket text ".repeat(25), workNotes: "Work notes line\n".repeat(8),
        snapshot: { id: "x", userId: "user" + (i % 120), userName: "User", host: "PC", tz: "PHT", issue: "i", said: "", notes: "", shortDesc: "s", desc: "d".repeat(200), kis: [{ id: k.id, title: k.title, steps }], custom: [], outcome: outs[i % 3], timerMs: 0 } });
    }
    store.set("tickets", tickets); console.log("tickets stored:", store.get("tickets").length);
    const big = []; for (let i = 0; i < 300; i++) big.push(Object.assign({}, kb[i % kb.length], { id: "KB-" + String(500 + i), title: "Extra article " + i + " " + kb[i % kb.length].title }));
    store.set("kb", kb.concat(big));
    const size = JSON.stringify(store.exportAll()).length; console.log("data size: " + (size / 1e6).toFixed(2) + " MB, tickets " + tickets.length + ", KB " + (kb.length + 300) + "\n");
    const show = async (h, f) => { w.location.hash = "#" + h; await wait(5); if (f) f(); };
    await t("Ticket Generator: render", async () => { await show("ticket"); S.ticket.render(); }, 3);
    await t("Ticket History: open + render", async () => { await show("history"); S.history.render(); }, 3);
    await t("Dashboard: render", async () => { await show("dashboard"); S.dashboard && S.dashboard.render && S.dashboard.render(); }, 3);
    await t("Reports: render (all tickets)", async () => { await show("reports"); S.reports.render(); }, 3);
    await t("Library home (health check)", async () => { await show("library"); S.library.render(); }, 3);
    await t("Knowledge Base: render list", async () => { await show("kb"); S.kb.render ? S.kb.render() : 0; }, 3);
    await t("KB search across 330 articles", async () => { const i = d.getElementById("kb-search") || d.querySelector("#view-kb input[type=text]"); if (i) { i.value = "outlook password"; i.dispatchEvent(new w.Event("input")); await wait(260); } });
    await t("Command palette: open + type", async () => { d.getElementById("palette-btn").click(); await wait(5); const p = d.querySelector(".palette input"); p.value = "kb 5"; p.dispatchEvent(new w.Event("input")); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); }, 3);
    await t("Save a ticket (history grows)", async () => { await show("ticket"); const c = S.ticket.current(); c.userId = "u"; c.userName = "n"; c.host = "h"; c.shortDesc = "x"; S.ticket.save(); }, 3);
    await t("store.get('tickets') parse alone", async () => { store.get("tickets"); }, 10);
    await t("store.set('tickets') stringify alone", async () => { store.set("tickets", store.get("tickets")); }, 5);
    // how many times is tickets parsed while rendering history / reports?
    let parses = 0; const orig = w.JSON.parse; w.JSON.parse = function (s) { if (typeof s === "string" && s.length > 500000) parses++; return orig.apply(this, arguments); };
    parses = 0; await show("history"); S.history.render(); console.log("full parses of the ticket list while rendering History:", parses);
    parses = 0; await show("reports"); S.reports.render(); console.log("full parses of the ticket list while rendering Reports:", parses);
    parses = 0; await show("dashboard"); console.log("full parses on Dashboard view:", parses);
    parses = 0; await show("ticket"); S.ticket.render(); console.log("full parses on Ticket page render:", parses);
    process.exit(0);
  }, 1500);
});
