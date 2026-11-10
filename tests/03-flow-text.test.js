const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const vm = require("vm"), fs = require("fs");
const win = { SDT: {} }; win.window = win; vm.createContext(win);
vm.runInContext(fs.readFileSync((ROOT + "/assets/js/flowtext.js"), "utf8"), win);
const F = win.SDT.flowtext; let pass = 0, fail = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
const txt = `# VPN
Q: Is this the first time?
  Yes -> R: Access not provisioned | KI: kb-010, KB-011 | search: VPN access | note: Check the group
  No -> Q[last]: When did the user last connect?
    Less than 3 months -> Q: What happens?
      Login error -> R: Locked account | KI: KB-001
      Certificate error -> [cert]
      ? -> R: Ask the user to check again
    More than 3 months -> [cert]

R[cert]: Certificate expired. | KI: KB-020 | flow: Other flow
`;
let r = F.fromText(txt, t => t === "Other flow" ? "flow-2" : "");
ok("parses", !r.error && r.nodes.length === 7);
const n = id => r.nodes.find(x => x.id === id);
ok("start is first node", r.start === "n1" && n("n1").text === "Is this the first time?");
ok("answers + result details", n("n1").answers.length === 2 && n("n2").kis.join() === "KB-010,KB-011" && n("n2").search === "VPN access" && n("n2").note === "Check the group");
ok("named reference resolved (both answers point to cert)", (() => { const cert = r.nodes.find(x => x.text.startsWith("Certificate expired")); const q = r.nodes.find(x => x.text === "What happens?"); return q.answers[1].next === cert.id && r.nodes.find(x => x.text.startsWith("When did")).answers[1].next === cert.id; })());
ok("unsure path", (() => { const q = r.nodes.find(x => x.text === "What happens?"); return q.answers.length === 2 && !!q.unsure && n(q.unsure).text.startsWith("Ask the user"); })());
ok("flow: link", r.nodes.find(x => x.text.startsWith("Certificate expired")).goto === "flow-2");
// round trip
const flow = { start: r.start, nodes: r.nodes };
const back = F.toText(flow, id => id === "flow-2" ? "Other flow" : "");
const r2 = F.fromText(back, t => t === "Other flow" ? "flow-2" : "");
ok("round trip parses", !r2.error && r2.nodes.length === r.nodes.length);
const sig = f => JSON.stringify(f.nodes.map(x => JSON.stringify([x.type, x.text, x.kis, x.search, x.note, x.goto || "", x.answers.map(a => a.label)])).sort());
ok("round trip same content", sig(r) === sig(r2));
// errors
ok("error: no head", /Line 1/.test(F.fromText("hello").error));
ok("error: bad target", /Line 2/.test(F.fromText("Q: a\n  Yes -> maybe").error));
ok("error: unknown name", /named \[zzz\]/.test(F.fromText("Q: a\n  Yes -> [zzz]").error));
ok("error: result with answers", /cannot have answers/.test(F.fromText("R: a\n  Yes -> R: b").error));
ok("error: unknown flow", /no flow is called/.test(F.fromText("R: a | flow: Nope", () => "").error));
ok("error: unknown detail", /unknown detail/.test(F.fromText("R: a | color: red").error));
ok("tabs as indent", !F.fromText("Q: a\n\tYes -> R: b").error);
console.log(pass + " passed, " + fail + " failed");
