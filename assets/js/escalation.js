/* escalation.js - builds a ready-to-paste escalation note for the next team from the open ticket:
   user and machine, impact, urgency, error message, what the user already tried, the steps you completed
   and what you need from them. The note is editable. Your answers are kept with the ticket. */
(function (global) {
  "use strict";
  var SDT = global.SDT, M = SDT.modal;
  var IMPACT = ["Single user", "Several users", "Whole department or site", "Business-critical service"];
  var URGENCY = ["Low", "Medium", "High", "Critical"];

  var el = window.SDT.dom.el;
  function s(x) { return String(x == null ? "" : x).trim(); }

  function doneSteps(t) {
    var groups = [];
    (t.kis || []).forEach(function (k) {
      var d = (k.steps || []).filter(function (x) { return x.done; }).map(function (x) { return SDT.cmd.strip(x.text); });
      if (d.length) groups.push({ name: k.id + " - " + k.title, steps: d });
    });
    var c = (t.custom || []).filter(function (x) { return x.done; }).map(function (x) { return SDT.cmd.strip(x.text); });
    if (c.length) groups.push({ name: "Additional steps", steps: c });
    return groups;
  }

  function build(t, f) {
    var out = ["Escalation note"];
    function line(label, v) { if (s(v)) out.push(label + ": " + s(v)); }
    line("Escalated to", f.to);
    var who = s(t.userName) + (s(t.userId) ? (s(t.userName) ? " (" + s(t.userId) + ")" : s(t.userId)) : "");
    line("User", who);
    line("Machine Hostname", t.host);
    line("Time Zone", t.tz);
    line("Issue", t.shortDesc);
    line("Impact", f.impact);
    line("Urgency", f.urgency);
    line("Error message", f.error);
    line("Already tried by the user", f.tried);
    if (f.steps) {
      var groups = doneSteps(t);
      if (groups.length) {
        out.push("", "Steps performed by the Service Desk:");
        groups.forEach(function (g) {
          if (groups.length > 1) out.push(g.name);
          g.steps.forEach(function (x, i) { out.push((i + 1) + ". " + x); });
        });
      }
    }
    if (s(f.request)) out.push("", "Request: " + s(f.request));
    var me = s(SDT.settings.values().analystName);
    if (me) out.push("", "Escalated by: " + me);
    return out.join("\n");
  }

  var AI_PROMPT = "Rewrite the following IT Service Desk escalation note so it is clear, concise and professional for the next support team. " +
    "Keep every fact exactly as written. Do not add technical details, causes, error messages or troubleshooting steps. " +
    "Keep the same headings and plain text format. Reply with only the rewritten note.";

  function open() {
    if (M.isOpen()) return;
    var t = SDT.ticket.current();
    var f = Object.assign({ to: "", impact: IMPACT[0], urgency: URGENCY[1], error: "", tried: "", request: "", steps: true }, t.escalation || {});

    var wrap = el("div", "em-compose");
    var left = el("div", "em-fields"), right = el("div", "em-side");
    function field(labelText, control) { var d = el("div", ""); var l = el("label", "", labelText); l.htmlFor = control.id; d.appendChild(l); d.appendChild(control); return d; }
    function input(id, v) { var i = el("input", ""); i.type = "text"; i.id = id; i.value = v || ""; i.autocomplete = "off"; return i; }
    function select(id, opts, v) { var x = el("select", ""); x.id = id; opts.forEach(function (o) { var op = el("option", "", o); op.value = o; x.appendChild(op); }); x.value = v; return x; }
    function area(id, v, rows) { var a = el("textarea", ""); a.id = id; a.rows = rows; a.value = v || ""; return a; }

    var to = input("esc-to", f.to), impact = select("esc-impact", IMPACT, f.impact), urgency = select("esc-urgency", URGENCY, f.urgency);
    var error = input("esc-error", f.error), tried = area("esc-tried", f.tried, 3), request = area("esc-request", f.request, 3);
    var stepsCb = el("input", ""); stepsCb.type = "checkbox"; stepsCb.id = "esc-steps"; stepsCb.checked = !!f.steps;
    var stepsLab = el("label", "check"); stepsLab.appendChild(stepsCb); stepsLab.appendChild(document.createTextNode(" Include the steps I completed"));

    left.appendChild(field("Escalate to (optional)", to));
    var two = el("div", "two"); two.appendChild(field("Impact", impact)); two.appendChild(field("Urgency", urgency));
    left.appendChild(two);
    left.appendChild(field("Error message (as shown)", error));
    left.appendChild(field("What the user already tried", tried));
    left.appendChild(field("What you need from the next team", request));
    left.appendChild(stepsLab);

    right.appendChild(el("h3", "em-sub", "Note (you can edit it)"));
    var note = el("textarea", "esc-note"); note.id = "esc-note"; note.rows = 18; note.setAttribute("aria-label", "Escalation note");
    var hint = el("p", "empty small", "Changing a field on the left rebuilds the note, unless you edited the note by hand. Use Rebuild to go back to the generated text.");
    right.appendChild(note); right.appendChild(hint);
    wrap.appendChild(left); wrap.appendChild(right);

    var edited = false;
    function values() { return { to: to.value, impact: impact.value, urgency: urgency.value, error: error.value, tried: tried.value, request: request.value, steps: stepsCb.checked }; }
    function refresh(force) {
      var v = values();
      t.escalation = v; if (SDT.ticket.persist) SDT.ticket.persist();
      if (force) edited = false;
      if (!edited) note.value = build(t, v);
    }
    [to, impact, urgency, error, tried, request, stepsCb].forEach(function (c) { c.addEventListener(c.type === "checkbox" || c.tagName === "SELECT" ? "change" : "input", function () { refresh(false); }); });
    note.addEventListener("input", function () { edited = true; });
    refresh(true);

    M.open({
      title: "Escalation note", body: wrap, size: "lg", initialFocus: error,
      actions: [
        { label: "Copy note", kind: "primary", onClick: function () { SDT.app.copy(note.value.trim(), "Escalation note copied"); return false; } },
        { label: "Copy AI prompt", kind: "ghost", onClick: function () { SDT.app.copy(AI_PROMPT + "\n\n" + note.value.trim(), "Prompt copied - paste the AI's reply over the note"); return false; } },
        { label: "Rebuild", kind: "ghost", onClick: function () { refresh(true); return false; } },
        { label: "Close", kind: "ghost", cancel: true }
      ]
    });
  }

  SDT.escalation = { open: open, build: build };
})(window);
