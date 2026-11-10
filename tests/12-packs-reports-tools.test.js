const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const click = (txt, root) => { const b = Array.from((root || d).querySelectorAll("button")).find(x => x.textContent.trim() === txt); if (!b) throw new Error("no button " + txt); b.click(); };
  setTimeout(async () => {
    try {
      /*DISMISS*/ await new Promise(r => setTimeout(r, 700)); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await new Promise(r => setTimeout(r, 80));
      const S = w.SDT, store = S.storage;
      ok("all modules loaded", ["secrets","checklists","insights","sharepack","tools","flows","scripts"].every(k => S[k]));
      ok("backup.latest exists", typeof S.backup.latest === "function");

      // 1. secret gate in script editor
      w.location.hash = "#scripts"; await wait(100); S.scripts.render();
      const before = S.scripts.list().length;
      S.scripts.openEditor(null); await wait(60);
      d.getElementById("sc-title").value = "Leaky"; d.getElementById("sc-cat").value = "Test";
      d.getElementById("sc-codebox").value = "net use Z: \\\\srv\\share /user:bob password=Sup3rS3cret99";
      d.querySelector(".modal-foot .btn").click(); await wait(80);
      ok("secret warning shown", /may contain a secret/i.test(d.body.textContent));
      d.getElementById("modal-cancel") ? d.getElementById("modal-cancel").click() : null; await wait(60);
      ok("nothing saved while warning pending", S.scripts.list().length === before);
      // close editor, clean save -> exactly one
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
      Array.from(d.querySelectorAll("button")).filter(b => /discard|leave|yes/i.test(b.textContent) && b.closest(".modal")).forEach(b => b.click()); await wait(60);
      S.scripts.openEditor(null); await wait(60);
      d.getElementById("sc-title").value = "Clean"; d.getElementById("sc-cat").value = "Test"; d.getElementById("sc-codebox").value = "echo hello";
      d.querySelector(".modal-foot .btn").click(); await wait(150);
      ok("clean save adds exactly one", S.scripts.list().length === before + 1);

      // 2-3. caller memory + local time
      store.set("tickets", [{ id: "T1", createdAt: new Date().toISOString(), userId: "jdoe", userName: "John Doe", hostname: "PC-01", shortDescription: "VPN down", kis: [], outcome: "Escalated", snapshot: { kis: [], custom: [] } }]);
      w.location.hash = "#ticket"; await wait(100);
      const uid = d.getElementById("tk-userid"); uid.value = "jdoe"; uid.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(80);
      ok("caller suggestion shown", !d.getElementById("tk-caller").hidden && /John Doe/.test(d.getElementById("tk-caller").textContent));
      click("Fill in", d.getElementById("tk-caller")); await wait(80);
      ok("name + host filled", S.ticket.current().userName === "John Doe" && S.ticket.current().host === "PC-01");
      const tz = d.getElementById("tk-tz"); tz.value = "PHT"; tz.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(50);
      ok("local time (abbrev) -> " + d.getElementById("tk-localtime").textContent, /^Their time now: /.test(d.getElementById("tk-localtime").textContent));
      tz.value = "Asia/Manila"; tz.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(50);
      ok("local time (IANA)", /^Their time now: /.test(d.getElementById("tk-localtime").textContent));
      tz.value = "XYZ"; tz.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(50);
      ok("unknown zone -> blank", d.getElementById("tk-localtime").textContent === "");

      // 4. log script in ticket
      w.location.hash = "#scripts"; await wait(80); S.scripts.render();
      const nBefore = S.ticket.current().custom.length;
      d.getElementById("sc-expand").click(); await wait(30); const logBtn = Array.from(d.querySelectorAll(".sc-tools button")).find(b => b.textContent === "Log in ticket"); logBtn.click(); await wait(60);
      ok("script logged as done step", S.ticket.current().custom.length === nBefore + 1 && S.ticket.current().custom.slice(-1)[0].done === true);
      ok("logged step in work notes", /Ran (script|command|registry|Checked)|Checked registry|Ran command|Ran script/.test(d.getElementById("tk-live-notes").textContent));

      // 5. checklist pick
      w.location.hash = "#ticket"; await wait(80);
      const c0 = S.ticket.current().custom.length;
      d.getElementById("tk-add-checklist").click(); await wait(60);
      ok("checklist picker open", !!d.querySelector(".modal .fl-ki"));
      d.querySelector(".modal .fl-ki .btn").click(); await wait(80);
      ok("checklist items added as steps", S.ticket.current().custom.length > c0 + 3);

      // 6. flow -> save ticket -> record has flow
      const iss = d.getElementById("tk-issue"); iss.value = "Unable to access VPN"; iss.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(80);
      d.querySelector("#tk-flow .fl-suggest .btn").click(); await wait(60);
      const ans = i => { d.querySelectorAll("#tk-flow .fl-answer")[i].click(); return wait(60); };
      await ans(1); await ans(0); await ans(2); await ans(1);
      ok("reached dead-end result", /No clear match/.test(d.querySelector("#tk-flow .fl-question").textContent));
      S.ticket.current().outcome = "Escalated"; S.ticket.persist();
      S.ticket.current().shortDesc = "VPN timeout"; S.ticket.current().shortEdited = true;
      ok("ticket saved", S.ticket.save() === true);
      const rec = store.get("tickets", [])[0];
      ok("record has flow summary", rec.flow && rec.flow.noKi === true && /No clear match/.test(rec.flow.resultText));

      // 7. reports panels
      w.location.hash = "#reports"; await wait(120);
      const rtxt = d.getElementById("rp-body").textContent;
      ok("Knowledge gaps panel", /Knowledge gaps/.test(rtxt) && /Question flow results with no KI/.test(rtxt));
      ok("Flows in use panel", /Question flows in use/.test(rtxt) && /Unable to access VPN/.test(rtxt));

      // 8. flow stats on the flows page
      w.location.hash = "#flows"; await wait(100);
      ok("flow card shows usage", /Used 1x/.test(d.getElementById("fl-list").textContent));

      // 9. create KI from ticket (history)
      w.location.hash = "#history"; await wait(120);
      d.querySelector("#hist-list .result-main").click(); await wait(60);
      click("Create KI from this ticket"); await wait(100);
      const kt = d.querySelector(".modal input[type=text]");
      ok("KB editor opened with draft title", !!d.querySelector(".modal") && Array.from(d.querySelectorAll(".modal input")).some(i => i.value === "VPN timeout"));
      ok("draft steps prefilled", Array.from(d.querySelectorAll(".modal textarea")).some(t => /Ran script|Ran command|Checked registry/.test(t.value) || t.value.length > 0));
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
      Array.from(d.querySelectorAll(".modal button")).filter(b => /discard|leave|yes/i.test(b.textContent)).forEach(b => b.click()); await wait(60);

      // 10. KB shows flows that lead here
      w.location.hash = "#kb"; await wait(100);
      S.kb.openArticle("KB-001"); await wait(80);
      ok("KB article lists flows that lead here", /Question flows that lead here/.test(d.getElementById("kb-detail").textContent));

      // 11. share pack + backup check
      let dl = null; S.app.download = (n, t) => { dl = t; };
      w.location.hash = "#settings"; await wait(100);
      d.getElementById("sp-export").click(); await wait(80);
      click("Export", d.querySelector(".modal")); await wait(120);
      const pack = dl && JSON.parse(dl);
      ok("share pack exported", pack && pack.kind === "pack" && pack.parts.flows && pack.parts.scripts && pack.parts.checklists);
      const fl = JSON.parse(JSON.stringify(S.flows.list()[0]));
      ok("classify same", S.sharepack.classify("flows", [fl]).same === 1);
      fl.nodes[0].text = "Changed question"; ok("classify changed", S.sharepack.classify("flows", [fl]).change.length === 1);
      fl.title = "Brand new flow"; fl.id = "zzz"; ok("classify new", S.sharepack.classify("flows", [fl]).add.length === 1);
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40);
      S.sharepack.verify(JSON.stringify(store.exportAll()), "test.json"); await wait(80);
      ok("backup check says good", /looks good|can be read/i.test(d.querySelector(".modal").textContent));
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40);
      S.sharepack.verify("not json", "bad.json"); await wait(80);
      ok("backup check flags bad file", /problem/i.test(d.querySelector(".modal").textContent));
      Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40);

      // 12. tools + checklists pages + shortcuts
      w.location.hash = "#tools"; await wait(100);
      ok("tools page has 4 tools", d.getElementById("tl-body").children.length === 4);
      ok("subnet works", JSON.stringify(S.tools.subnet("192.168.1.10/24")).indexOf("192.168.1.0") > -1);
      w.location.hash = "#checklists"; await wait(100);
      ok("checklists page lists starters", d.querySelectorAll("#cl-list .sc-item").length >= 3);
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "?", bubbles: true })); await wait(60);
      ok("? opens shortcut sheet", !!d.querySelector(".tl-shortcuts"));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e.message, (e.stack || "").split("\n")[1]); console.log("errors:", errs); process.exit(1); }
  }, 1500);
});
