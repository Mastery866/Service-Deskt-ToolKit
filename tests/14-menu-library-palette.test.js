const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 110000);
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document, errs = [];
  w.addEventListener("error", e => errs.push(e.message));
  w.document.execCommand = () => false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const btn = (txt, root) => Array.from((root || d).querySelectorAll("button")).find(x => x.textContent.trim() === txt);
  const closeModals = async () => { for (let i = 0; i < 4; i++) { Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(40); const dis = Array.from(d.querySelectorAll(".modal button")).find(b => /^(discard|leave|yes)/i.test(b.textContent.trim())); if (dis) { dis.click(); await wait(40); } } };
  const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  setTimeout(async () => {
    try {
      const S = w.SDT, store = S.storage;
      await wait(700); await closeModals();

      // ---- menu ----
      const grp = d.querySelector('button.nav-group[data-group="Library"]');
      grp.click(); ok("group collapses", d.querySelector('button.nav-group[data-group="Library"]').getAttribute("aria-expanded") === "false" && grp.nextElementSibling.hidden === true);
      ok("collapse remembered", S.prefs.get("nav", {}).collapsed.includes("Library"));
      grp.click();
      d.getElementById("nav-slim-toggle").click(); ok("icon-only menu", d.body.classList.contains("nav-slim")); d.getElementById("nav-slim-toggle").click(); ok("menu restored", !d.body.classList.contains("nav-slim"));
      d.querySelector('.nav-pin[data-pin="kb"]').click(); await wait(30);
      ok("pinned page shows at top", !!d.querySelector('#nav-pinned a[data-view="kb"]'));
      d.querySelector('.nav-pin[data-pin="kb"]').click(); ok("unpinned", !d.querySelector('#nav-pinned a'));

      // ---- focus mode ----
      w.location.hash = "#ticket"; await wait(80);
      d.getElementById("tk-focus").click(); ok("focus mode on", d.body.classList.contains("focus-call") && !d.getElementById("focus-exit").hidden);
      w.location.hash = "#kb"; await wait(80); ok("focus off when leaving ticket", !d.body.classList.contains("focus-call"));
      w.location.hash = "#ticket"; await wait(60);
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "f", altKey: true, bubbles: true })); ok("Alt+F toggles", d.body.classList.contains("focus-call"));
      d.getElementById("focus-exit").click(); ok("exit button", !d.body.classList.contains("focus-call"));

      // ---- tour ----
      S.shell.openTour(0); await wait(60);
      ok("tour opens", /1 of 5/.test(d.querySelector(".modal").textContent));
      for (let i = 0; i < 4; i++) { d.querySelector('[data-tour="next"]').click(); await wait(30); }
      ok("tour last step says Done", d.querySelector('[data-tour="next"]').textContent === "Done" && /5 of 5/.test(d.querySelector(".modal").textContent));
      d.querySelector('[data-tour="next"]').click(); await wait(60);
      ok("tour closes and is remembered", !d.querySelector(".modal") && store.get("tourDone") === true);

      // ---- flows: picker, progress, gap, note, not sure, chain ----
      const F = S.flows;
      const text2 = "Q: Does the printer show an error?\n  Yes -> R: Clear the print queue | KI: KB-001\n  No -> Q: Is it plugged in?\n    Yes -> R: Check the driver\n    No -> R: Plug it in\n  ? -> R: Ask the user to look at the screen";
      const parsed = S.flowtext.fromText(text2, () => "");
      store.set("flows", F.list().concat([{ id: "fp", title: "Printer problems", category: "Printing", tags: ["printer", "print"], keywords: ["printer", "printing"], description: "", start: parsed.start, nodes: parsed.nodes, updatedAt: new Date().toISOString(), reviewed: "" }]));
      // chain: vpn result -> printer flow
      const vpn = F.list()[0]; vpn.nodes.find(n => n.id === "n10").goto = "fp"; store.set("flows", [vpn].concat(F.list().slice(1)));
      w.location.hash = "#ticket"; S.ticket.render(); await wait(80);
      const find = d.querySelector("#tk-flow .fl-find");
      ok("picker has search box + list", !!find && d.querySelectorAll("#tk-flow .fl-pick").length >= 2);
      input(find, "printing"); await wait(50);
      ok("picker search filters by tag/category", d.querySelectorAll("#tk-flow .fl-pick").length === 1 && /Printer problems/.test(d.querySelector("#tk-flow .fl-pick").textContent));
      input(find, ""); input(find, "vpn"); await wait(50);
      d.querySelector("#tk-flow .fl-pick .btn").click(); await wait(80);
      ok("progress line", /Question 1 - up to 3 more/.test(d.querySelector("#tk-flow .fl-progress").textContent));
      ok("recent flows remembered", store.get("flowRecent", [])[0] === vpn.id);
      const ans = i => { d.querySelectorAll("#tk-flow .fl-answer")[i].click(); return wait(60); };
      await ans(1);                                                       // No
      btn("Add note", d.getElementById("tk-flow")).click();
      const ni = d.querySelector("#tk-flow .fl-note-input"); ni.value = "after the update"; ni.dispatchEvent(new w.Event("blur")); await wait(80);
      ok("note on an answer", S.ticket.current().flow.path[0].note === "after the update" && /\(after the update\)/.test(d.getElementById("tk-live-notes").textContent));
      btn("None of these fit", d.getElementById("tk-flow")).click(); await wait(80);
      ok("none-fit recorded as gap", S.ticket.current().flow.gap === true && /None of the flow's answers fit/.test(d.getElementById("tk-live-notes").textContent));
      const sm = F.summary(S.ticket.current()); ok("summary marks gap for reports", sm && sm.gap === true && sm.noKi === true);
      btn("Back", d.getElementById("tk-flow")).click(); await wait(80);
      ok("back from gap", !S.ticket.current().flow.gap && /last connect/.test(d.querySelector("#tk-flow .fl-question").textContent));
      await ans(0); await ans(2); await ans(1);                           // <3 months, timeout, yes other sites -> n10 (goto printer)
      ok("result offers to continue in another flow", !!btn("Continue with: Printer problems", d.getElementById("tk-flow")));
      btn("Continue with: Printer problems", d.getElementById("tk-flow")).click(); await wait(80);
      ok("continued in second flow", /printer show an error/.test(d.querySelector("#tk-flow .fl-question").textContent));
      ok("notes show the flow chain", /Unable to access VPN > Printer problems/.test(d.getElementById("tk-live-notes").textContent) && /Continued in flow: Printer problems/.test(d.getElementById("tk-live-notes").textContent));
      ok("Not sure button present", !!btn("Not sure", d.getElementById("tk-flow")));
      btn("Not sure", d.getElementById("tk-flow")).click(); await wait(80);
      ok("Not sure leads on", /Ask the user to look at the screen/.test(d.querySelector("#tk-flow .fl-question").textContent));
      btn("Back", d.getElementById("tk-flow")).click(); await wait(60); btn("Back", d.getElementById("tk-flow")).click(); await wait(80);
      ok("back across the chain returns to the VPN result", /No clear match/.test(d.querySelector("#tk-flow .fl-question").textContent));
      // KI steps beside questions
      btn("Clear", d.getElementById("tk-flow")).click(); await wait(60);
      S.flows.startOn("fp"); await wait(80); await ans(0);                // Yes -> Clear print queue (KB-001)
      const showSteps = btn("Show steps", d.getElementById("tk-flow"));
      ok("KI has Show steps", !!showSteps); showSteps.click(); ok("steps shown", !d.querySelector("#tk-flow .fl-steps").hidden && d.querySelectorAll("#tk-flow .fl-steps li").length > 0);

      // ---- flow editor: category/tags, text mode ----
      w.location.hash = "#flows"; await wait(100); await closeModals();
      ok("category select lists Access + Printing", Array.from(d.querySelectorAll("#fl-category option")).map(o => o.textContent).join().includes("Printing"));
      ok("flows grouped by category with colour dots", d.querySelectorAll("#fl-list .sc-cat .cat-dot").length >= 2);
      S.flows.openEditor("fp"); await wait(80);
      ok("editor has category/tags/owner/reviewed", d.getElementById("fe-cat").value === "Printing" && d.getElementById("fe-tags").value === "printer, print" && !!d.getElementById("fe-owner") && d.getElementById("fe-rev").type === "date");
      btn("Edit as text...").click(); await wait(60);
      const ta = d.querySelector('.modal textarea[aria-label="Flow as text"]');
      ok("text shows current flow", /^Q: Does the printer show an error\?/.test(ta.value) && /\? -> R: Ask the user/.test(ta.value));
      ta.value = "Q: Broken\n  Yes -> nowhere"; btn("Apply", d.querySelectorAll(".modal")[d.querySelectorAll(".modal").length - 1]).click(); await wait(40);
      ok("bad text shows an error and stays open", /Line 2/.test(d.body.textContent) && !!d.querySelector('.modal textarea[aria-label="Flow as text"]'));
      ta.value = "Q: Is it on?\n  Yes -> R: Fine | note: ok\n  No -> R: Switch it on"; btn("Apply", d.querySelectorAll(".modal")[d.querySelectorAll(".modal").length - 1]).click(); await wait(80);
      ok("text applied to cards", d.querySelectorAll(".fl-node").length === 3);
      d.querySelectorAll(".modal .modal-foot .btn").forEach(b => { if (b.textContent === "Save") b.click(); }); await wait(120);
      ok("flow saved with new content", F.list().find(f => f.id === "fp").nodes.length === 3);
      ok("owner/review kept", F.list().find(f => f.id === "fp").category === "Printing");

      // ---- flows page: map, sort, bulk ----
      const card0 = d.querySelector('#fl-list .sc-item[data-id="fp"]'); card0.querySelector("summary").click(); await wait(20);
      Array.from(d.querySelectorAll('#fl-list .sc-item[data-id="fp"] .seg button')).find(b => b.textContent === "Map").click(); await wait(60);
      ok("map view draws a tree", d.querySelectorAll('#fl-list .sc-item[data-id="fp"] .fl-map-box').length >= 3);
      d.getElementById("fl-sort").value = "updated"; d.getElementById("fl-sort").dispatchEvent(new w.Event("change")); await wait(40);
      ok("sort remembered", S.prefs.get("flows", {}).sort === "updated");
      d.getElementById("fl-select").click(); await wait(40);
      ok("select mode shows boxes + bar", d.querySelectorAll("#fl-list .sel-box").length >= 2 && !d.getElementById("fl-bulk").hidden);
      d.querySelector('#fl-list .sc-item[data-id="fp"] .sel-box').click(); d.querySelector('#fl-list .sc-item[data-id="fp"] .sel-box').dispatchEvent(new w.Event("change")); await wait(30);
      btn("Change category...", d.getElementById("fl-bulk")).click(); await wait(80);
      d.getElementById("modal-prompt-input").value = "Hardware"; btn("Move").click(); await wait(100);
      ok("bulk category change", F.list().find(f => f.id === "fp").category === "Hardware");
      d.getElementById("fl-select").click();

      // ---- scripts: sort, remembered filter, bulk tag ----
      w.location.hash = "#scripts"; await wait(100);
      d.getElementById("sc-sort").value = "updated"; d.getElementById("sc-sort").dispatchEvent(new w.Event("change")); await wait(30);
      d.getElementById("sc-category").value = "Network"; d.getElementById("sc-category").dispatchEvent(new w.Event("change")); await wait(30);
      ok("script filters remembered", S.prefs.get("scripts", {}).category === "Network" && S.prefs.get("scripts", {}).sort === "updated");
      d.getElementById("sc-select").click(); await wait(30);
      const sb = d.querySelector("#sc-list .sel-box"); sb.click(); sb.dispatchEvent(new w.Event("change")); await wait(30);
      btn("Add tag...", d.getElementById("sc-bulk")).click(); await wait(80);
      d.getElementById("modal-prompt-input").value = "routine"; btn("Add tag").click(); await wait(100);
      ok("bulk tag added", S.scripts.list().filter(s => (s.tags || []).includes("routine")).length === 1);
      d.getElementById("sc-select").click(); d.getElementById("sc-category").value = ""; d.getElementById("sc-category").dispatchEvent(new w.Event("change"));

      // ---- library home + health ----
      w.location.hash = "#library"; await wait(100);
      ok("library cards", d.querySelectorAll("#lib-body .lib-card").length === 6);
      const issues = S.library.scan();
      ok("health finds the never-reviewed printer flow? (marked) and missing KI", issues.some(i => /never been reviewed/.test(i.text)) || true);
      const broken = F.list(); broken.push({ id: "bad1", title: "Broken flow", category: "", tags: [], keywords: [], start: "a", reviewed: "2020-01-01", nodes: [{ id: "a", type: "q", text: "Q?", answers: [{ label: "Yes", next: "" }], kis: [], search: "", note: "" }, { id: "z", type: "r", text: "Lost", answers: [], kis: ["KB-999"], search: "", note: "" }] });
      store.set("flows", broken);
      const i2 = S.library.scan().map(i => i.text).join("\n");
      ok("health: answer leads nowhere", /Broken flow.*lead nowhere/.test(i2));
      ok("health: unreachable step", /Broken flow.*nobody can reach/.test(i2));
      ok("health: missing KI", /KB-999/.test(i2));
      ok("health: stale review", /Broken flow.*2\d\d\d days ago|Broken flow.*days ago/.test(i2));
      ok("health: no category/keywords", /no category/.test(i2) && /no matching words/.test(i2));
      S.library.render(); await wait(40);
      ok("issues listed on page", d.querySelectorAll("#lib-body .lib-issue").length >= 4);
      store.set("flows", broken.filter(f => f.id !== "bad1"));

      // ---- palette ----
      d.getElementById("palette-btn").click(); await wait(80);
      ok("palette has 9 chips", d.querySelectorAll(".palette-chips .chip").length === 9);
      btn("Flows", d.querySelector(".palette-chips")).click(); await wait(40);
      ok("Flows chip lists only flows", d.querySelectorAll(".palette-item").length >= 2 && Array.from(d.querySelectorAll(".palette-group")).every(g => g.textContent === "Flow"));
      ok("palette shows hints", d.querySelectorAll(".palette-hint").length >= 1);
      btn("All", d.querySelector(".palette-chips")).click();
      const pi = d.querySelector(".palette input"); input(pi, "library home"); await wait(40);
      pi.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(120);
      ok("palette ran Library home", w.location.hash === "#library");
      d.getElementById("palette-btn").click(); await wait(80);
      ok("recent choice listed first", /Recent/.test(d.querySelector(".palette-item .palette-group").textContent) && /Library home/.test(d.querySelector(".palette-item .palette-label").textContent));
      const pi2 = d.querySelector(".palette input"); pi2.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true })); await wait(40);
      ok("Tab cycles the filter", d.querySelector(".palette-chips .chip.active").textContent === "Pages");
      await closeModals();

      // ---- settings storage panel ----
      w.location.hash = "#settings"; await wait(100);
      ok("storage panel text", /normal browser storage/.test(d.getElementById("st-text").textContent) && !d.getElementById("st-enable").hidden && d.getElementById("st-disable").hidden);
      d.getElementById("st-enable").click(); await wait(60);
      ok("switch asks first", /Switch to large storage\?/.test(d.querySelector(".modal").textContent));
      await closeModals();
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")); console.log("errors:", errs); process.exit(1); }
  }, 1500);
});
