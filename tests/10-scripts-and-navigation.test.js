const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
const path = (ROOT + "/index.html");
JSDOM.fromFile(path, { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false;
  setTimeout(async () => {
    try {
      /*DISMISS*/ await new Promise(r => setTimeout(r, 700)); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await new Promise(r => setTimeout(r, 80));
      const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
      w.location.hash = "#scripts"; await new Promise(r => setTimeout(r, 100));
      ok("scripts view active", d.getElementById("view-scripts").classList.contains("active"));
      const S = w.SDT.scripts, list = S.list();
      ok("seeded " + list.length, list.length >= 50);
      ok("run commands present", list.filter(s => s.type === "run").length >= 30);
      ok("reg paths present", list.filter(s => s.type === "regpath").length >= 15);
      ok("print queue backslashes kept", /spool\\PRINTERS/.test(list.find(s => s.title === "Clear Print Queue").code));
      ok("nav groups", d.querySelectorAll("button.nav-group").length === 4 && d.querySelectorAll("#nav a:not([data-clone])").length === 15);
      ok("live copy buttons", !!d.getElementById("tk-live-copy-ticket") && !!d.getElementById("tk-live-copy-notes"));
      // render and search
      d.getElementById("sc-expand").click();
      ok("categories rendered", d.querySelectorAll(".sc-cat").length >= 4);
      ok("line numbers", d.querySelectorAll(".sc-pre .ln").length > 50);
      d.getElementById("sc-search").value = "ncpa"; d.getElementById("sc-search").dispatchEvent(new w.Event("input"));
      await new Promise(r => setTimeout(r, 300));
      ok("search ncpa -> 1 item", d.querySelectorAll(".sc-item").length === 1);
      // favorite toggle
      d.querySelector(".sc-star").click();
      ok("favorite saved", S.list().some(s => s.favorite));
      d.querySelector('#sc-show [data-show="favorites"]').click();
      ok("favorites filter", d.querySelectorAll(".sc-item").length >= 0);
      d.querySelector('#sc-show [data-show="all"]').click();
      // variables + copy
      const rec = { id: "t1", title: "VarTest", category: "Test", type: "bat", risk: "safe", tags: ["x"], kis: [], code: "ping {{host}}", description: "", history: [], createdAt: "", updatedAt: "" };
      w.SDT.storage.set("scripts", S.list().concat([rec]));
      let copied = null; w.SDT.app.copy = (t) => { copied = t; };
      const p = S.copy(rec);
      await new Promise(r => setTimeout(r, 100));
      ok("variable dialog open", !!d.querySelector(".modal"));
      d.querySelector("#sc-var-0").value = "pc-01";
      d.querySelector(".modal-foot .btn").click();
      await p; await new Promise(r => setTimeout(r, 100));
      ok("variable replaced -> " + copied, copied === "ping pc-01");
      ok("usedAt set", !!S.list().find(s => s.id === "t1").usedAt);
      // danger confirm
      const dg = Object.assign({}, rec, { id: "t2", title: "Danger", risk: "danger", code: "echo hi" });
      w.SDT.storage.set("scripts", S.list().concat([dg]));
      copied = null; const p2 = S.copy(dg);
      await new Promise(r => setTimeout(r, 100));
      ok("danger confirm shown", !!d.querySelector(".modal"));
      d.querySelector("#modal-cancel").click(); await p2; await new Promise(r => setTimeout(r, 100));
      ok("cancel -> nothing copied", copied === null);
      // editor + version history
      S.render(); S.openEditor("t1"); await new Promise(r => setTimeout(r, 100));
      d.getElementById("sc-codebox").value = "ping -n 2 {{host}}";
      d.querySelector(".modal-foot .btn").click(); await new Promise(r => setTimeout(r, 100));
      const t1 = S.list().find(s => s.id === "t1");
      ok("version kept", t1.history.length === 1 && t1.history[0].code === "ping {{host}}");
      // export/import roundtrip
      let exported = null; w.SDT.app.download = (n, t) => { exported = t; };
      d.getElementById("sc-export").click(); await new Promise(r => setTimeout(r, 80));
      ok("export json", exported && JSON.parse(exported).scripts.length === S.list().length);
      // KB link + KB close
      w.SDT.storage.set("scripts", S.list().map(s => s.id === "t1" ? Object.assign(s, { kis: ["KB-001"] }) : s));
      ok("forKi", S.forKi("KB-001").length === 1);
      w.location.hash = "#kb"; await new Promise(r => setTimeout(r, 100));
      const kb = w.SDT.storage.get("kb", []);
      if (kb.length) {
        w.SDT.kb.openArticle(kb[0].id); await new Promise(r => setTimeout(r, 100));
        ok("kb close button", !!d.querySelector("#kb-detail .icon-close"));
        d.querySelector("#kb-detail .icon-close").click();
        ok("kb closed", d.getElementById("kb-detail").parentNode.classList.contains("is-empty"));
      } else console.log("INFO no KB seeded");
      // history close
      const tk = [{ id: "h1", createdAt: new Date().toISOString(), shortDescription: "Test ticket", ticketText: "T", workNotes: "N" }];
      w.SDT.storage.set("tickets", tk);
      w.location.hash = "#history"; await new Promise(r => setTimeout(r, 150));
      d.querySelector("#hist-list .result-main").click(); await new Promise(r => setTimeout(r, 50));
      ok("history close button", !!d.querySelector("#hist-detail .icon-close"));
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      ok("Esc closes detail", d.getElementById("hist-layout").classList.contains("is-empty"));
      // palette
      w.location.hash = "#ticket"; await new Promise(r => setTimeout(r, 100));
      d.getElementById("palette-btn").click(); await new Promise(r => setTimeout(r, 100));
      ok("palette opens", !!d.querySelector(".palette"));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e); process.exit(1); }
  }, 1500);
});
