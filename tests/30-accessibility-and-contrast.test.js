const ROOT = process.env.SDT_ROOT || require("path").resolve(__dirname, "..");
const fs = require("fs"), { JSDOM } = require("jsdom");
const css = fs.readFileSync((ROOT + "/assets/css/modern.css"), "utf8");
const old = fs.readFileSync((ROOT + "/assets/css/style.css"), "utf8");
function vars(block) { const o = {}; block.replace(/--([a-z-]+):\s*([^;]+);/g, (m, k, v) => { o[k] = v.trim(); }); return o; }
const light = Object.assign(vars(old.match(/:root\s*{([^}]*)}/)?.[1] || ""), vars(css.match(/:root\s*{([^}]*)}/)[1]));
const dark = Object.assign({}, light, vars((old.match(/\[data-theme="dark"\]\s*{([^}]*)}/) || [, ""])[1]), vars(css.match(/\[data-theme="dark"\]\s*{([^}]*)}/)[1]));
function rgb(c) { c = c.trim(); let m; if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)); if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return [...m[1]].map(x => parseInt(x + x, 16)); return null; }
function lum([r, g, b]) { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); }
function ratio(a, b) { const A = rgb(a), B = rgb(b); if (!A || !B) return null; const l1 = lum(A), l2 = lum(B); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); }
const pairs = [["text", "bg"], ["text", "surface"], ["text-muted", "bg"], ["text-muted", "surface"], ["accent", "surface"], ["accent", "accent-soft"], ["text", "accent-soft"], ["danger", "surface"], ["warn", "warn-soft"], ["on-accent", "accent"], ["on-danger", "danger"], ["text-muted", "accent-soft"]];
for (const [name, th] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of pairs) {
    const f = fg.startsWith("#") ? fg : th[fg], b = bg.startsWith("#") ? bg : th[bg];
    const r = ratio(f, b); if (r === null) { console.log(`?    ${name}: ${fg} (${f}) on ${bg} (${b})`); continue; }
    console.log(`${r >= 4.5 ? "PASS" : "FAIL"} ${name}: ${fg} ${f} on ${bg} ${b} = ${r.toFixed(2)}`);
  }
}
// sidebar
for (const [name, th] of [["light", light], ["dark", dark]]) { const r = ratio("#cdd6e4", "#0f1b2d"); console.log(`${r >= 4.5 ? "PASS" : "FAIL"} sidebar group label on navy = ${r.toFixed(2)} (${name})`); }
console.log("palette/chip: muted on bg", ratio(light["text-muted"], light.bg).toFixed(2));

JSDOM.fromFile((ROOT + "/index.html"), { runScripts: "dangerously", beforeParse(w) { require("./harness").installStorage(w); }, resources: "usable", pretendToBeVisual: true, url: "file://" + ROOT + "/index.html" }).then(dom => {
  const w = dom.window, d = w.document; w.document.execCommand = () => false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  setTimeout(async () => {
    Array.from(d.querySelectorAll(".modal-x")).forEach(x => x.click()); await wait(60);
    const views = ["ticket", "history", "favorites", "library", "kb", "flows", "checklists", "snippets", "email", "scripts", "reference", "tools", "dashboard", "reports", "settings"];
    const problems = [];
    const name = el => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    for (const v of views) {
      w.location.hash = "#" + v; await wait(120);
      const root = d.getElementById("view-" + v);
      root.querySelectorAll("button").forEach(b => { if (!name(b) && !b.querySelector("svg title")) problems.push(`${v}: button without a name: ${b.outerHTML.slice(0, 90)}`); });
      root.querySelectorAll("a").forEach(a => { if (!name(a)) problems.push(`${v}: link without text`); });
      root.querySelectorAll("input:not([type=hidden]):not([type=file]), select, textarea").forEach(i => {
        const lab = i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || (i.id && root.querySelector(`label[for="${i.id}"]`)) || d.querySelector(`label[for="${i.id}"]`) || i.closest("label");
        if (!lab && i.type !== "checkbox" || (!lab && i.type === "checkbox")) problems.push(`${v}: field without a label: <${i.tagName.toLowerCase()} id="${i.id}" type="${i.type || ""}" placeholder="${(i.placeholder || "").slice(0, 30)}">`);
      });
    }
    const ids = {}; d.querySelectorAll("[id]").forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
    Object.keys(ids).filter(k => ids[k] > 1).forEach(k => problems.push("duplicate id: " + k));
    // headings order: one h1 per view
    views.forEach(v => { const n = d.getElementById("view-" + v).querySelectorAll("h1").length; if (n !== 1) problems.push(`${v}: has ${n} h1`); });
    console.log(problems.length ? problems.join("\n") : "No unlabeled buttons, links or fields, no duplicate ids, one h1 per page.");
    process.exit(0);
  }, 1500);
});
