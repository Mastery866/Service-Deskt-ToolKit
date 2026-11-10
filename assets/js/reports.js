/* reports.js - what your saved tickets say: outcomes, busy hours, how well each KI works, repeat callers,
   KIs that need a review, and a weekly summary you can copy. Everything is worked out on this computer. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var STALE_DAYS = 180;
  var state = { period: "30" };
  var PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All saved tickets"]];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function kisOf(t) { return t.kis || (t.ki ? [t.ki] : []); }
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function isRes(o) { return /resolved/i.test(o || ""); }
  function isEsc(o) { return /escalat/i.test(o || ""); }
  function all() { var t = store.cached("tickets", []); return Array.isArray(t) ? t : []; }
  function within(days) { var cut = Date.now() - days * 86400000; return all().filter(function (t) { return new Date(t.createdAt).getTime() >= cut; }); }
  function items() { return state.period === "all" ? all() : within(parseInt(state.period, 10)); }

  function stats(list) {
    var s = { n: list.length, res: 0, esc: 0, minSum: 0, minN: 0, outcomes: {}, hours: [], kis: {}, users: {} };
    for (var h = 0; h < 24; h++) s.hours.push(0);
    list.forEach(function (t) {
      if (isRes(t.outcome)) s.res++;
      if (isEsc(t.outcome)) s.esc++;
      var m = Number(t.minutes) || 0; if (m > 0) { s.minSum += m; s.minN++; }
      var o = t.outcome || "No outcome"; s.outcomes[o] = (s.outcomes[o] || 0) + 1;
      var d = new Date(t.createdAt); if (!isNaN(d)) s.hours[d.getHours()]++;
      kisOf(t).forEach(function (k) {
        var r = s.kis[k.id] = s.kis[k.id] || { id: k.id, title: k.title, n: 0, res: 0, esc: 0, minSum: 0, minN: 0 };
        r.n++; if (isRes(t.outcome)) r.res++; if (isEsc(t.outcome)) r.esc++;
        if (m > 0) { r.minSum += m; r.minN++; }
      });
      var u = String(t.userId || "").trim().toLowerCase();
      if (u) { var x = s.users[u] = s.users[u] || { id: t.userId, name: t.userName, n: 0, last: "" }; x.n++; if (!x.last || t.createdAt > x.last) x.last = t.createdAt; }
    });
    s.avg = s.minN ? Math.round(s.minSum / s.minN) : 0;
    return s;
  }

  function panel(title) { var p = el("div", "panel rpt-panel"); p.appendChild(el("h2", "", title)); return p; }

  function barRows(container, rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    rows.forEach(function (r) {
      var row = el("div", "rbar");
      row.appendChild(el("span", "rbar-label", r.label));
      var track = el("span", "rbar-track"); var fill = el("span", "rbar-fill"); fill.style.width = Math.round(r.value * 100 / max) + "%"; track.appendChild(fill);
      row.appendChild(track); row.appendChild(el("span", "rbar-val", String(r.value)));
      container.appendChild(row);
    });
  }

  function openKi(id) { global.location.hash = "#kb"; setTimeout(function () { SDT.kb.openArticle(id); }, 60); }

  function kiTable(s) {
    var rows = Object.keys(s.kis).map(function (k) { return s.kis[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 15);
    var p = panel("How well each KI works");
    if (!rows.length) { p.appendChild(el("p", "empty small", "No saved tickets used a KI in this period.")); return p; }
    var wrap = el("div", "table-wrap"); var t = el("table", "rpt-table");
    var head = el("tr"); ["KI", "Used", "Resolved", "Escalated", "Avg min", ""].forEach(function (h) { head.appendChild(el("th", "", h)); });
    t.appendChild(el("thead")).appendChild(head);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      var td = el("td"); var b = el("button", "link-btn", r.id + " - " + r.title); b.type = "button"; b.addEventListener("click", function () { openKi(r.id); }); td.appendChild(b); tr.appendChild(td);
      tr.appendChild(el("td", "num", String(r.n)));
      tr.appendChild(el("td", "num", pct(r.res, r.n) + "%"));
      tr.appendChild(el("td", "num", pct(r.esc, r.n) + "%"));
      var avg = r.minN ? Math.round(r.minSum / r.minN) : 0;
      tr.appendChild(el("td", "num", avg ? String(avg) : "-"));
      var flag = "";
      if (r.n >= 3 && pct(r.esc, r.n) >= 50) flag = "Often escalated - rewrite?";
      else if (r.n >= 3 && pct(r.res, r.n) < 50) flag = "Rarely resolves - review";
      else if (r.n >= 3 && s.avg && avg > s.avg * 1.5) flag = "Slow - review";
      tr.appendChild(el("td", flag ? "rpt-flag" : "", flag));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); p.appendChild(wrap);
    p.appendChild(el("p", "empty small", "Flags need at least 3 uses. Resolved and Escalated are shares of the tickets that used the KI."));
    return p;
  }

  function reviewPanel() {
    var kb = store.get("kb", []); if (!Array.isArray(kb)) kb = [];
    var now = Date.now(), never = 0;
    var list = kb.map(function (a) {
      var age = a.reviewed ? Math.floor((now - new Date(a.reviewed + "T00:00:00").getTime()) / 86400000) : null;
      if (age === null || isNaN(age)) never++;
      return { a: a, age: age };
    }).filter(function (x) { return x.age !== null && !isNaN(x.age) && x.age > STALE_DAYS; })
      .sort(function (x, y) { return y.age - x.age; });
    var p = panel("KIs that need a review (" + list.length + ")");
    if (!list.length) p.appendChild(el("p", "empty small", "No KI has a review date older than " + STALE_DAYS + " days."));
    var ul = el("ul", "list");
    list.slice(0, 10).forEach(function (x) {
      var li = el("li", "follow-item"); var tx = el("span", "follow-text");
      tx.appendChild(el("strong", "", x.a.id + " - " + x.a.title));
      tx.appendChild(el("div", "result-meta", "Last reviewed " + x.age + " days ago"));
      var b = el("button", "btn btn-ghost btn-sm", "Open"); b.type = "button"; b.setAttribute("aria-label", "Open " + x.a.id);
      b.addEventListener("click", function () { openKi(x.a.id); });
      li.appendChild(tx); li.appendChild(b); ul.appendChild(li);
    });
    if (list.length) p.appendChild(ul);
    if (list.length > 10) p.appendChild(el("p", "empty small", (list.length - 10) + " more not shown."));
    if (never) p.appendChild(el("p", "empty small", never + " KI" + (never === 1 ? " has" : "s have") + " no review date yet. Use More > Mark as reviewed today on an article once you have checked it."));
    return p;
  }

  function weeklyText() {
    var list = within(7), s = stats(list), now = new Date(), from = new Date(now.getTime() - 6 * 86400000);
    function d(x) { return x.toLocaleDateString([], { month: "short", day: "numeric" }); }
    var out = ["Weekly summary: " + d(from) + " - " + d(now)];
    var me = String(SDT.settings.values().analystName || "").trim(); if (me) out.push("Analyst: " + me);
    out.push("", "Tickets handled: " + s.n);
    Object.keys(s.outcomes).sort(function (a, b) { return s.outcomes[b] - s.outcomes[a]; }).forEach(function (o) { out.push("- " + o + ": " + s.outcomes[o]); });
    if (s.avg) out.push("", "Average time per ticket: " + s.avg + " min");
    var top = Object.keys(s.kis).map(function (k) { return s.kis[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    if (top.length) { out.push("", "Most used KIs:"); top.forEach(function (r) { out.push("- " + r.id + " " + r.title + ": " + r.n + " (" + pct(r.res, r.n) + "% resolved)"); }); }
    var rep = Object.keys(s.users).map(function (k) { return s.users[k]; }).filter(function (u) { return u.n >= 2; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    if (rep.length) { out.push("", "Repeat callers:"); rep.forEach(function (u) { out.push("- " + u.id + (u.name ? " " + u.name : "") + ": " + u.n + " tickets"); }); }
    var pend = all().filter(function (t) { return t.followUp && !t.followUpDone; }).length;
    out.push("", "Follow-ups still pending: " + pend);
    return out.join("\n");
  }

  function render() {
    var body = $("rp-body"); if (!body) return;
    body.innerHTML = "";
    var list = items(), s = stats(list);
    if (!all().length) { body.appendChild(el("p", "empty", "No saved tickets yet. Reports appear after you save tickets in the Ticket Generator.")); body.appendChild(reviewPanel()); return; }

    var cards = el("div", "stat-row");
    [["Tickets", s.n], ["Avg minutes", s.avg || "-"], ["Resolved", pct(s.res, s.n) + "%"], ["Escalated", pct(s.esc, s.n) + "%"]].forEach(function (c) {
      var d = el("div", "stat"); d.appendChild(el("strong", "", String(c[1]))); d.appendChild(el("span", "", c[0])); cards.appendChild(d);
    });
    body.appendChild(cards);

    var grid = el("div", "rpt-grid");
    var po = panel("Tickets by outcome");
    var rows = Object.keys(s.outcomes).sort(function (a, b) { return s.outcomes[b] - s.outcomes[a]; }).map(function (o) { return { label: o, value: s.outcomes[o] }; });
    if (rows.length) barRows(po, rows); else po.appendChild(el("p", "empty small", "No tickets in this period."));
    grid.appendChild(po);

    var ph = panel("Busy hours");
    if (s.n) {
      var max = Math.max.apply(null, s.hours.concat([1])), chart = el("div", "hours");
      s.hours.forEach(function (v, h) {
        var c = el("div", "hour"); c.title = (h < 10 ? "0" : "") + h + ":00 - " + v + " ticket" + (v === 1 ? "" : "s");
        var bar = el("span", "hour-bar"); bar.style.height = Math.round(v * 100 / max) + "%"; c.appendChild(bar);
        c.appendChild(el("span", "hour-lab", h % 3 === 0 ? String(h) : ""));
        chart.appendChild(c);
      });
      ph.appendChild(chart); ph.appendChild(el("p", "empty small", "Hour of the day (24-hour clock) when tickets were saved."));
    } else ph.appendChild(el("p", "empty small", "No tickets in this period."));
    grid.appendChild(ph);
    body.appendChild(grid);

    body.appendChild(kiTable(s));

    var pr = panel("Repeat callers");
    var rep = Object.keys(s.users).map(function (k) { return s.users[k]; }).filter(function (u) { return u.n >= 2; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    if (!rep.length) pr.appendChild(el("p", "empty small", "Nobody called more than once in this period."));
    else { var ul = el("ul", "list"); rep.forEach(function (u) { var li = el("li", "follow-item"); var tx = el("span", "follow-text"); tx.appendChild(el("strong", "", u.id + (u.name ? " - " + u.name : ""))); tx.appendChild(el("div", "result-meta", u.n + " tickets | last " + new Date(u.last).toLocaleDateString())); li.appendChild(tx); ul.appendChild(li); }); pr.appendChild(ul); }
    body.appendChild(pr);
    body.appendChild(reviewPanel());
    if (SDT.insights) SDT.insights.panels(body, list);
  }

  function init() {
    var sel = $("rp-period"); if (!sel) return;
    PERIODS.forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; sel.appendChild(o); });
    sel.value = state.period;
    sel.addEventListener("change", function () { state.period = sel.value; render(); });
    $("rp-weekly").addEventListener("click", function () { SDT.app.copy(weeklyText(), "Weekly summary copied"); });
  }

  SDT.reports = { init: init, render: render, weeklyText: weeklyText, stats: stats };
})(window);
