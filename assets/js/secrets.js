/* secrets.js - looks for things that should not be saved or shared: passwords, keys and tokens.
   Used before saving scripts, flows and KB articles, and before exporting. It only warns; you decide. */
(function (global) {
  "use strict";
  var SDT = global.SDT;
  var SKIP = /^(required|reset|resets|expired|changed|change|here|yourpassword|password|passwords|example|hidden|none|null|empty|blank|secret|token|policy|must|should|never|always|prompt|manager)$/i;
  var RULES = [
    { label: "looks like a password or secret value", re: /\b(pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|client[_-]?secret|access[_-]?key)\b["']?\s*[:=]\s*["']?([^\s"'<>{}%$;,]{6,})/ig, group: 2, skip: SKIP },
    { label: "looks like a private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
    { label: "looks like a cloud access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
    { label: "looks like a bearer token", re: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}/g },
    { label: "looks like a long random key", re: /(?:^|[\s"'=:])([A-Za-z0-9+\/]{40,}={0,2})(?=$|[\s"',;])/g, group: 1 }
  ];

  function mask(s) { s = String(s); return s.length <= 3 ? "***" : s.slice(0, 2) + "***"; }
  function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

  /* Returns a list of {line, label, sample}. Placeholders such as {{password}}, %PASSWORD% or $env:PASS are ignored. */
  function scan(text) {
    text = String(text || ""); var found = [], seen = {};
    RULES.forEach(function (r) {
      r.re.lastIndex = 0; var m;
      while ((m = r.re.exec(text))) {
        var val = r.group ? m[r.group] : m[0];
        if (r.skip && r.skip.test(val)) continue;
        if (r.label.indexOf("random") > -1 && (/^[a-z]+$/i.test(val) || /^[A-Za-z]+(\/[A-Za-z]+)+$/.test(val))) continue;
        var line = lineOf(text, m.index), key = r.label + line;
        if (seen[key]) continue; seen[key] = true;
        found.push({ line: line, label: r.label, sample: mask(val) });
        if (found.length >= 25) return;
      }
    });
    return found.sort(function (a, b) { return a.line - b.line; });
  }

  function describe(found) {
    var lines = found.slice(0, 4).map(function (f) { return "Line " + f.line + ": " + f.label + " (" + f.sample + ")"; });
    if (found.length > 4) lines.push("...and " + (found.length - 4) + " more");
    return lines.join("\n");
  }

  /* Promise<boolean>: true when nothing was found, or when you choose to continue. */
  function check(texts, what, verb) {
    var found = scan((Array.isArray(texts) ? texts : [texts]).join("\n"));
    if (!found.length) return Promise.resolve(true);
    return SDT.modal.confirm({
      title: "This may contain a secret", danger: true, confirmLabel: verb || "Continue anyway",
      message: "Found in " + what + ":\n\n" + describe(found) + "\n\nPasswords and keys should not be stored or shared here. Use a {{placeholder}} instead, or continue if this is a false alarm."
    });
  }

  /* For Save buttons inside a dialog. Returns true when it is fine to save right now. Otherwise it asks, and if you
     choose to continue it presses Save again. state is a small object kept for the life of the dialog. */
  function gate(state, texts, what, handle) {
    if (state.ok) return true;
    var joined = (Array.isArray(texts) ? texts : [texts]).join("\n");
    if (!scan(joined).length) return true;           // nothing found: save straight away, no extra dialog
    check(texts, what, "Save anyway").then(function (ok) {
      if (!ok) return;
      state.ok = true;
      var b = handle && handle.el && handle.el.querySelector(".modal-foot .btn");
      if (b) b.click();
    });
    return false;
  }

  SDT.secrets = { scan: scan, check: check, gate: gate };
})(window);
