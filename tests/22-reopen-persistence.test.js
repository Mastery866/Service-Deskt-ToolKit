const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
/* Close and reopen: nothing may be lost, including a draft that was never saved. */
const { JSDOM } = require("jsdom"), path = require("path");
const root = process.env.SDT_ROOT || (ROOT + "");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 120000);
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
const disk = new Map();      // survives "closing the browser"
async function open() {
  const errs = [];
  const dom = await JSDOM.fromFile(path.join(root, "index.html"), { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "file://" + root + "/index.html",
    beforeParse(w) { require("./harness").installStorage(w, 5000000, disk); w.addEventListener("error", e => errs.push(e.message)); } });
  const w = dom.window; w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  await wait(1500); Array.from(w.document.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
  return { w, d: w.document, S: w.SDT, errs };
}
const input = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
(async () => {
  // ---------- first session ----------
  let { w, d, S, errs } = await open();
  ok("first start: sample knowledge base was created", S.storage.get("kb").length >= 30);
  w.location.hash = "#ticket"; await wait(80);
  input(w, d.getElementById("tk-userid"), "jdoe"); input(w, d.getElementById("tk-username"), "John Doe"); input(w, d.getElementById("tk-host"), "PC-77");
  input(w, d.getElementById("tk-issue"), "Unable to access VPN"); input(w, d.getElementById("tk-said"), "It says the certificate is not valid"); input(w, d.getElementById("tk-notes"), "scratch notes here"); input(w, d.getElementById("tk-short"), "VPN certificate problem");
  await wait(120);
  S.ticket.current().kis.length || (S.ticket.openPicker && 0);
  d.querySelector("#tk-flow .fl-suggest .btn").click(); await wait(80);
  d.querySelectorAll("#tk-flow .fl-answer")[1].click(); await wait(60);                 // No
  d.querySelectorAll("#tk-flow .fl-answer")[1].click(); await wait(60);                 // More than 3 months ago
  S.ticket.current().timerMs = 123000;
  // other data: script, flow, checklist, pin, preference, compact view
  S.scripts.openEditor(null); await wait(60); d.getElementById("sc-title").value = "My reopen script"; d.getElementById("sc-cat").value = "Persist"; d.getElementById("sc-codebox").value = "echo kept";
  Array.from(d.querySelectorAll(".modal-foot button")).find(b => b.textContent === "Save").click(); await wait(100);
  S.flows.togglePin(S.flows.list()[0].id);
  d.getElementById("tk-compact").click();
  S.storage.set("customThing", { a: [1, 2, 3] });
  // save the ticket to history, then start a new draft
  const draftBefore = JSON.parse(JSON.stringify(S.ticket.current()));
  ok("session 1: the ticket saves", S.ticket.save() === true);
  w.location.hash = "#ticket"; await wait(60);
  input(w, d.getElementById("tk-userid"), "second"); input(w, d.getElementById("tk-short"), "A second draft that is never saved"); await wait(100);
  const n1 = { tickets: S.storage.get("tickets").length, scripts: S.scripts.list().length, kb: S.storage.get("kb").length, flows: S.flows.list().length };
  ok("session 1: no JavaScript errors", errs.length === 0);
  w.close();

  // ---------- "close the browser", then reopen ----------
  ({ w, d, S, errs } = await open());
  ok("reopened: saved ticket is in the history", S.storage.get("tickets").length === n1.tickets && S.storage.get("tickets")[0].shortDescription === "VPN certificate problem");
  ok("reopened: the saved ticket kept which flow was used and how it ended", !!S.storage.get("tickets")[0].flow && S.storage.get("tickets")[0].flow.title === "Unable to access VPN" && /certificate/i.test(S.storage.get("tickets")[0].flow.resultText));
  ok("reopened: the script is still there", S.scripts.list().length === n1.scripts && S.scripts.list().some(s => s.title === "My reopen script" && s.code === "echo kept"));
  ok("reopened: KB and flows unchanged", S.storage.get("kb").length === n1.kb && S.flows.list().length === n1.flows);
  ok("reopened: pinned flow still pinned", S.flows.pins().length === 1);
  ok("reopened: compact view preference restored", d.body.classList.contains("tk-compact"));
  ok("reopened: other saved values are intact", JSON.stringify(S.storage.get("customThing")) === '{"a":[1,2,3]}');
  w.location.hash = "#ticket"; await wait(100);
  ok("reopened: the unsaved draft is back exactly as left", d.getElementById("tk-userid").value === "second" && d.getElementById("tk-short").value === "A second draft that is never saved");
  const first = S.storage.get("ticketTabs") || null;
  ok("reopened: no JavaScript errors", errs.length === 0);
  // a refresh in the middle of typing: draft field values and the user's words persist without pressing anything
  input(w, d.getElementById("tk-said"), "typed just before refresh"); input(w, d.getElementById("tk-host"), "PC-REFRESH"); await wait(80);
  w.close();
  ({ w, d, S, errs } = await open()); w.location.hash = "#ticket"; await wait(100);
  ok("after a refresh, what was typed a moment ago is still there (automatic saving)", d.getElementById("tk-said").value === "typed just before refresh" && d.getElementById("tk-host").value === "PC-REFRESH");
  ok("the tour does not come back after it was seen", !d.querySelector(".modal"));
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})().catch(e => { console.log("THROW", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); process.exit(1); });
