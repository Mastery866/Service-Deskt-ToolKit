const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  setTimeout(async () => {
    try {
      /*DISMISS*/ await new Promise(r => setTimeout(r, 700)); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await new Promise(r => setTimeout(r, 80));
      const F = w.SDT.flows;
      ok("starter flow seeded", F.list().length === 1 && F.list()[0].nodes.length === 10);
      // ticket page: type the issue
      w.location.hash = "#ticket"; await wait(100);
      const issue = d.getElementById("tk-issue"); issue.value = "Unable to access VPN"; issue.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(150);
      ok("flow suggested from issue", /Suggested flow/.test(d.getElementById("tk-flow").textContent));
      d.querySelector("#tk-flow .fl-suggest .btn").click(); await wait(80);
      ok("first question shown", /first time/.test(d.querySelector("#tk-flow .fl-question").textContent));
      ok("2 answers", d.querySelectorAll("#tk-flow .fl-answer").length === 2);
      d.querySelectorAll("#tk-flow .fl-answer")[1].click(); await wait(80);   // No
      ok("second question", /last connect/.test(d.querySelector("#tk-flow .fl-question").textContent));
      // keyboard shortcut 2 -> More than 3 months
      d.querySelector("#tk-flow").dispatchEvent(new w.KeyboardEvent("keydown", { key: "2", bubbles: true })); await wait(80);
      ok("result reached", /certificate has probably expired/.test(d.querySelector("#tk-flow .fl-question").textContent));
      ok("trail has 2 answers", d.querySelectorAll("#tk-flow .fl-trail li").length === 2);
      const notes = d.getElementById("tk-live-notes").textContent;
      ok("notes include Q&A", /Questions asked to the user \(Unable to access VPN\)/.test(notes) && /first time[^\n]*No/.test(notes) && /Likely cause: The VPN certificate/.test(notes));
      // Back then change answer
      Array.from(d.querySelectorAll("#tk-flow .fl-current button")).find(b => b.textContent === "Back").click(); await wait(80);
      ok("back works", /last connect/.test(d.querySelector("#tk-flow .fl-question").textContent));
      d.querySelectorAll("#tk-flow .fl-answer")[0].click(); await wait(80);    // < 3 months
      d.querySelectorAll("#tk-flow .fl-answer")[0].click(); await wait(80);    // login error -> n6 with KB-001, KB-002
      const kiRows = d.querySelectorAll("#tk-flow .fl-ki");
      ok("KI suggestions on result (" + kiRows.length + ")", kiRows.length >= 1);
      if (kiRows.length) {
        Array.from(kiRows[0].querySelectorAll("button")).find(b => b.textContent === "Apply").click(); await wait(100);
        ok("KI applied to ticket", w.SDT.ticket.current().kis.length === 1);
        ok("button now Applied", Array.from(d.querySelectorAll("#tk-flow .fl-ki button")).some(b => b.textContent === "Applied"));
      }
      // uncheck include
      const cb = d.querySelector("#tk-flow .fl-run input[type=checkbox], #tk-flow input[type=checkbox]");
      cb.checked = false; cb.dispatchEvent(new w.Event("change", { bubbles: true })); await wait(80);
      ok("notes exclude Q&A when unchecked", !/Questions asked/.test(d.getElementById("tk-live-notes").textContent));
      // clear
      Array.from(d.querySelectorAll("#tk-flow .fl-bar button")).find(b => b.textContent === "Clear").click(); await wait(80);
      ok("clear flow", !w.SDT.ticket.current().flow);
      // page
      w.location.hash = "#flows"; await wait(100);
      ok("flows page active", d.getElementById("view-flows").classList.contains("active"));
      d.querySelector("#fl-list .sc-item summary").click(); await wait(40); ok("flow card + outline", d.querySelectorAll("#fl-list .sc-item").length === 1 && /\[Yes\]/.test(d.querySelector(".fl-outline").textContent));
      // editor: new flow with validation
      d.getElementById("fl-new").click(); await wait(100);
      d.querySelector(".modal-foot .btn").click(); await wait(50);
      ok("validation blocks empty flow", !d.querySelector(".modal .form-error").hidden);
      d.getElementById("fe-title").value = "Printer not working";
      d.getElementById("fe-kw").value = "printer, printing";
      const ta = d.querySelector(".fl-node textarea"); ta.value = "Can the user print a test page?"; ta.dispatchEvent(new w.Event("input"));
      const sels = d.querySelectorAll(".fl-ans-row select");
      sels[0].value = "__r"; sels[0].dispatchEvent(new w.Event("change")); await wait(50);
      let sels2 = d.querySelectorAll(".fl-ans-row select");
      sels2[1].value = "__r"; sels2[1].dispatchEvent(new w.Event("change")); await wait(50);
      const nodeTas = Array.from(d.querySelectorAll(".fl-node")).map(n => n.querySelector("textarea"));
      ok("3 nodes after quick-create", nodeTas.length === 3);
      nodeTas[1].value = "Printer works"; nodeTas[1].dispatchEvent(new w.Event("input"));
      nodeTas[2].value = "Printer is offline"; nodeTas[2].dispatchEvent(new w.Event("input"));
      d.querySelector(".modal-foot .btn").click(); await wait(100);
      const flows = F.list();
      ok("flow saved", flows.length === 2 && flows[1].title === "Printer not working" && flows[1].nodes.length === 3);
      ok("match printer", F.match("printer is not printing")[0].title === "Printer not working");
      ok("match vpn", F.match("cannot connect to vpn")[0].title === "Unable to access VPN");
      // try it preview
      d.querySelector("#fl-list .sc-item[open] .btn, #fl-list .sc-item .btn")
      const tryBtn = Array.from(d.querySelectorAll("#fl-list button")).find(b => b.textContent === "Try it");
      tryBtn.click(); await wait(80);
      ok("preview modal runs", !!d.querySelector(".modal .fl-question"));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e); process.exit(1); }
  }, 1500);
});
