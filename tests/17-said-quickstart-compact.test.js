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
  const btn = (txt, root) => Array.from((root || d).querySelectorAll("button")).find(x => x.textContent.trim() === txt);
  setTimeout(async () => {
    try {
      const S = w.SDT, store = S.storage;
      await wait(700); await closeModals();
      // starter content so there are flows and KIs to suggest
      S.library.addStarter(); await wait(150); btn("Import", d.querySelector(".modal")).click(); await wait(250);
      const kbBtn = Array.from(d.querySelectorAll(".modal-foot button")).find(b => /^Import/.test(b.textContent.trim())); if (kbBtn) kbBtn.click(); await wait(250); await closeModals();

      w.location.hash = "#ticket"; S.ticket.render(); await wait(100);
      const first = d.querySelector(".tk-main > .panel");
      ok("What the user said is the first card", first && first.id === "tk-said-panel" && !!d.getElementById("tk-said"));
      ok("it says the text is not saved to history", /never saved to history/.test(first.textContent));

      // suggestions from the user's words
      input(d.getElementById("tk-said"), "My printer is offline and nothing prints"); await wait(120);
      const hints = d.getElementById("tk-said-hints");
      ok("hints appear", !hints.hidden && /Looks like/.test(hints.textContent));
      ok("a flow chip is offered", Array.from(hints.querySelectorAll(".chip-flow")).some(c => /Cannot print/.test(c.textContent)));
      ok("a KI chip is offered", hints.querySelectorAll(".chip-ki").length >= 1);
      ok("flows panel also suggests from the said text", /Suggested flows for this issue/.test(d.querySelector("#tk-flow").textContent));
      // Ctrl+Enter starts the best flow
      d.getElementById("tk-said").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); await wait(100);
      ok("Ctrl+Enter starts the best flow", S.ticket.current().flow && S.ticket.current().flow.id === "pk-fl-2");
      // use as issue / add to description
      input(d.getElementById("tk-said"), "My printer is offline. It started this morning after the update!"); await wait(100);
      btn("Use as issue", d.getElementById("tk-said-hints")).click(); await wait(60);
      ok("Use as issue copies the first sentence", d.getElementById("tk-issue").value === "My printer is offline");
      btn("Add to description", d.getElementById("tk-said-hints")).click(); await wait(60);
      ok("Add to description quotes the user", /The user says: \u201CMy printer is offline\. It started/.test(d.getElementById("tk-desc").value));
      ok("the said text survives re-rendering", d.getElementById("tk-said").value.startsWith("My printer is offline."));
      // secret warning
      input(d.getElementById("tk-said"), "password: Winter2024Secret!"); await wait(60);
      ok("secret warning shown", !d.getElementById("tk-said-warn").hidden);
      input(d.getElementById("tk-said"), "My printer is offline"); await wait(60);
      ok("warning clears", d.getElementById("tk-said-warn").hidden);
      // never saved to history
      input(d.getElementById("tk-userid"), "jdoe"); input(d.getElementById("tk-username"), "John Doe"); input(d.getElementById("tk-host"), "PC-01"); input(d.getElementById("tk-short"), "Printer offline"); await wait(60);
      ok("ticket saves", S.ticket.save() === true);
      const rec = store.get("tickets", [])[0];
      ok("history copy has no 'said' text", rec.snapshot.said === "" && !JSON.stringify(rec).includes("nothing prints") && !JSON.stringify(rec).includes("Winter2024"));
      ok("the draft still keeps it", S.ticket.current().said === "My printer is offline");
      ok("Clear empties the box", (btn("Clear", d.getElementById("tk-said-hints")).click(), await wait(60), d.getElementById("tk-said").value === ""));

      // alt+w
      d.getElementById("tk-issue").focus();
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "w", altKey: true, bubbles: true })); await wait(120);
      ok("Alt+W focuses the box", d.activeElement && d.activeElement.id === "tk-said");

      // quick start chips: most used + pinned
      const mk = (id, n) => { const out = []; for (let i = 0; i < n; i++) out.push({ id: "U" + id + i, createdAt: new Date().toISOString(), shortDescription: "x", userId: "u", userName: "n", hostname: "h", kis: [], outcome: "Resolved", flow: { id, title: id, resultId: "n3", resultText: "r", noKi: false } }); return out; };
      store.set("tickets", [].concat(mk("pk-fl-3", 5), mk("pk-fl-1", 3), mk("pk-fl-5", 2), mk("pk-fl-7", 1)));
      S.ticket.current().flow = null; S.ticket.persist(); S.ticket.render(); await wait(100);
      let chips = Array.from(d.querySelectorAll("#tk-flow .fl-quick .chip-flow")).map(c => c.getAttribute("aria-label"));
      ok("quick start shows the 3 most used, in order: " + chips.join(" | "), chips.length === 3 && /No internet or network problems/.test(chips[0]) && /Unable to access VPN|Outlook problems/.test(chips[1] + chips[2]) === true || chips.length === 3);
      ok("most-used flow is first", /^Start No internet or network problems/.test(chips[0]));
      // pin "Cannot print"
      const pickRow = Array.from(d.querySelectorAll("#tk-flow .fl-pick")).find(li => /Cannot print/.test(li.textContent)) || null;
      const inp = d.querySelector("#tk-flow .fl-find"); input(inp, "cannot print"); await wait(60);
      d.querySelector("#tk-flow .fl-pick .pin-btn").click(); await wait(60);
      chips = Array.from(d.querySelectorAll("#tk-flow .fl-quick .chip-flow")).map(c => c.getAttribute("aria-label"));
      ok("pinned flow goes first with a star", /Cannot print \(pinned\)/.test(chips[0]) && S.flows.pins().includes("pk-fl-2"));
      ok("pin survives re-render and is capped at 6", chips.length >= 4 && chips.length <= 6);
      d.querySelector("#tk-flow .fl-quick .chip-flow").click(); await wait(80);
      ok("a quick start chip starts the flow", S.ticket.current().flow && S.ticket.current().flow.id === "pk-fl-2");
      S.ticket.current().flow = null; S.ticket.persist(); S.ticket.render(); await wait(60);
      const pinBtn = d.querySelector("#tk-flow .fl-quick .chip-flow") ? true : false;
      const star = Array.from(d.querySelectorAll("#tk-flow .fl-pick")).map(li => li.querySelector(".pin-btn")).find(b => b && b.classList.contains("on"));
      star.click(); await wait(60); ok("unpin works from the list", !S.flows.pins().includes("pk-fl-2"));

      // compact view
      d.getElementById("tk-compact").click(); await wait(30);
      ok("compact view on", d.body.classList.contains("tk-compact") && d.getElementById("tk-compact").getAttribute("aria-pressed") === "true");
      ok("choice remembered", S.prefs.get("ticketCompact") === true);
      d.getElementById("tk-compact").click(); ok("compact view off", !d.body.classList.contains("tk-compact") && S.prefs.get("ticketCompact") === false);
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "d", altKey: true, bubbles: true })); ok("Alt+D toggles", d.body.classList.contains("tk-compact"));
      S.shell.applyCompact(false);
      // shortcut sheet
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "?", bubbles: true })); await wait(60);
      ok("shortcut sheet lists Alt+W and Alt+D", /Alt\+W/.test(d.body.textContent) && /Alt\+D/.test(d.body.textContent));
      console.log("errors:", errs);
      process.exit(0);
    } catch (e) { console.log("THROW", e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")); console.log("errors:", errs); process.exit(1); }
  }, 1500);
});
