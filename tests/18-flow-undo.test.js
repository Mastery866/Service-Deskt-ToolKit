const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const { JSDOM } = require("jsdom");
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 60000);
JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document; w.document.execCommand = () => false; w.Element.prototype.scrollIntoView = function () {};
  const wait = ms => new Promise(r => setTimeout(r, ms)); const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const btn = (txt, root) => Array.from((root || d).querySelectorAll("button")).find(x => x.textContent.trim() === txt);
  setTimeout(async () => {
    const S = w.SDT; await wait(700); Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
    w.location.hash = "#ticket"; await wait(80);
    S.flows.startOn(S.flows.list()[0].id); await wait(80);
    d.querySelectorAll("#tk-flow .fl-answer")[1].click(); await wait(60);
    ok("an answer is recorded", S.ticket.current().flow.path.length === 1);
    btn("Clear", d.getElementById("tk-flow")).click(); await wait(80);
    ok("Clear removes the flow", !S.ticket.current().flow);
    const undo = Array.from(d.querySelectorAll("button")).find(b => /^undo$/i.test(b.textContent.trim()));
    ok("an Undo button is offered", !!undo); undo.click(); await wait(80);
    ok("Undo brings the answers back", S.ticket.current().flow && S.ticket.current().flow.path.length === 1);
    btn("Restart", d.getElementById("tk-flow")).click(); await wait(80);
    ok("Restart empties the answers", S.ticket.current().flow.path.length === 0);
    const undo2 = Array.from(d.querySelectorAll("button")).find(b => /^undo$/i.test(b.textContent.trim())); undo2.click(); await wait(80);
    ok("Undo after Restart", S.ticket.current().flow.path.length === 1);
    process.exit(0);
  }, 1500);
});
