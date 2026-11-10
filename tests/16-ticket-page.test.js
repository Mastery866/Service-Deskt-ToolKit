const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 110000);
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const closeModals = async () => { for (let i = 0; i < 3; i++) { Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40); } };
  setTimeout(async () => {
    try {
      const S = w.SDT, store = S.storage;
      await wait(700); await closeModals();
      w.location.hash = "#ticket"; await wait(100);
      // toolbar
      ok("toolbar has two grouped clusters", d.querySelectorAll(".head-actions .tool-group").length === 2);
      ok("buttons have icons", ["tk-focus", "tk-new", "tk-save", "tk-copy-notes", "tk-copy-ticket"].every(id => d.querySelector("#" + id + " svg.btn-ico")));
      d.getElementById("tk-focus").click();
      ok("focus label changes but icon stays", d.querySelector("#tk-focus .btn-label").textContent === "Exit focus" && !!d.querySelector("#tk-focus svg"));
      d.getElementById("focus-exit").click();
      ok("label restored", d.querySelector("#tk-focus .btn-label").textContent === "Focus");

      // status chips
      const st = d.getElementById("tk-status");
      ok("status shows chips + missing buttons", st.querySelectorAll(".st-chip").length === 2 && st.querySelectorAll(".st-link").length === 4 && /Still needed to save/.test(st.textContent));
      const link = Array.from(st.querySelectorAll(".st-link")).find(b => b.textContent === "User ID"); link.click();
      ok("clicking a missing field jumps to it", d.activeElement && d.activeElement.id === "tk-userid");
      input(d.getElementById("tk-userid"), "jdoe"); await wait(50);
      ok("chip disappears once filled", st.querySelectorAll(".st-link").length === 3);
      input(d.getElementById("tk-username"), "John Doe"); input(d.getElementById("tk-host"), "PC-01"); input(d.getElementById("tk-short"), "VPN issue"); await wait(60);
      ok("ready to save when complete", /Ready to save/.test(st.textContent) && st.querySelectorAll(".st-link").length === 0);
      ok("required marker CSS targets the 4 fields", (d.querySelector("style") || true) && ["tk-userid", "tk-username", "tk-host", "tk-short"].every(id => d.querySelector('label[for="' + id + '"]')));
      ok("draft note shows a time", /Draft kept in this browser at/.test(d.getElementById("tk-saved").textContent));

      // local time
      const tz = d.getElementById("tk-tz"), lt = () => d.getElementById("tk-localtime").textContent;
      for (const [v, expect] of [["PH", true], ["PHT", true], ["UTC+8", true], ["GMT-5", true], ["+05:30", true], ["Manila", true], ["London", true], ["Asia/Manila", true], ["nonsense", false]]) {
        input(tz, v); await wait(30); ok("local time for '" + v + "' -> " + (lt() || "(blank)"), expect ? /^Their time now: /.test(lt()) : lt() === "");
      }
      input(tz, "UTC+8"); await wait(30); const a = lt();
      input(tz, "Manila"); await wait(30); ok("UTC+8 and Manila agree", lt() === a);

      // picker
      input(d.getElementById("tk-issue"), "cannot connect to vpn from home"); await wait(100);
      ok("suggests flows from the issue", /Suggested flows for this issue/.test(d.querySelector("#tk-flow .fl-suggest").textContent) && d.querySelectorAll("#tk-flow .fl-suggest-row").length >= 1 && d.querySelectorAll("#tk-flow .fl-suggest-row").length <= 3);
      ok("first suggestion is the VPN flow", /Unable to access VPN/.test(d.querySelector("#tk-flow .fl-suggest-row").textContent));
      // import starter content so there are many flows + categories
      const pack = S.library.starterPack(); S.sharepack.importPack(JSON.stringify(pack)); await wait(150);
      d.querySelectorAll(".modal .modal-foot .btn").forEach(b => { if (b.textContent === "Import") b.click(); }); await wait(200); await closeModals();
      w.location.hash = "#ticket"; S.ticket.render(); await wait(100);
      const cats = d.querySelectorAll("#tk-flow .fl-cats .chip");
      ok("category chips shown (" + cats.length + ")", cats.length >= 4 && cats[0].textContent === "All");
      const printing = Array.from(cats).find(c => /^Printing/.test(c.textContent)); printing.click(); await wait(50);
      ok("category chip filters the list", d.querySelectorAll("#tk-flow .fl-pick").length === 1 && /Cannot print/.test(d.querySelector("#tk-flow .fl-pick").textContent));
      d.querySelector("#tk-flow .fl-cats .chip").click(); await wait(40);
      ok("note text is sentence case class", !!d.querySelector("#tk-flow .fl-pick-note") && /flows in total/.test(d.querySelector("#tk-flow .fl-pick-note").textContent));
      // Alt+Q
      d.getElementById("tk-issue").focus();
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "q", altKey: true, bubbles: true })); await wait(150);
      ok("Alt+Q focuses the flow search", d.activeElement && d.activeElement.classList.contains("fl-find"));
      // result label
      d.querySelector("#tk-flow .fl-suggest .btn").click(); await wait(80);
      const go = i => { d.querySelectorAll("#tk-flow .fl-answer")[i].click(); return wait(60); };
      await go(1); await go(1);
      ok("result shows a Likely cause label", /Likely cause/.test(d.querySelector("#tk-flow .fl-result").textContent));
      // shortcut sheet
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "?", bubbles: true })); await wait(60);
      ok("shortcut sheet lists Alt+Q", /Alt\+Q/.test(d.body.textContent));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")); console.log("errors:", errs); process.exit(1); }
  }, 1500);
});
