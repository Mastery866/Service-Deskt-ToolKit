/* insights.js - what to write next (knowledge gaps), how Question Flows perform, and the shift handover note.
   Everything is worked out from your saved tickets. Nothing leaves the browser. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function tickets() { var t = store.cached("tickets", []); return Array.isArray(t) ? t : []; }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function noKi(t) { return !(t.kis && t.kis.length); }

  function group(list, keyFn, textFn) {
    var map = {};
    list.forEach(function (t) {
      var k = keyFn(t); if (!k) return;
      var g = map[k] || (map[k] = { text: textFn(t), n: 0, latest: t });
      g.n++; if (String(t.createdAt) > String(g.latest.createdAt)) g.latest = t;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  }

  /* ---- Knowledge gaps ---- */
  function gaps(list) {
    var open = ["Unable to resolve", "Escalated", "Follow-up required"];
    return {
      unresolved: group(list.filter(function (t) { return noKi(t) && open.indexOf(t.outcome) > -1; }), function (t) { return norm(t.shortDescription); }, function (t) { return t.shortDescription; }),
      resolved: group(list.filter(function (t) { return noKi(t) && t.outcome === "Resolved"; }), function (t) { return norm(t.shortDescription); }, function (t) { return t.shortDescription; }),
      deadEnds: group(list.filter(function (t) { return t.flow && t.flow.noKi; }), function (t) { return t.flow.id + "|" + t.flow.resultId; }, function (t) { return t.flow.title + ": " + t.flow.resultText; })
    };
  }

  /* ---- How each flow is used ---- */
  function flowUse(list) {
    var map = {};
    (list || tickets()).forEach(function (t) {
      if (!t.flow || !t.flow.id) return;
      var u = map[t.flow.id] || (map[t.flow.id] = { title: t.flow.title, n: 0, resolved: 0, escalated: 0, results: {} });
      u.n++; if (t.outcome === "Resolved") u.resolved++; if (t.outcome === "Escalated") u.escalated++;
      var r = t.flow.resultText || "(not finished)"; u.results[r] = (u.results[r] || 0) + 1;
    });
    return map;
  }
  function topResult(u) { var k = Object.keys(u.results).sort(function (a, b) { return u.results[b] - u.results[a]; })[0]; return k || ""; }

  function panel(title, note) { var p = el("div", "panel"); p.appendChild(el("h2", "", title)); if (note) p.appendChild(el("p", "empty small", note)); return p; }
  function section(p, title, rows, empty, btnLabel, onClick) {
    p.appendChild(el("h3", "ins-h3", title));
    if (!rows.length) { p.appendChild(el("p", "empty small", empty)); return; }
    var ul = el("ul", "list");
    rows.forEach(function (g) {
      var li = el("li", "follow-item"), tx = el("span", "follow-text");
      tx.appendChild(el("strong", "", g.text || "(no title)"));
      tx.appendChild(el("div", "result-meta", g.n + " ticket" + (g.n === 1 ? "" : "s")));
      li.appendChild(tx);
      var b = el("button", "btn btn-ghost btn-sm", btnLabel); b.type = "button"; b.setAttribute("aria-label", btnLabel + ": " + g.text);
      b.addEventListener("click", function () { onClick(g); }); li.appendChild(b); ul.appendChild(li);
    });
    p.appendChild(ul);
  }
  function createKi(g) {
    var rec = g.latest, draft = SDT.ticket.kiDraft(rec.snapshot, rec);
    SDT.kb.openEditor({ mode: "new", draft: draft });
  }

  /* Adds the panels to the Reports page. list = tickets in the chosen period. */
  function panels(body, list) {
    var g = gaps(list), any = g.unresolved.length || g.resolved.length || g.deadEnds.length;
    var p = panel("Knowledge gaps", "Where a Knowledge Base article or a question flow would have helped, based on the tickets in this period.");
    if (!any) p.appendChild(el("p", "empty small", "No gaps found in this period."));
    else {
      section(p, "Escalated or unresolved with no KI", g.unresolved, "None.", "Create KI", createKi);
      section(p, "Resolved without a KI (worth writing down)", g.resolved, "None.", "Create KI", createKi);
      section(p, "Question flow results with no KI", g.deadEnds, "None.", "Edit flow", function (x) { SDT.flows.show(x.latest.flow.id); global.location.hash = "#flows"; });
    }
    body.appendChild(p);

    var use = flowUse(list), ids = Object.keys(use);
    var f = panel("Question flows in use", "How often each flow was used on a saved ticket, and how those tickets ended.");
    if (!ids.length) f.appendChild(el("p", "empty small", "No saved ticket used a question flow in this period."));
    else {
      var ul = el("ul", "list");
      ids.sort(function (a, b) { return use[b].n - use[a].n; }).forEach(function (id) {
        var u = use[id], li = el("li", "follow-item"), tx = el("span", "follow-text");
        tx.appendChild(el("strong", "", u.title));
        tx.appendChild(el("div", "result-meta", u.n + " ticket" + (u.n === 1 ? "" : "s") + " | resolved " + pct(u.resolved, u.n) + "% | escalated " + pct(u.escalated, u.n) + "%"));
        tx.appendChild(el("div", "result-meta", "Most common result: " + topResult(u)));
        li.appendChild(tx); ul.appendChild(li);
      });
      f.appendChild(ul);
    }
    body.appendChild(f);
  }

  /* ---- Shift handover ---- */
  var PERIODS = [["today", "Today"], ["12", "Last 12 hours"], ["24", "Last 24 hours"], ["168", "Last 7 days"]];
  function handoverText(period) {
    var now = new Date(), start;
    if (period === "today") { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else start = new Date(now.getTime() - parseInt(period, 10) * 3600000);
    var all = tickets();
    var mine = all.filter(function (t) { return new Date(t.createdAt) >= start; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    var out = [], me = String(SDT.settings.values().analystName || "").trim();
    out.push("Shift handover - " + now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" }) + (me ? " (" + me + ")" : ""));
    out.push("Period: " + (PERIODS.filter(function (p) { return p[0] === period; })[0] || [0, ""])[1].toLowerCase());
    var oc = {}, mins = 0;
    mine.forEach(function (t) { var o = t.outcome || "No outcome set"; oc[o] = (oc[o] || 0) + 1; mins += t.minutes || 0; });
    out.push("", "Tickets handled: " + mine.length + (mins ? " (" + mins + " min logged)" : ""));
    Object.keys(oc).sort(function (a, b) { return oc[b] - oc[a]; }).forEach(function (o) { out.push("- " + o + ": " + oc[o]); });
    if (mine.length) {
      out.push("", "Tickets:");
      mine.forEach(function (t) {
        var who = [t.userId, t.userName].filter(Boolean).join(" ");
        var ki = (t.kis || []).map(function (k) { return k.id; }).join(", ");
        out.push("- " + hm(t.createdAt) + " | " + (who || "unknown user") + " | " + (t.shortDescription || "(untitled)") + " | " + (t.outcome || "no outcome") + (ki ? " | " + ki : ""));
      });
    }
    var due = all.filter(function (t) { return t.followUp && !t.followUpDone; }).sort(function (a, b) { return String(a.followUp).localeCompare(String(b.followUp)); });
    if (due.length) {
      out.push("", "Follow-ups still open:");
      due.forEach(function (t) { out.push("- " + new Date(t.followUp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " | " + [t.userId, t.userName].filter(Boolean).join(" ") + " | " + (t.shortDescription || "(untitled)")); });
    }
    var dueIds = {}; due.forEach(function (t) { dueIds[t.id] = true; });
    var week = new Date(now.getTime() - 14 * 86400000);
    var pend = all.filter(function (t) { return !dueIds[t.id] && !t.followUpDone && ["Pending user response", "Follow-up required"].indexOf(t.outcome) > -1 && new Date(t.createdAt) >= week; });
    if (pend.length) {
      out.push("", "Waiting on the user or needing follow-up:");
      pend.forEach(function (t) { out.push("- " + [t.userId, t.userName].filter(Boolean).join(" ") + " | " + (t.shortDescription || "(untitled)") + " | " + t.outcome); });
    }
    out.push("", "Notes for the next shift:", "- ");
    return out.join("\n");
  }
  function openHandover() {
    if (SDT.modal.isOpen()) return;
    var body = el("div", "kb-form");
    var lab = el("label", "", "Period"); lab.htmlFor = "ho-period";
    var sel = el("select"); sel.id = "ho-period";
    PERIODS.forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; sel.appendChild(o); });
    var ta = el("textarea", "sc-code"); ta.id = "ho-text"; ta.rows = 18; ta.setAttribute("aria-label", "Handover note");
    function fill() { ta.value = handoverText(sel.value); }
    sel.addEventListener("change", fill); fill();
    var d1 = el("div"); d1.appendChild(lab); d1.appendChild(sel);
    body.appendChild(d1); body.appendChild(el("p", "empty small", "Edit the note below, add anything the next person should know, then copy it.")); body.appendChild(ta);
    SDT.modal.open({ title: "Shift handover", body: body, size: "lg", initialFocus: ta,
      actions: [{ label: "Copy handover", kind: "primary", onClick: function () { SDT.app.copy(ta.value, "Handover copied", { skipGuard: true }); return false; } }, { label: "Close", kind: "ghost", cancel: true }] });
  }

  function init() { var b = $("hist-handover"); if (b) b.addEventListener("click", openHandover); }

  SDT.insights = { init: init, gaps: gaps, flowUse: flowUse, panels: panels, openHandover: openHandover, handoverText: handoverText };
})(window);
