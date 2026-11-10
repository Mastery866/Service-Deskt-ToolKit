/* handoff.js - shift handoff summary: the tickets you handled, follow-ups still pending and tickets still open,
   as one block of text you can copy into an email or a chat message. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage, M = SDT.modal;
  var PERIODS = [["today", "Today"], ["12", "Last 12 hours"], ["24", "Last 24 hours"]];

  var el = window.SDT.dom.el;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function dm(d) { return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + hm(d); }
  function startOf(period) {
    var now = new Date();
    if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(now.getTime() - parseInt(period, 10) * 3600000);
  }
  function who(t) {
    var a = String(t.userId || "").trim(), b = String(t.userName || "").trim();
    return [a, b].filter(Boolean).join(" ") || "(no user)";
  }

  function build(period) {
    var from = startOf(period), now = new Date();
    var all = store.get("tickets", []); if (!Array.isArray(all)) all = [];
    var mine = all.filter(function (t) { return new Date(t.createdAt) >= from; })
      .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var label = PERIODS.filter(function (p) { return p[0] === period; })[0][1];
    var out = ["Shift handoff - " + now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " (" + label.toLowerCase() + ")"];
    var me = String(SDT.settings.values().analystName || "").trim();
    if (me) out.push("Analyst: " + me);

    var counts = {};
    mine.forEach(function (t) { var k = t.outcome || "No outcome"; counts[k] = (counts[k] || 0) + 1; });
    var parts = Object.keys(counts).map(function (k) { return k + " " + counts[k]; });
    out.push("", "Tickets handled: " + mine.length + (parts.length ? " (" + parts.join(", ") + ")" : ""));
    mine.forEach(function (t) {
      out.push("- " + hm(new Date(t.createdAt)) + " | " + who(t) + " | " + (t.shortDescription || "(no description)") +
        " | " + (t.outcome || "No outcome") + (t.minutes ? " | " + t.minutes + " min" : ""));
    });

    var pending = all.filter(function (t) { return t.followUp && !t.followUpDone; })
      .sort(function (a, b) { return new Date(a.followUp) - new Date(b.followUp); });
    out.push("", "Pending follow-ups: " + pending.length);
    pending.forEach(function (t) {
      var d = new Date(t.followUp);
      out.push("- " + (isNaN(d) ? t.followUp : dm(d)) + (d < now ? " (OVERDUE)" : "") + " | " + who(t) + " | " + (t.shortDescription || "(no description)"));
    });

    var tabs = (store.get("ticketTabs", { tabs: [] }) || {}).tabs || [];
    var open = tabs.filter(function (t) { return !t.savedId && (t.userId || t.userName || t.shortDesc || (t.kis && t.kis.length)); });
    out.push("", "Open tickets not saved yet: " + open.length);
    open.forEach(function (t) { out.push("- " + who(t) + " | " + (t.shortDesc || "(no description)")); });
    return out.join("\n");
  }

  function open() {
    if (M.isOpen()) return;
    var body = el("div", "review");
    var row = el("div", "precheck");
    var lab = el("label", "precheck-title", "Period:"); lab.htmlFor = "ho-period";
    var sel = el("select", "inline-select"); sel.id = "ho-period";
    PERIODS.forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; sel.appendChild(o); });
    row.appendChild(lab); row.appendChild(sel);
    var pre = el("pre", "output"); pre.tabIndex = 0; pre.setAttribute("aria-label", "Shift handoff summary");
    body.appendChild(row); body.appendChild(pre);
    function refresh() { pre.textContent = build(sel.value); }
    sel.addEventListener("change", refresh);
    refresh();
    M.open({
      title: "Shift handoff summary", body: body, size: "lg", initialFocus: sel,
      actions: [
        { label: "Copy summary", kind: "primary", onClick: function () { SDT.app.copy(pre.textContent, "Handoff summary copied"); return false; } },
        { label: "Close", kind: "ghost", cancel: true }
      ]
    });
  }

  function init() { var b = document.getElementById("dash-handoff"); if (b) b.addEventListener("click", open); }

  SDT.handoff = { init: init, open: open, build: build };
})(window);
