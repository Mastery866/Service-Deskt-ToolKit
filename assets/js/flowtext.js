/* flowtext.js - write a question flow as plain indented text, and turn a flow back into text.
   Format (indent with spaces or tabs; "#" starts a comment):

     Q: Is this the first time the user is connecting?
       Yes -> R: VPN access is probably not provisioned | KI: KB-010 | search: VPN access | note: Check the group
       No -> Q[last]: When did the user last connect successfully?
         Less than 3 months ago -> R: Check the error message first
         More than 3 months ago -> [cert]
       ? -> R: Ask the user to check and call back          (optional "not sure" path)

     R[cert]: The VPN certificate has probably expired. | KI: KB-020 | flow: Another flow title

   Q: a question   R: a result   [name] points to a step that has a name   KI/search/note/flow add details to a result. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};

  function indentOf(line) { var m = /^[ \t]*/.exec(line)[0]; return m.replace(/\t/g, "  ").length; }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  var HEAD = /^([QR])(?:\[([A-Za-z0-9_-]+)\])?\s*:\s*(.*)$/i;

  /* text -> { nodes, start } or { error }.  flowByTitle(title) returns a flow id for "flow:" details (optional). */
  function fromText(text, flowByTitle) {
    var raw = String(text || "").split(/\r?\n/), lines = [];
    raw.forEach(function (l, i) {
      var t = l.replace(/^\s+/, "");
      if (!t || t.charAt(0) === "#") return;
      lines.push({ no: i + 1, indent: indentOf(l), text: clean(t) });
    });
    if (!lines.length) return { error: "Write at least one question." };
    var nodes = [], names = {}, pending = [], idx = 0, count = 0;

    function err(l, m) { return { error: "Line " + l.no + ": " + m }; }
    function makeNode(l, m) {
      var type = m[1].toUpperCase() === "Q" ? "q" : "r", body = m[3], extras = {};
      if (type === "r") {
        var parts = body.split(/\s+\|\s+/); body = parts.shift();
        for (var i = 0; i < parts.length; i++) {
          var kv = /^(ki|search|note|flow)\s*:\s*(.*)$/i.exec(parts[i]);
          if (!kv) return err(l, "unknown detail \"" + parts[i].slice(0, 20) + "\". Use KI:, search:, note: or flow:.");
          extras[kv[1].toLowerCase()] = kv[2];
        }
      }
      if (!body) return err(l, "this " + (type === "q" ? "question" : "result") + " has no text.");
      var n = { id: "n" + (++count), type: type, text: body, answers: [], kis: [], search: "", note: "" };
      if (extras.ki) n.kis = extras.ki.split(/[,\s]+/).filter(Boolean).map(function (k) { return k.toUpperCase(); });
      if (extras.search) n.search = extras.search;
      if (extras.note) n.note = extras.note;
      if (extras.flow) {
        var fid = flowByTitle ? flowByTitle(extras.flow) : "";
        if (!fid) return err(l, "no flow is called \"" + extras.flow + "\".");
        n.goto = fid;
      }
      if (m[2]) { if (names[m[2]]) return err(l, "the name [" + m[2] + "] is used twice."); names[m[2]] = n; }
      nodes.push(n); return n;
    }
    /* Reads the answer lines that belong to node n (indented deeper than parentIndent). Returns an error or null. */
    function readAnswers(n, parentIndent) {
      while (idx < lines.length && lines[idx].indent > parentIndent) {
        var l = lines[idx], m = /^(.*?)\s*->\s*(.*)$/.exec(l.text);
        if (!m || !m[1]) return err(l, "expected an answer like  Yes -> Q: next question");
        if (n.type === "r") return err(l, "a result cannot have answers.");
        var label = m[1], target = m[2], ans = { label: label, next: "" }, isUnsure = label === "?";
        idx++;
        var ref = /^\[([A-Za-z0-9_-]+)\]$/.exec(target), head = HEAD.exec(target);
        if (ref) pending.push({ l: l, ans: ans, name: ref[1], unsure: isUnsure, node: n });
        else if (head) {
          var child = makeNode(l, head); if (child.error) return child;
          ans.next = child.id;
          var e = readAnswers(child, l.indent); if (e) return e;
        } else return err(l, "after -> write Q: ..., R: ... or a [name].");
        if (isUnsure) { n.unsure = ans.next; } else n.answers.push(ans);
      }
      return null;
    }

    while (idx < lines.length) {
      var l = lines[idx];
      if (l.indent !== lines[0].indent) return err(l, "start each question or result at the same indent as the first line.");
      var m = HEAD.exec(l.text);
      if (!m) return err(l, "start with Q: for a question or R: for a result.");
      idx++;
      var n = makeNode(l, m); if (n.error) return n;
      var e = readAnswers(n, l.indent); if (e) return e;
    }
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i], target = names[p.name];
      if (!target) return err(p.l, "there is no step named [" + p.name + "].");
      if (p.unsure) p.node.unsure = target.id; else p.ans.next = target.id;
    }
    nodes.forEach(function (n) { if (n.type === "q" && !n.answers.length) n.answers = []; });
    return { nodes: nodes, start: nodes[0].id };
  }

  /* flow -> text. flowTitle(id) gives the title of another flow for "flow:" details (optional). */
  function toText(flow, flowTitle) {
    var byId = {}, refs = {}, out = [], done = {}, name = {}, seq = 0;
    flow.nodes.forEach(function (n) { byId[n.id] = n; refs[n.id] = 0; });
    refs[flow.start] = 1;
    flow.nodes.forEach(function (n) {
      (n.answers || []).forEach(function (a) { if (a.next && refs[a.next] !== undefined) refs[a.next]++; });
      if (n.unsure && refs[n.unsure] !== undefined) refs[n.unsure]++;
    });
    flow.nodes.forEach(function (n) { if (refs[n.id] > 1) name[n.id] = (n.type === "q" ? "q" : "r") + (++seq); });
    function pad(d) { return new Array(d + 1).join("  "); }
    function head(n) {
      var s = (n.type === "q" ? "Q" : "R") + (name[n.id] ? "[" + name[n.id] + "]" : "") + ": " + clean(n.text);
      if (n.type === "r") {
        if (n.kis && n.kis.length) s += " | KI: " + n.kis.join(", ");
        if (n.search) s += " | search: " + clean(n.search);
        if (n.note) s += " | note: " + clean(n.note);
        if (n.goto && flowTitle && flowTitle(n.goto)) s += " | flow: " + flowTitle(n.goto);
      }
      return s;
    }
    function target(id, depth, label) {
      var n = byId[id], p = pad(depth);
      if (!n) { out.push(p + label + " -> R: (missing step)"); return; }
      if (done[id]) { out.push(p + label + " -> [" + (name[id] || (name[id] = "x" + (++seq))) + "]"); return; }
      done[id] = true; out.push(p + label + " -> " + head(n));
      children(n, depth + 1);
    }
    function children(n, depth) {
      (n.answers || []).forEach(function (a) { if (a.next) target(a.next, depth, clean(a.label) || "(answer)"); else out.push(pad(depth) + (clean(a.label) || "(answer)") + " -> R: (not connected yet)"); });
      if (n.unsure) target(n.unsure, depth, "?");
    }
    var start = byId[flow.start] || flow.nodes[0];
    if (!start) return "";
    done[start.id] = true; out.push(head(start)); children(start, 1);
    flow.nodes.forEach(function (n) { if (!done[n.id]) { done[n.id] = true; out.push(""); out.push(head(n)); children(n, 1); } });
    return out.join("\n");
  }

  SDT.flowtext = { fromText: fromText, toText: toText };
})(window);
