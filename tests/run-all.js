/* Runs every test one after another and prints a summary. Usage:  node tests/run-all.js   (see README.md for setup)
   The app itself needs no install. These tests are only for developers (they use jsdom to run the page without a browser). */
const { spawnSync } = require("child_process"), fs = require("fs"), path = require("path");
const dir = __dirname, files = fs.readdirSync(dir).filter(f => /\.test\.js$/.test(f)).sort();
let totalPass = 0, totalFail = 0, bad = [];
console.log("Running " + files.length + " test files...\n");
for (const f of files) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: "utf8", timeout: 300000, env: process.env });
  const out = (r.stdout || "") + (r.stderr || "");
  const pass = (out.match(/^PASS /gm) || []).length, fail = (out.match(/^FAIL /gm) || []).length;
  let p2 = pass, f2 = fail;
  const m = /(\d+) passed, (\d+) failed/.exec(out); if (m && !pass && !fail) { p2 = +m[1]; f2 = +m[2]; }
  const crashed = /^THROW|^TIMEOUT/m.test(out) || r.status === null || (r.status !== 0 && !f2);
  totalPass += p2; totalFail += f2 + (crashed ? 1 : 0);
  const state = f2 || crashed ? "FAIL" : "ok  ";
  console.log(state + "  " + f.padEnd(52) + String(p2).padStart(4) + " passed" + (f2 ? ", " + f2 + " FAILED" : "") + (crashed ? "  (crashed or timed out)" : "") + "   " + ((Date.now() - started) / 1000).toFixed(1) + "s");
  if (f2 || crashed) { bad.push(f); out.split("\n").filter(l => /^(FAIL|THROW|TIMEOUT)/.test(l) || /error/i.test(l) && /^\s/.test(l)).slice(0, 8).forEach(l => console.log("        " + l)); }
}
console.log("\n" + totalPass + " checks passed, " + totalFail + " failed" + (bad.length ? "  <- " + bad.join(", ") : ""));
process.exit(totalFail ? 1 : 0);
