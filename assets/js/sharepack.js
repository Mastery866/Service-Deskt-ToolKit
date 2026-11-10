/* sharepack.js - share your work with a teammate in one file (Knowledge Base, flows, scripts, canned responses,
   email templates, checklists), with a preview before anything is added. Also checks that a backup file can be read. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var PARTS = [
    { key: "kb", label: "Knowledge Base articles" }, { key: "flows", label: "Question flows" }, { key: "scripts", label: "Scripts and commands" },
    { key: "snippets", label: "Canned responses" }, { key: "emailTemplates", label: "Email templates" }, { key: "checklists", label: "Checklists" }
  ];
  var VOLATILE = ["id", "updatedAt", "createdAt", "usedAt", "favorite", "history", "reviewed"];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  var toast = window.SDT.dom.toast;
  function listOf(key) { var v = store.get(key, []); return Array.isArray(v) ? v : []; }
  function ident(it) { return String(it && (it.title || it.name || it.label) || "").trim().toLowerCase(); }
  function sig(it) { var c = {}; Object.keys(it || {}).sort().forEach(function (k) { if (VOLATILE.indexOf(k) === -1) c[k] = it[k]; }); return JSON.stringify(c); }
  function uid() { return window.SDT.dom.uid("sp"); }
  var today = window.SDT.dom.today;
  function refreshAll() {
    ["flows", "scripts", "snippets", "email", "checklists"].forEach(function (m) { try { if (SDT[m] && SDT[m].render) SDT[m].render(); } catch (e) {} });
    try { if (SDT.ticket) SDT.ticket.render(); } catch (e) {}
  }

  /* ---- Export ---- */
  function openExport() {
    if (SDT.modal.isOpen()) return;
    var body = el("div", "kb-form"), boxes = {};
    body.appendChild(el("p", "empty small", "Choose what to put in the file. Tickets, notes and settings are never included."));
    PARTS.forEach(function (p) {
      var n = listOf(p.key).length, lab = el("label", "check"), cb = el("input"); cb.type = "checkbox"; cb.checked = n > 0; cb.disabled = n === 0; boxes[p.key] = cb;
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + p.label + " (" + n + ")")); body.appendChild(lab);
    });
    SDT.modal.open({ title: "Export a share pack", body: body, size: "sm", actions: [
      { label: "Export", kind: "primary", onClick: function () {
          var parts = {}, total = 0;
          PARTS.forEach(function (p) { if (boxes[p.key].checked) { parts[p.key] = listOf(p.key); total += parts[p.key].length; } });
          if (!total) { toast("Choose something to export"); return false; }
          var text = JSON.stringify({ app: "ServiceDeskToolkit", kind: "pack", version: 1, exportedAt: new Date().toISOString(), parts: parts }, null, 2);
          SDT.secrets.check([text], "this share pack", "Export anyway").then(function (ok) {
            if (!ok) return; SDT.app.download("share-pack-" + today() + ".json", text, "application/json"); toast("Share pack exported (" + total + " items)");
          });
        } }, { label: "Cancel", kind: "ghost", cancel: true }] });
  }

  /* ---- Import with preview ---- */
  function classify(key, incoming) {
    var local = listOf(key), r = { add: [], change: [], same: 0 };
    incoming.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var m = local.filter(function (x) { return (it.id && x.id === it.id) || (ident(it) && ident(x) === ident(it)); })[0];
      if (!m) r.add.push(it); else if (sig(m) !== sig(it)) r.change.push({ local: m, incoming: it }); else r.same++;
    });
    return r;
  }
  function applyPart(key, r, mode) {
    var all = listOf(key).slice(), added = 0, changed = 0;
    if (mode === "skip") return { added: 0, changed: 0 };
    r.add.forEach(function (it) { var c = Object.assign({}, it); if (c.id && all.some(function (x) { return x.id === c.id; })) c.id = uid(); all.push(c); added++; });
    if (mode === "update") r.change.forEach(function (c) {
      all = all.map(function (x) {
        if (x !== c.local) return x;
        var n = Object.assign({}, c.incoming, { id: x.id }); if (x.favorite) n.favorite = true; if (x.usedAt) n.usedAt = x.usedAt; return n;
      }); changed++;
    });
    store.set(key, all); return { added: added, changed: changed };
  }
  function importPack(text) {
    var obj; try { obj = JSON.parse(text); } catch (e) { toast("That is not a valid share pack"); return; }
    if (!obj || obj.kind !== "pack" || !obj.parts || typeof obj.parts !== "object") { toast("That file is not a share pack"); return; }
    var rows = [], found = SDT.secrets.scan(text);
    PARTS.forEach(function (p) {
      var inc = obj.parts[p.key]; if (!Array.isArray(inc) || !inc.length) return;
      rows.push({ part: p, inc: inc, res: p.key === "kb" ? null : classify(p.key, inc) });
    });
    if (!rows.length) { toast("The pack is empty"); return; }
    var body = el("div", "kb-form sp-preview"), selects = {};
    body.appendChild(el("p", "empty small", "Nothing has been added yet. Choose what to do with each part."));
    if (found.length) body.appendChild(el("p", "warn", "This pack may contain a secret (" + found.length + " possible match" + (found.length === 1 ? "" : "es") + "). Check it before adding."));
    rows.forEach(function (r) {
      var row = el("div", "sp-row"), info = el("div", "sp-info");
      info.appendChild(el("strong", "", r.part.label));
      info.appendChild(el("div", "result-meta", r.res ? r.res.add.length + " new | " + r.res.change.length + " changed | " + r.res.same + " already the same" : r.inc.length + " articles - you will see a detailed preview next"));
      var sel = el("select"); sel.setAttribute("aria-label", "What to do with " + r.part.label);
      var opts = r.part.key === "kb" ? [["review", "Review and add"], ["skip", "Skip"]] : [["add", "Add new only"], ["update", "Add new and update changed"], ["skip", "Skip"]];
      opts.forEach(function (o) { var x = el("option", "", o[1]); x.value = o[0]; sel.appendChild(x); });
      selects[r.part.key] = sel; row.appendChild(info); row.appendChild(sel); body.appendChild(row);
    });
    SDT.modal.open({ title: "Import a share pack", body: body, size: "md", actions: [
      { label: "Import", kind: "primary", onClick: function () {
          var added = 0, changed = 0, kbItems = null;
          rows.forEach(function (r) {
            var mode = selects[r.part.key].value;
            if (r.part.key === "kb") { if (mode === "review") kbItems = r.inc; return; }
            var o = applyPart(r.part.key, r.res, mode); added += o.added; changed += o.changed;
          });
          refreshAll(); toast("Imported: " + added + " added, " + changed + " updated");
          if (kbItems && SDT.kb && SDT.kb.importFile) setTimeout(function () { SDT.kb.importFile(new File([JSON.stringify({ app: "service-desk-toolkit", type: "kb", articles: kbItems })], "pack-kb.json", { type: "application/json" })); }, 200);
        } }, { label: "Cancel", kind: "ghost", cancel: true }] });
  }
  function readFile(file, cb) {
    if (!file) return; if (file.size > 20000000) { toast("That file is too large"); return; }
    var r = new FileReader(); r.onload = function () { cb(String(r.result).replace(/^\uFEFF/, ""), file.name); }; r.onerror = function () { toast("Could not read that file"); }; r.readAsText(file);
  }

  /* ---- Backup check: reads the file the same way a restore would, but changes nothing ---- */
  function verify(text, name) {
    var rows = [], obj, cur = store.exportAll();
    function add(level, msg) { rows.push([level, msg]); }
    try { obj = JSON.parse(text); add("ok", "The file can be read."); } catch (e) { add("bad", "The file cannot be read (it is not valid JSON). A restore would fail."); return showVerify(name, rows); }
    if (!obj || obj.app !== cur.app) add("bad", "This does not look like a Service Desk Toolkit backup.");
    else add("ok", "It is a Service Desk Toolkit backup.");
    if (!obj || !obj.data || typeof obj.data !== "object") { add("bad", "The backup has no data section."); return showVerify(name, rows); }
    if (obj.exportedAt) {
      var days = Math.floor((Date.now() - new Date(obj.exportedAt).getTime()) / 86400000);
      add(days > 7 ? "warn" : "ok", "Made " + (days <= 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " ago") + " (" + new Date(obj.exportedAt).toLocaleString() + ").");
    }
    if (obj.dataVersion && cur.dataVersion && obj.dataVersion > cur.dataVersion) add("warn", "The backup comes from a newer version of the app.");
    [["tickets", "Saved tickets"], ["kb", "Knowledge Base articles"], ["scripts", "Scripts and commands"], ["flows", "Question flows"], ["snippets", "Canned responses"], ["emailTemplates", "Email templates"], ["checklists", "Checklists"]].forEach(function (k) {
      var b = Array.isArray(obj.data[k[0]]) ? obj.data[k[0]].length : 0, c = Array.isArray(cur.data[k[0]]) ? cur.data[k[0]].length : 0;
      if (!b && !c) return;
      add(b < c ? "warn" : "ok", k[1] + ": " + b + " in the backup, " + c + " in the app now" + (b < c ? " (a restore would lose " + (c - b) + ")" : "") + ".");
    });
    var size = JSON.stringify(obj.data).length;
    add(size > 4500000 ? "warn" : "ok", "Size: about " + (size / 1000000).toFixed(2) + " million characters" + (size > 4500000 ? " - close to the browser limit, so a restore may not fit." : "."));
    showVerify(name, rows);
  }
  function showVerify(name, rows) {
    var bad = rows.some(function (r) { return r[0] === "bad"; }), warn = rows.some(function (r) { return r[0] === "warn"; });
    var body = el("div", "sp-verify");
    body.appendChild(el("p", bad ? "warn" : "empty", bad ? "This backup has a problem. Do not rely on it." : warn ? "This backup can be read, but check the points marked Check." : "This backup looks good. Nothing was changed."));
    var ul = el("ul", "list");
    rows.forEach(function (r) { var li = el("li", "sp-vrow sp-" + r[0]); li.appendChild(el("strong", "", r[0] === "ok" ? "OK" : r[0] === "warn" ? "Check" : "Problem")); li.appendChild(el("span", "", r[1])); ul.appendChild(li); });
    body.appendChild(ul);
    SDT.modal.open({ title: "Backup check: " + name, body: body, size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }
  function verifyLatest() {
    if (!SDT.backup || !SDT.backup.latest) { toast("Folder backup is not available in this browser"); return; }
    SDT.backup.latest().then(function (r) { return r.file.text().then(function (t) { verify(t, r.name); }); })
      .catch(function (e) { toast(e && e.message ? e.message : "Could not read the backup folder. Try Reconnect folder first."); });
  }

  function init() {
    var map = [["sp-export", openExport], ["sp-import", function () { $("sp-file").click(); }], ["bk-verify-file", function () { $("bk-verify-input").click(); }], ["bk-verify-latest", verifyLatest]];
    map.forEach(function (m) { var b = $(m[0]); if (b) b.addEventListener("click", m[1]); });
    if ($("sp-file")) $("sp-file").addEventListener("change", function (e) { readFile(e.target.files[0], importPack); e.target.value = ""; });
    if ($("bk-verify-input")) $("bk-verify-input").addEventListener("change", function (e) { readFile(e.target.files[0], verify); e.target.value = ""; });
  }
  SDT.sharepack = { init: init, openExport: openExport, verify: verify, classify: classify, importPack: importPack };
})(window);
