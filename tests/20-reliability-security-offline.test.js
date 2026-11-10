const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const jsdom = require("jsdom"), { JSDOM, requestInterceptor } = jsdom, path = require("path"), fs = require("fs");
const root = process.env.SDT_ROOT || (ROOT + "");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 280000);
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
const loaded = [];
const resources = { interceptors: [requestInterceptor(request => { loaded.push(request.url); })] };
async function boot() {
  const net = { fetch: 0, xhr: 0, ws: 0, beacon: 0, es: 0, alert: 0 }, errs = [];
  const dom = await JSDOM.fromFile(path.join(root, "index.html"), { runScripts: "dangerously", resources, pretendToBeVisual: true, url: "file://" + root + "/index.html",
    beforeParse(w) {
      require("./harness").installStorage(w);
      w.fetch = function () { net.fetch++; return Promise.reject(new Error("no network")); };
      w.XMLHttpRequest = function () { net.xhr++; };
      w.WebSocket = function () { net.ws++; }; w.EventSource = function () { net.es++; };
      w.navigator.sendBeacon = function () { net.beacon++; return false; };
      w.alert = function () { net.alert++; }; w.confirm = function () { net.alert++; return false; }; w.prompt = function () { net.alert++; return null; };
      w.addEventListener("error", e => errs.push(e.message)); w.addEventListener("unhandledrejection", e => errs.push("rejection: " + (e.reason && e.reason.message)));
    } });
  const w = dom.window; w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  const origErr = w.console.error; w.console.error = function () { errs.push("console.error: " + Array.from(arguments).join(" ").slice(0, 120)); };
  await wait(1500);
  Array.from(w.document.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
  return { w, d: w.document, net, errs, S: w.SDT };
}
const btnIn = (root, txt) => Array.from(root.querySelectorAll("button")).find(x => x.textContent.trim() === txt);
const closeModals = async (d) => { for (let i = 0; i < 4; i++) { const x = Array.from(d.querySelectorAll(".modal-x")); if (!x.length) break; x.forEach(b => b.click()); await wait(30); const dis = Array.from(d.querySelectorAll(".modal button")).find(b => /^(discard|leave)/i.test(b.textContent.trim())); if (dis) { dis.click(); await wait(30); } } };
const mkTickets = n => Array.from({ length: n }, (_, i) => ({ id: "T" + String(1e9 + n - i), createdAt: new Date(Date.now() - i * 6e5).toISOString(), shortDescription: "Ticket number " + (n - i), userId: "u" + (i % 9), userName: "User", hostname: "PC", timeZone: "PHT", kis: [], outcome: "Resolved", minutes: 5, ticketText: "t", workNotes: "n", snapshot: { kis: [], custom: [] } }));
function fill(c) { c.userId = "jdoe"; c.userName = "John Doe"; c.host = "PC-01"; c.shortDesc = "Archive test"; }

(async () => {
  // ================= static guarantees =================
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ok("a Content-Security-Policy blocks network requests", /Content-Security-Policy[^>]+connect-src 'none'/.test(html) && /form-action 'none'/.test(html) && /frame-src 'none'/.test(html));
  ok("every script is deferred (does not block the first paint)", !/<script src=/.test(html) && (html.match(/<script defer src=/g) || []).length > 30);
  ok("no http(s) URL appears in the page, styles or scripts", !/https?:\/\/(?!www\.w3\.org)/.test(html + fs.readdirSync(path.join(root, "assets/js")).map(f => fs.readFileSync(path.join(root, "assets/js", f), "utf8")).join("") + fs.readdirSync(path.join(root, "assets/css")).map(f => fs.readFileSync(path.join(root, "assets/css", f), "utf8")).join("")));
  ok("a no-JavaScript message is present", /<noscript>/.test(html));

  // ================= history archive: nothing removed without confirmation =================
  for (const scenario of ["notnow", "keep", "remove"]) {
    const { w, d, S } = await boot(); const store = S.storage;
    store.set("tickets", mkTickets(520)); w.location.hash = "#ticket"; S.ticket.render(); await wait(60);
    fill(S.ticket.current()); const saved = S.ticket.save();
    const n = store.get("tickets").length, oldest = store.get("tickets").slice(-1)[0];
    if (scenario === "notnow") {
      ok("[archive] saving past the limit keeps every ticket (" + n + ")", saved === true && n === 521);
      await wait(700); ok("[archive] you are asked first", /Ticket history is full/.test(d.body.textContent));
      btnIn(d.querySelector(".modal"), "Not now").click(); await wait(80);
      ok("[archive] Not now removes nothing", store.get("tickets").length === 521);
      S.history.offerArchive(); await wait(80); ok("[archive] and you are not asked again straight away", !d.querySelector(".modal"));
    } else {
      let dl = null; S.app.download = (name, text) => { dl = { name, text }; };
      await wait(700); btnIn(d.querySelector(".modal"), "Save a CSV file").click(); await wait(80);
      ok("[archive:" + scenario + "] a CSV with the oldest tickets is offered for download", dl && /\.csv$/.test(dl.name) && dl.text.includes(oldest.shortDescription));
      ok("[archive:" + scenario + "] tickets are still there while the file is being checked", store.get("tickets").length === 521 && /Was the file saved\?/.test(d.body.textContent));
      if (scenario === "keep") { btnIn(d.querySelector(".modal"), "No, keep them").click(); await wait(80); ok("[archive:keep] 'No, keep them' keeps everything", store.get("tickets").length === 521); }
      else {
        btnIn(d.querySelector(".modal"), "Yes, remove them").click(); await wait(100);
        const left = store.get("tickets"); ok("[archive:remove] only the oldest are removed, leaving exactly the limit (" + left.length + ")", left.length === 500 && left[0].shortDescription === "Archive test" && !left.some(t => t.id === oldest.id));
      }
    }
    w.close();
  }

  // ================= offline status, other-tab warning, input limits, injection =================
  const { w, d, net, errs, S } = await boot(); const store = S.storage;
  ok("an offline-ready indicator is shown", /Works offline/.test(d.getElementById("net-pill").textContent));
  Object.defineProperty(w.navigator, "onLine", { get: () => false, configurable: true }); w.dispatchEvent(new w.Event("offline"));
  ok("it changes when the connection drops, and says everything still works", /Offline: all features work/.test(d.getElementById("net-pill").textContent) && d.getElementById("net-pill").classList.contains("is-off"));
  Object.defineProperty(w.navigator, "onLine", { get: () => true, configurable: true }); w.dispatchEvent(new w.Event("online"));
  ok("and goes back", /Works offline/.test(d.getElementById("net-pill").textContent));
  ok("no other-tab warning at first", d.getElementById("tab-banner").hidden === true);
  w.dispatchEvent(new w.StorageEvent("storage", { key: "sdt.tickets" }));
  ok("a change made in another tab shows a warning", d.getElementById("tab-banner").hidden === false && /another tab/.test(d.getElementById("tab-banner").textContent));
  d.getElementById("tab-banner-close").click(); ok("it can be dismissed", d.getElementById("tab-banner").hidden === true);
  ok("ticket fields have length limits", d.getElementById("tk-userid").maxLength === 64 && d.getElementById("tk-issue").maxLength === 300 && d.getElementById("tk-notes").maxLength === 60000);
  S.scripts.openEditor(null); await wait(80);
  ok("fields created later get limits too", d.getElementById("sc-title").maxLength === 300 && d.getElementById("sc-codebox").maxLength === 60000);
  await closeModals(d);

  // script-injection attempt through every kind of field
  const XSS = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2<\/script>"\'`${7*7}';
  w.location.hash = "#ticket"; await wait(60);
  for (const id of ["tk-userid", "tk-username", "tk-host", "tk-issue", "tk-said", "tk-notes", "tk-short", "tk-desc"]) { const e = d.getElementById(id); if (e) { e.value = XSS; e.dispatchEvent(new w.Event("input", { bubbles: true })); } }
  await wait(120);
  fill(S.ticket.current()); S.ticket.current().shortDesc = XSS; S.ticket.current().userName = XSS; S.ticket.save();
  for (const v of ["history", "dashboard", "reports", "ticket", "favorites"]) { w.location.hash = "#" + v; await wait(80); }
  w.location.hash = "#history"; await wait(80); d.querySelector("#hist-list .result-main") && d.querySelector("#hist-list .result-main").click(); await wait(60);
  ok("HTML typed by a user is shown as text, never run", !w.__pwned && !d.querySelector("#hist-list img, #hist-detail img, #view-ticket img, #view-dashboard img") && !d.querySelector("#view-history script"));
  ok("and it is stored exactly as typed", store.get("tickets")[0].shortDescription === XSS);
  S.scripts.openEditor(null); await wait(60); d.getElementById("sc-title").value = XSS; d.getElementById("sc-cat").value = XSS; d.getElementById("sc-codebox").value = "echo " + XSS;
  btnIn(d.querySelector(".modal-foot"), "Save").click(); await wait(100); await closeModals(d);
  w.location.hash = "#scripts"; await wait(100); d.getElementById("sc-expand").click(); await wait(80);
  ok("scripts, categories and code with HTML in them stay inert", !w.__pwned && !d.querySelector("#view-scripts img") && !d.querySelector("#view-scripts script"));
  S.flows.openEditor(null); await wait(60); d.getElementById("fe-title").value = XSS; d.querySelector(".fl-node textarea").value = XSS; await closeModals(d);

  // ================= stress: click every button on every page, with data present =================
  S.library.addStarter(); await wait(150); btnIn(d.querySelector(".modal"), "Import") && btnIn(d.querySelector(".modal"), "Import").click(); await wait(250);
  const kbb = Array.from(d.querySelectorAll(".modal-foot button")).find(b => /^Import/.test(b.textContent.trim())); if (kbb) kbb.click(); await wait(250); await closeModals(d);
  store.set("tickets", mkTickets(60).concat(store.get("tickets"))); 
  const views = ["ticket", "history", "favorites", "library", "kb", "flows", "checklists", "snippets", "email", "scripts", "reference", "tools", "dashboard", "reports", "settings"];
  let clicked = 0, skipped = 0; const errBefore = errs.length;
  S.app.download = () => {}; w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  for (const v of views) {
    w.location.hash = "#" + v; await wait(90); await closeModals(d);
    for (let pass2 = 0; pass2 < 2; pass2++) {
      const view = d.getElementById("view-" + v); if (!view) continue;
      const buttons = Array.from(view.querySelectorAll("button")).filter(b => !b.disabled && !b.hidden);
      for (const b of buttons.slice(0, 80)) {
        if (!b.isConnected) { skipped++; continue; }
        const label = b.textContent.trim();
        if (/^(Reload|Restore|Free the old copy|Use large storage|Back to normal storage)/.test(label)) { skipped++; continue; }   // these reload the page or switch storage
        try { b.click(); } catch (e) { errs.push("click threw on '" + label + "': " + e.message); }
        clicked++; await wait(12);
        if (d.querySelector(".modal")) { const t = d.querySelector(".modal").textContent; await closeModals(d); }
        if (w.location.hash !== "#" + v) { w.location.hash = "#" + v; await wait(40); }
      }
    }
  }
  ok("stress run clicked " + clicked + " buttons across " + views.length + " pages with no JavaScript errors (" + (errs.length - errBefore) + " new)", clicked > 150 && errs.length === errBefore);
  if (errs.length) console.log("   errors seen:", errs.slice(0, 8));
  // typed input into every field on every page
  let typed = 0; const errMid = errs.length;
  for (const v of views) {
    w.location.hash = "#" + v; await wait(80); await closeModals(d);
    Array.from(d.getElementById("view-" + v).querySelectorAll("input[type=text], input[type=search], textarea")).forEach(i => { if (i.id === "sc-file-input") return; i.value = "zz'\"<b>" + "q".repeat(40); i.dispatchEvent(new w.Event("input", { bubbles: true })); typed++; });
    await wait(150);
    Array.from(d.getElementById("view-" + v).querySelectorAll("select")).forEach(s => { if (s.options.length > 1) { s.selectedIndex = s.options.length - 1; s.dispatchEvent(new w.Event("change", { bubbles: true })); typed++; } });
    await wait(80);
  }
  ok("typing into " + typed + " fields and changing every dropdown caused no errors", typed > 20 && errs.length === errMid);
  if (errs.length > errMid) console.log("   errors seen:", errs.slice(errMid, errMid + 6));

  // ================= no network, ever =================
  ok("the whole session made no network calls (fetch/XHR/WebSocket/beacon/EventSource = " + [net.fetch, net.xhr, net.ws, net.beacon, net.es].join("/") + ")", net.fetch + net.xhr + net.ws + net.beacon + net.es === 0);
  const refs = []; (html.match(/(?:src|href)="[^"]*"/g) || []).forEach(r => { const u = r.slice(r.indexOf('"') + 1, -1); if (!u.startsWith("#") && !u.startsWith("data:")) refs.push(u); });
  ok("every file the page uses is a local file that exists (" + refs.length + " references)", refs.length > 30 && refs.every(u => !/^[a-z]+:/i.test(u) && fs.existsSync(path.join(root, u))));
  ok("no browser alert/confirm/prompt pop-ups were used", net.alert === 0);

  // ================= unreadable data: the app tells you and keeps a copy =================
  w.localStorage.setItem("sdt.snippets", "{broken");
  S.storage.get("snippets", []); await wait(40);
  ok("unreadable saved data triggers a plain-language message", /could not be read \(snippets\)/.test(d.getElementById("toast").textContent));
  w.location.hash = "#settings"; await wait(100);
  ok("Settings offers to download the unreadable data", !d.getElementById("st-corrupt").hidden && !d.getElementById("st-corrupt-dl").hidden && /unreadable/.test(d.getElementById("st-corrupt").textContent));
  d.getElementById("st-corrupt-del").click(); await wait(60);
  ok("deleting it asks first", /Delete the unreadable data\?/.test(d.body.textContent));
  btnIn(d.querySelector(".modal"), "Delete it").click(); await wait(80);
  ok("then it is gone", d.getElementById("st-corrupt").hidden === true && Object.keys(S.storage.corruptItems()).length === 0);
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})().catch(e => { console.log("THROW", e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
