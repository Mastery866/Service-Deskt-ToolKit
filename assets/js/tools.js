/* tools.js - small offline helpers (subnet calculator, text cleaner, timestamp converter, password generator)
   and the keyboard shortcut sheet (press ?). Nothing is stored and nothing leaves the browser. */
(function (global) {
  "use strict";
  var SDT = global.SDT;
  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function field(label, ctl, id) { var d = el("div"), l = el("label", "", label); l.htmlFor = id; ctl.id = id; d.appendChild(l); d.appendChild(ctl); return d; }
  function input(ph) { var i = el("input"); i.type = "text"; i.autocomplete = "off"; i.spellcheck = false; if (ph) i.placeholder = ph; return i; }
  function copyBtn(getText, label) {
    var b = el("button", "btn btn-ghost btn-sm", label || "Copy"); b.type = "button";
    b.addEventListener("click", function () { var t = getText(); if (t) SDT.app.copy(t, "Copied", { skipGuard: true }); });
    return b;
  }
  function card(title, note) { var p = el("div", "panel"); p.appendChild(el("h2", "", title)); if (note) p.appendChild(el("p", "empty small", note)); return p; }
  function resultRows(host, rows) {
    host.innerHTML = "";
    rows.forEach(function (r) {
      var row = el("div", "tl-row"); row.appendChild(el("span", "tl-key", r[0])); row.appendChild(el("span", "tl-val", r[1]));
      var b = copyBtn(function () { return r[1]; }, "Copy"); b.setAttribute("aria-label", "Copy " + r[0]); row.appendChild(b); host.appendChild(row);
    });
  }

  /* ---- Subnet calculator ---- */
  function ip2n(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim()); if (!m) return null;
    var o = [m[1], m[2], m[3], m[4]].map(Number); if (o.some(function (x) { return x > 255; })) return null;
    return o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
  }
  function n2ip(n) { return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join("."); }
  function maskOf(p) { return p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; }
  function prefixOf(mask) {
    var inv = (~mask) >>> 0; if ((inv & ((inv + 1) >>> 0)) !== 0) return null;
    var p = 0; for (var i = 31; i >= 0; i--) { if ((mask >>> i) & 1) p++; else break; } return p;
  }
  function subnet(text) {
    var m = /^\s*(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?\s*$/.exec(text);
    if (!m) return { error: "Enter an address like 192.168.1.10/24 or 192.168.1.10 255.255.255.0." };
    var ip = ip2n(m[1]); if (ip === null) return { error: "That IP address is not valid." };
    var p;
    if (m[2] != null) p = parseInt(m[2], 10);
    else if (m[3]) { var mk = ip2n(m[3]); if (mk === null) return { error: "That subnet mask is not valid." }; p = prefixOf(mk >>> 0); if (p === null) return { error: "That subnet mask has gaps in it, so it is not a valid mask." }; }
    else return { error: "Add a prefix (/24) or a subnet mask." };
    if (p < 0 || p > 32) return { error: "The prefix must be between 0 and 32." };
    var mask = maskOf(p), net = (ip & mask) >>> 0, bc = (net | ((~mask) >>> 0)) >>> 0, total = Math.pow(2, 32 - p);
    var usable = p >= 31 ? (p === 31 ? 2 : 1) : total - 2, first = p >= 31 ? net : net + 1, last = p >= 31 ? bc : bc - 1;
    var kind = "Public";
    if ((ip >>> 24) === 10) kind = "Private (10.0.0.0/8)";
    else if ((ip >>> 20) === 0xAC1) kind = "Private (172.16.0.0/12)";
    else if ((ip >>> 16) === 0xC0A8) kind = "Private (192.168.0.0/16)";
    else if ((ip >>> 16) === 0xA9FE) kind = "Link-local / APIPA (169.254.0.0/16): the PC did not get an address from DHCP";
    else if ((ip >>> 24) === 127) kind = "Loopback";
    return { rows: [["Network", n2ip(net) + "/" + p], ["Subnet mask", n2ip(mask)], ["Wildcard mask", n2ip((~mask) >>> 0)], ["Broadcast", n2ip(bc)],
      ["First host", n2ip(first)], ["Last host", n2ip(last)], ["Usable hosts", String(usable)], ["Type", kind]] };
  }
  function subnetCard() {
    var c = card("Subnet calculator", "Network, mask, broadcast and host range. Also shows whether an address is a 169.254 DHCP failure."), out = el("div", "tl-out");
    var i = input("192.168.1.10/24"); var f = field("IP address and prefix or mask", i, "tl-subnet");
    function run() { var r = subnet(i.value); if (!i.value.trim()) { out.innerHTML = ""; return; } if (r.error) { out.innerHTML = ""; out.appendChild(el("p", "warn", r.error)); } else resultRows(out, r.rows); }
    i.addEventListener("input", run); c.appendChild(f); c.appendChild(out); return c;
  }

  /* ---- Text cleaner ---- */
  function cleanText(txt, o) {
    var lines = String(txt).replace(/\r\n/g, "\n").split("\n");
    if (o.trim) lines = lines.map(function (l) { return l.trim(); });
    if (o.blank) lines = lines.filter(function (l) { return l !== ""; });
    if (o.lower) lines = lines.map(function (l) { return l.toLowerCase(); });
    if (o.dupes) { var seen = {}; lines = lines.filter(function (l) { var k = o.lower ? l : l.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; }); }
    if (o.sort) lines.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); });
    return lines.join(o.join === "comma" ? ", " : o.join === "semi" ? "; " : "\n");
  }
  function cleanerCard() {
    var c = card("Text cleaner", "Paste a list of names, hostnames or IDs and tidy it up."), src = el("textarea"); src.rows = 5; src.setAttribute("aria-label", "Text to clean"); src.placeholder = "Paste a list here, one item per line";
    var opts = el("div", "tl-opts"), st = { trim: true, blank: true, dupes: false, sort: false, lower: false, join: "line" };
    [["trim", "Trim spaces"], ["blank", "Remove empty lines"], ["dupes", "Remove duplicates"], ["sort", "Sort A to Z"], ["lower", "Lowercase"]].forEach(function (x) {
      var lab = el("label", "check"), cb = el("input"); cb.type = "checkbox"; cb.checked = st[x[0]];
      cb.addEventListener("change", function () { st[x[0]] = cb.checked; run(); }); lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + x[1])); opts.appendChild(lab);
    });
    var js = el("select"); js.setAttribute("aria-label", "Join with"); [["line", "One per line"], ["comma", "Comma separated"], ["semi", "Semicolon separated"]].forEach(function (x) { var o = el("option", "", x[1]); o.value = x[0]; js.appendChild(o); });
    js.addEventListener("change", function () { st.join = js.value; run(); }); opts.appendChild(js);
    var out = el("textarea"); out.rows = 5; out.readOnly = true; out.setAttribute("aria-label", "Cleaned text");
    var info = el("p", "empty small");
    function run() { out.value = cleanText(src.value, st); var n = out.value ? out.value.split(st.join === "line" ? "\n" : /[,;] /).length : 0; info.textContent = n ? n + " item" + (n === 1 ? "" : "s") : ""; }
    src.addEventListener("input", run);
    c.appendChild(src); c.appendChild(opts); c.appendChild(out); c.appendChild(info);
    var row = el("div", "btn-row"); row.appendChild(copyBtn(function () { return out.value; }, "Copy result")); c.appendChild(row);
    return c;
  }

  /* ---- Timestamp converter (includes Active Directory FILETIME) ---- */
  var EPOCH_DIFF = 11644473600000;
  function parseTs(v) {
    v = String(v).trim(); if (!v) return null;
    if (/^now$/i.test(v)) return { date: new Date() };
    if (v === "9223372036854775807" || v === "0x7FFFFFFFFFFFFFFF") return { never: true };
    if (/^\d+$/.test(v)) {
      var ms;
      if (v.length >= 17) { try { ms = Number(BigInt(v) / BigInt(10000)) - EPOCH_DIFF; } catch (e) { return null; } }
      else if (v.length >= 12) ms = Number(v); else ms = Number(v) * 1000;
      var d = new Date(ms); return isNaN(d.getTime()) ? null : { date: d };
    }
    var d2 = new Date(v); return isNaN(d2.getTime()) ? null : { date: d2 };
  }
  function timeCard() {
    var c = card("Timestamp converter", "Paste a Unix time (seconds or milliseconds), an Active Directory value such as lastLogonTimestamp, an ISO date, or type now."), out = el("div", "tl-out");
    var i = input("e.g. 133700000000000000 or 1767225600"); var f = field("Timestamp", i, "tl-ts");
    function run() {
      if (!i.value.trim()) { out.innerHTML = ""; return; }
      var p = parseTs(i.value);
      if (!p) { out.innerHTML = ""; out.appendChild(el("p", "warn", "That is not a time I can read.")); return; }
      if (p.never) { out.innerHTML = ""; out.appendChild(el("p", "empty", "This is the Active Directory maximum value. It means the account or password never expires.")); return; }
      var d = p.date, ms = d.getTime(), ft = (BigInt(ms) + BigInt(EPOCH_DIFF)) * BigInt(10000);
      resultRows(out, [["Local time", d.toLocaleString([], { dateStyle: "full", timeStyle: "medium" })], ["UTC", d.toUTCString()], ["ISO 8601", d.toISOString()],
        ["Unix seconds", String(Math.floor(ms / 1000))], ["Unix milliseconds", String(ms)], ["AD FILETIME", ft.toString()]]);
    }
    i.addEventListener("input", run); c.appendChild(f); c.appendChild(out); return c;
  }

  /* ---- Password generator (random from the browser's secure generator) ---- */
  function rnd(n) { var max = Math.floor(4294967296 / n) * n, b = new Uint32Array(1); do { global.crypto.getRandomValues(b); } while (b[0] >= max); return b[0] % n; }
  function makePassword(len, o) {
    var sets = [];
    function clean(s) { return o.alike ? s.replace(/[Il1O0o]/g, "") : s; }
    if (o.lower) sets.push(clean("abcdefghijklmnopqrstuvwxyz")); if (o.upper) sets.push(clean("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
    if (o.digits) sets.push(clean("0123456789")); if (o.symbols) sets.push("!@#$%^&*-_=+?");
    if (!sets.length) return "";
    var all = sets.join(""), out = sets.map(function (s) { return s[rnd(s.length)]; });
    while (out.length < len) out.push(all[rnd(all.length)]);
    for (var i = out.length - 1; i > 0; i--) { var j = rnd(i + 1), t = out[i]; out[i] = out[j]; out[j] = t; }
    return out.join("");
  }
  function passwordCard() {
    var c = card("Temporary password generator", "Random, made in your browser, never saved. Give it to the user through the approved channel, never in a ticket."), len = 16;
    var o = { lower: true, upper: true, digits: true, symbols: false, alike: true }, out = el("input"); out.type = "text"; out.readOnly = true; out.className = "tl-pass"; out.setAttribute("aria-label", "Generated password");
    var lw = el("label", "", "Length: 16"); lw.htmlFor = "tl-len"; var rg = el("input"); rg.type = "range"; rg.id = "tl-len"; rg.min = 10; rg.max = 32; rg.value = len;
    rg.addEventListener("input", function () { len = parseInt(rg.value, 10); lw.textContent = "Length: " + len; gen(); });
    var opts = el("div", "tl-opts");
    [["lower", "a-z"], ["upper", "A-Z"], ["digits", "0-9"], ["symbols", "Symbols"], ["alike", "Avoid look-alikes (l, 1, O, 0)"]].forEach(function (x) {
      var lab = el("label", "check"), cb = el("input"); cb.type = "checkbox"; cb.checked = o[x[0]];
      cb.addEventListener("change", function () { o[x[0]] = cb.checked; gen(); }); lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + x[1])); opts.appendChild(lab);
    });
    function gen() { out.value = makePassword(len, o); }
    var row = el("div", "btn-row"), g = el("button", "btn btn-sm", "Generate new"); g.type = "button"; g.addEventListener("click", gen);
    row.appendChild(g); row.appendChild(copyBtn(function () { return out.value; }, "Copy"));
    c.appendChild(lw); c.appendChild(rg); c.appendChild(opts); c.appendChild(out); c.appendChild(row); gen(); return c;
  }

  /* ---- Keyboard shortcut sheet ---- */
  var SHORTCUTS = [
    ["Everywhere", [["Ctrl+K", "Open the command palette"], ["/", "Jump to the Knowledge Base search"], ["?", "Show this sheet"], ["Esc", "Close a dialog, or close an open detail panel"]]],
    ["Ticket Generator", [["Ctrl+Enter", "Copy ticket details"], ["Ctrl+Shift+Enter", "Copy work notes"], ["Ctrl+S", "Save the ticket"], ["Alt+S", "Save and start the next ticket"], ["Alt+Q", "Find a question flow"], ["Alt+W", "Go to What the user said"], ["Alt+D", "Compact view on the ticket page"], ["Enter (in Issue)", "Open the KI picker"], ["1 to 9", "Pick an answer in Probing questions"], ["Left / Right arrow", "Move between ticket tabs"]]],
    ["Script editor", [["Tab / Shift+Tab", "Indent or remove an indent"], ["Ctrl+M", "Let Tab move between fields"]]]
  ];
  function openShortcuts() {
    if (SDT.modal.isOpen()) return;
    var body = el("div", "tl-shortcuts");
    SHORTCUTS.forEach(function (g) {
      body.appendChild(el("h3", "ins-h3", g[0]));
      g[1].forEach(function (s) { var r = el("div", "tl-srow"); r.appendChild(el("kbd", "", s[0])); r.appendChild(el("span", "", s[1])); body.appendChild(r); });
    });
    SDT.modal.open({ title: "Keyboard shortcuts", body: body, size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }

  function render() {
    var host = $("tl-body"); if (!host || host.firstChild) return;
    [subnetCard(), timeCard(), cleanerCard(), passwordCard()].forEach(function (c) { host.appendChild(c); });
  }
  function init() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || SDT.modal.isOpen()) return;
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || (e.target && e.target.isContentEditable)) return;
      e.preventDefault(); openShortcuts();
    });
  }

  SDT.tools = { init: init, render: render, openShortcuts: openShortcuts, subnet: subnet, clean: cleanText, parseTs: parseTs, password: makePassword };
})(window);
