const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 110000);
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const btn = (txt, root) => Array.from((root || d).querySelectorAll("button")).find(x => x.textContent.trim() === txt);
  const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const closeModals = async () => { for (let i = 0; i < 4; i++) { Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40); const dis = Array.from(d.querySelectorAll(".modal button")).find(b => /^(discard|leave)/i.test(b.textContent.trim())); if (dis) { dis.click(); await wait(40); } } };
  setTimeout(async () => {
    try {
      const S = w.SDT, store = S.storage;
      await wait(700); await closeModals();
      const before = { kb: store.get("kb").length, flows: S.flows.list().length, scripts: S.scripts.list().length, sn: store.get("snippets").length, em: store.get("emailTemplates").length, cl: store.get("checklists").length };
      const pack = S.library.starterPack();
      ok("pack builds (13 flows parse)", pack.parts.flows.length === 13 && pack.parts.kb.length === 24);
      ok("secret scan finds nothing in the pack", S.secrets.scan(JSON.stringify(pack)).length === 0);

      w.location.hash = "#library"; await wait(100);
      ok("Add starter content button on Library home", !!btn("Add starter content..."));
      btn("Add starter content...").click(); await wait(100);
      const modalText = d.querySelector(".modal").textContent;
      ok("preview lists all six parts", /Knowledge Base articles/.test(modalText) && /Question flows/.test(modalText) && /Scripts and commands/.test(modalText) && /Canned responses/.test(modalText) && /Email templates/.test(modalText) && /Checklists/.test(modalText));
      ok("preview says what is new", /13 new/.test(modalText) && /7 new/.test(modalText) && /6 new/.test(modalText));
      btn("Import", d.querySelector(".modal")).click(); await wait(250);
      const a = { flows: S.flows.list().length, scripts: S.scripts.list().length, sn: store.get("snippets").length, em: store.get("emailTemplates").length, cl: store.get("checklists").length };
      ok("flows added (+13)", a.flows === before.flows + 13);
      ok("scripts added", a.scripts > before.scripts + 30);
      ok("canned responses added (+13)", a.sn === before.sn + 13);
      ok("email templates added (+6)", a.em === before.em + 6);
      ok("checklists added (+7)", a.cl === before.cl + 7);
      // KB goes through its own review step
      ok("KB review dialog opens", /articles found: 24 new/.test(d.body.textContent));
      btn(Array.from(d.querySelectorAll(".modal-foot button")).map(b => b.textContent.trim()).find(t => /^Import/.test(t)), d.querySelector(".modal")).click(); await wait(250);
      ok("KB articles added (+24)", store.get("kb").length === before.kb + 24);
      await closeModals();

      // idempotent
      S.library.addStarter(); await wait(100);
      ok("second import: nothing new for flows", /13 already the same/.test(d.querySelector(".modal").textContent) || /0 new/.test(d.querySelector(".modal").textContent));
      btn("Import", d.querySelector(".modal")).click(); await wait(250);
      ok("no duplicates after a second import", S.flows.list().length === a.flows && S.scripts.list().length === a.scripts && store.get("snippets").length === a.sn && store.get("checklists").length === a.cl);
      await closeModals();

      // content quality
      const kb = store.get("kb");
      ok("KB keeps questions to ask + notes", kb.find(x => x.id === "KB-123").questions.length >= 4 && /incident/.test(kb.find(x => x.id === "KB-123").notes));
      const pf = S.flows.list().find(f => f.title === "Cannot print");
      ok("chained flow resolved by id", pf.nodes.some(n => n.goto === "pk-fl-3") && S.flows.list().find(f => f.id === "pk-fl-3").title === "No internet or network problems");
      const issues = S.library.scan().filter(i => /pk-|Cannot print|Outlook problems|Teams problems|Slow computer/.test(i.text) && i.level === "bad");
      ok("health check finds no broken answers or missing KIs in the pack", issues.length === 0);
      const allIssues = S.library.scan().map(i => i.text).join("\n");
      ok("no pack flow flagged for unreachable steps/no KI links", !/Outlook problems.*(nobody can reach|lead nowhere)|Cannot sign in.*(nobody can reach|lead nowhere)/.test(allIssues));

      // end to end in a ticket
      w.location.hash = "#ticket"; S.ticket.render(); await wait(100);
      const iss = d.getElementById("tk-issue"); input(iss, "user cannot print to the printer"); await wait(100);
      ok("flow suggested from the issue", /Cannot print/.test(d.querySelector("#tk-flow .fl-suggest").textContent));
      d.querySelector("#tk-flow .fl-suggest .btn").click(); await wait(80);
      const ans = i => { d.querySelectorAll("#tk-flow .fl-answer")[i].click(); return wait(60); };
      await ans(0); await ans(0); await ans(0);                       // One printer -> others can print: Yes -> shows Offline: Yes
      ok("reaches the offline-printer result", /offline/i.test(d.querySelector("#tk-flow .fl-question").textContent));
      const row = Array.from(d.querySelectorAll("#tk-flow .fl-ki")).find(r => /KB-113/.test(r.textContent));
      ok("suggests KB-113 (new KI)", !!row);
      Array.from(row.querySelectorAll("button")).find(b => b.textContent === "Apply").click(); await wait(120);
      ok("KB-113 applied with its steps", S.ticket.current().kis.some(k => k.id === "KB-113"));
      // scripts linked to the KI show in the article
      w.location.hash = "#kb"; await wait(100); S.kb.openArticle("KB-113"); await wait(80);
      ok("KI shows its linked scripts", /Scripts for this article/.test(d.getElementById("kb-detail").textContent));
      // variable prompt on a pack script
      w.location.hash = "#scripts"; await wait(100);
      const mp = S.scripts.list().find(s => s.title === "Map Network Drive"); let copied = null; S.app.copy = t => { copied = t; };
      const p = S.scripts.copy(mp); await wait(100);
      ok("variable dialog asks for 3 values", d.querySelectorAll('.modal input[id^="sc-var-"]').length === 3);
      d.getElementById("sc-var-0").value = "Z"; d.getElementById("sc-var-1").value = "fileserver"; d.getElementById("sc-var-2").value = "Finance";
      btn("Continue").click(); await p; await wait(60);
      ok("script filled in -> " + (copied || "").split("\n")[0], /net use Z: \\\\fileserver\\Finance \/persistent:yes/.test(copied));
      ok("library home counts grew", (w.location.hash = "#library", S.library.render(), d.querySelectorAll("#lib-body .lib-card strong")[0].textContent === String(before.kb + 24)));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")); console.log("errors:", errs); process.exit(1); }
  }, 1500);
});
