/* ticket-history.js - saved tickets: search, view, copy again, reopen, delete (with undo), export CSV. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var state = { query: "", selectedId: null, from: "", to: "", outcome: "", ki: "" };
  var pager = null;

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function all() { var t = store.cached("tickets", []); return Array.isArray(t) ? t : []; }
  function kisOf(t) { return t.kis || (t.ki ? [t.ki] : []); }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function haystack(t) {
    return [t.shortDescription, t.userId, t.userName, t.hostname, t.ticketText, t.workNotes, t.outcome, fmt(t.createdAt),
            kisOf(t).map(function (k) { return k.id + " " + k.title; }).join(" ")].join(" ").toLowerCase();
  }
  function filtered() {
    var terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    var from = state.from ? new Date(state.from + "T00:00:00").getTime() : 0;
    var to = state.to ? new Date(state.to + "T23:59:59").getTime() : Infinity;
    return all().filter(function (t) {
      var when = new Date(t.createdAt).getTime();
      if (when < from || when > to) return false;
      if (state.outcome && (state.outcome === "__none" ? !!t.outcome : t.outcome !== state.outcome)) return false;
      if (state.ki && !kisOf(t).some(function (k) { return k.id === state.ki; })) return false;
      var h = haystack(t);
      return terms.every(function (x) { return h.indexOf(x) > -1; });
    });
  }
  function filterKey() { return [state.query, state.from, state.to, state.outcome, state.ki].join("|"); }
  function fillFilterLists() {
    var oc = {}, kis = {};
    all().forEach(function (t) { if (t.outcome) oc[t.outcome] = 1; kisOf(t).forEach(function (k) { kis[k.id] = k.title; }); });
    var so = $("hist-outcome"), sk = $("hist-ki"), vo = state.outcome, vk = state.ki;
    so.innerHTML = ""; sk.innerHTML = "";
    function opt(sel, v, text) { var o = el("option", "", text); o.value = v; sel.appendChild(o); }
    opt(so, "", "Any outcome"); Object.keys(oc).sort().forEach(function (o) { opt(so, o, o); }); opt(so, "__none", "No outcome");
    opt(sk, "", "Any KI"); Object.keys(kis).sort().forEach(function (id) { opt(sk, id, id + " - " + kis[id]); });
    so.value = vo; sk.value = vk; state.outcome = so.value; state.ki = sk.value;
  }

  function renderList(items) {
    var ul = $("hist-list");
    ul.innerHTML = "";
    if (!items.length) {
      ul.appendChild(el("li", "empty", all().length ? "No tickets match your filter." : "No saved tickets yet. Use Save ticket in the Ticket Generator."));
      return;
    }
    pager = pager || SDT.pager.create({ onChange: render });
    pager.slice(items, filterKey()).forEach(function (t) {
      var li = el("li", "result" + (t.id === state.selectedId ? " selected" : ""));
      var main = el("button", "result-main"); main.type = "button";
      main.addEventListener("click", function () { state.selectedId = t.id; render(); });
      var title = el("div", "result-title");
      title.appendChild(el("span", "", t.shortDescription || "(untitled ticket)"));
      main.appendChild(title);
      var who = [t.userId, t.userName].filter(Boolean).join(" - ");
      main.appendChild(el("div", "result-meta", [fmt(t.createdAt), who].filter(Boolean).join(" | ")));
      var k = kisOf(t).map(function (x) { return x.id; }).join(", ");
      var extra = [k ? "KI: " + k : "", t.outcome || ""].filter(Boolean).join(" | ");
      if (extra) main.appendChild(el("div", "result-meta", extra));
      li.appendChild(main);
      ul.appendChild(li);
    });
    pager.mount(ul);
  }

  function renderDetail() {
    var box = $("hist-detail");
    box.innerHTML = "";
    var t = all().filter(function (x) { return x.id === state.selectedId; })[0];
    var lay = $("hist-layout"); if (lay) lay.classList.toggle("is-empty", !t);
    if (!t) { box.appendChild(el("p", "empty", "Select a ticket to see its details.")); return; }

    var dh = el("div", "detail-head");
    dh.appendChild(el("h2", "", t.shortDescription || "(untitled ticket)"));
    var closeBtn = el("button", "icon-close", "\u00D7"); closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close ticket details"); closeBtn.title = "Close (Esc)";
    closeBtn.addEventListener("click", closeDetail);
    dh.appendChild(closeBtn); box.appendChild(dh);
    var meta = "Saved " + fmt(t.createdAt) + (t.updatedAt && t.updatedAt !== t.createdAt ? " | updated " + fmt(t.updatedAt) : "");
    box.appendChild(el("p", "result-meta", meta));
    var facts = [t.outcome ? "Outcome: " + t.outcome : "", t.minutes ? "Time spent: " + t.minutes + " min" : "",
                 t.followUp ? "Follow-up: " + fmt(t.followUp) + (t.followUpDone ? " (done)" : "") : ""].filter(Boolean).join(" | ");
    if (facts) box.appendChild(el("p", "result-meta", facts));

    box.appendChild(el("h3", "", "Ticket details"));
    box.appendChild(el("pre", "output compact", t.ticketText || ""));
    box.appendChild(el("h3", "", "Work notes"));
    box.appendChild(el("pre", "output compact", t.workNotes || "(no steps were checked)"));

    var row = el("div", "btn-row");
    var b1 = el("button", "btn btn-sm", "Copy ticket details"); b1.type = "button";
    b1.addEventListener("click", function () { SDT.app.copy(t.ticketText, "Ticket details copied"); });
    var b2 = el("button", "btn btn-sm", "Copy work notes"); b2.type = "button";
    b2.addEventListener("click", function () { SDT.app.copy(t.workNotes, "Work notes copied"); });
    var re = el("button", "btn btn-ghost btn-sm", "Reopen in generator"); re.type = "button";
    re.addEventListener("click", function () { if (SDT.ticket.openSaved(t)) global.location.hash = "#ticket"; });
    var del = el("button", "btn btn-danger btn-sm", "Delete"); del.type = "button";
    del.addEventListener("click", function () {
      SDT.modal.confirm({ title: "Delete this ticket?", message: (t.shortDescription || "(untitled ticket)") + "\n\nYou can undo right after, but not later.", confirmLabel: "Delete ticket", danger: true })
        .then(function (ok) {
          if (!ok) return;
          var snap = all();
          store.set("tickets", snap.filter(function (x) { return x.id !== t.id; }));
          state.selectedId = null; render();
          if (SDT.app) { SDT.app.renderDashboard(); SDT.app.checkFollowUps(false); }
          SDT.app.toast("Ticket deleted", function () { store.set("tickets", snap); render(); SDT.app.renderDashboard(); SDT.app.checkFollowUps(false); });
        });
    });
    var kiBtn = el("button", "btn btn-ghost btn-sm", "Create KI from this ticket"); kiBtn.type = "button";
    kiBtn.title = "Start a new Knowledge Base article from the steps you completed";
    kiBtn.addEventListener("click", function () { SDT.kb.openEditor({ mode: "new", draft: SDT.ticket.kiDraft(t.snapshot, t) }); });
    [b1, b2, re, kiBtn, del].forEach(function (b) { row.appendChild(b); });
    box.appendChild(row);
  }

  /* ---- CSV export (opens in Excel; UTF-8 with BOM) ---- */
  function cell(v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csvText(items) {
    var head = ["Saved", "User ID", "User Name", "Hostname", "Time Zone", "Short Description", "KI Used", "Outcome", "Minutes", "Follow-up", "Work notes"];
    var rows = items.map(function (t) {
      return [t.createdAt, t.userId, t.userName, t.hostname, t.timeZone, t.shortDescription,
              kisOf(t).map(function (k) { return k.id + " - " + k.title; }).join("; "), t.outcome, t.minutes, t.followUp, t.workNotes];
    });
    return "\ufeff" + [head].concat(rows).map(function (r) { return r.map(cell).join(","); }).join("\r\n");
  }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function exportCsv() {
    var items = filtered();
    if (!items.length) { SDT.app.toast("No tickets to export"); return; }
    SDT.app.download("ticket-history-" + stamp() + ".csv", csvText(items), "text/csv;charset=utf-8");
    SDT.app.toast("Exported " + items.length + " ticket" + (items.length === 1 ? "" : "s"));
  }
  /* Called when the history is full: the oldest tickets are saved to a CSV file before they are removed. */
  /* The history keeps the newest tickets. Old ones are only removed after you confirm that a CSV copy was saved. */
  var snoozed = false;
  function cap() { return store.mode && store.mode() === "idb" ? 5000 : 500; }
  function offerArchive() {
    var all = store.get("tickets", []); if (!Array.isArray(all)) return;
    var over = all.slice(cap()); if (!over.length || snoozed || SDT.modal.isOpen()) return;
    SDT.modal.confirm({ title: "Ticket history is full", confirmLabel: "Save a CSV file", cancelLabel: "Not now",
      message: "You have " + all.length + " saved tickets and the limit is " + cap() + ". To make room, the oldest " + over.length + " can be saved to a CSV file and then removed.\n\nNothing is removed until you confirm that the file was saved." }).then(function (ok) {
      if (!ok) { snoozed = true; return; }
      SDT.app.download("ticket-history-archived-" + stamp() + ".csv", csvText(over), "text/csv;charset=utf-8");
      SDT.modal.confirm({ title: "Was the file saved?", danger: true, confirmLabel: "Yes, remove them", cancelLabel: "No, keep them",
        message: "Only remove the " + over.length + " oldest tickets if the CSV file downloaded and opens correctly. If your browser blocked the download, choose No, keep them." }).then(function (ok2) {
        if (!ok2) { snoozed = true; SDT.app.toast("All tickets were kept. You can export a CSV from Ticket History at any time."); return; }
        var gone = {}; over.forEach(function (o) { gone[o.id] = true; });
        store.set("tickets", (store.get("tickets", []) || []).filter(function (t) { return !gone[t.id]; }));
        render(); if (SDT.app.renderDashboard) SDT.app.renderDashboard();
        SDT.app.toast(over.length + " oldest ticket" + (over.length === 1 ? " was" : "s were") + " removed");
      });
    });
  }

  function render() {
    fillFilterLists();
    var items = filtered();
    $("hist-summary").textContent = all().length
      ? items.length + " of " + all().length + " saved ticket" + (all().length === 1 ? "" : "s")
      : "";
    renderList(items);
    renderDetail();
  }

  function closeDetail() { state.selectedId = null; render(); var f = $("hist-list").querySelector(".result-main"); if (f) f.focus(); }

  function init() {
    var timer;
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !state.selectedId || !$("view-history").classList.contains("active")) return;
      if (SDT.modal.isOpen()) return;
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      closeDetail();
    });
    $("hist-search").addEventListener("input", function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { state.query = v; render(); }, 120);
    });
    $("hist-csv").addEventListener("click", exportCsv);
    [["hist-from", "from"], ["hist-to", "to"], ["hist-outcome", "outcome"], ["hist-ki", "ki"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function (e) { state[x[1]] = e.target.value; render(); });
    });
    $("hist-clear").addEventListener("click", function () {
      state.from = state.to = state.outcome = state.ki = ""; $("hist-from").value = ""; $("hist-to").value = ""; render();
    });
  }

  SDT.history = { init: init, render: render, cap: cap, offerArchive: offerArchive };
})(window);
