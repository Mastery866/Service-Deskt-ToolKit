/* checklists.js - checklists for repeating jobs (new laptop, offboarding, software install).
   In the Ticket Generator, pick a checklist and its items are added as steps. Tick them as you go and they
   appear in the work notes. Saved in the browser and included in backups. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var query = "", openCards = {};

  var STARTER = [
    { title: "New laptop setup", description: "Hand-over of a new or re-imaged laptop.", items: [
      "Confirm the user, hostname and asset tag", "Install Windows updates", "Join the domain and place the computer in the right OU", "Install the standard software",
      "Install the VPN client and test the connection", "Add the user's printers", "Confirm disk encryption is on", "Confirm antivirus and backup are running", "Hand over and get the user's confirmation" ] },
    { title: "Employee offboarding", description: "Leaver process after HR has approved it.", items: [
      "Confirm the request and the last working day with HR", "Disable the account on the last day", "Remove the user from groups and distribution lists", "Revoke active sessions and tokens",
      "Convert or forward the mailbox as approved", "Back up the user's files as approved", "Collect the hardware and record the asset tags", "Remove licenses", "Update the ticket and asset records" ] },
    { title: "Software install request", description: "Install approved software on a user's computer.", items: [
      "Confirm the approval and license", "Check the system requirements", "Install the software", "Test that it opens and works for the user", "Record the install in the ticket" ] }
  ];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid() { return window.SDT.dom.uid("cl"); }
  var toast = window.SDT.dom.toast;

  function list() {
    var c = store.get("checklists", null);
    if (!Array.isArray(c)) { c = STARTER.map(function (s) { return { id: uid(), title: s.title, description: s.description, items: s.items.slice() }; }); store.set("checklists", c); }
    return c;
  }
  function save(a) { store.set("checklists", a); }

  function openEditor(id) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? list().filter(function (x) { return x.id === id; })[0] : null, src = cur || { title: "", description: "", items: [] };
    var body = el("div", "kb-form");
    function field(label, ctl, idv, hint) { var d = el("div"), l = el("label", "", label); l.htmlFor = idv; ctl.id = idv; d.appendChild(l); d.appendChild(ctl); if (hint) d.appendChild(el("p", "empty small", hint)); return d; }
    var title = el("input"); title.type = "text"; title.value = src.title; title.autocomplete = "off";
    var desc = el("input"); desc.type = "text"; desc.value = src.description || ""; desc.autocomplete = "off";
    var items = el("textarea"); items.rows = 12; items.value = src.items.join("\n");
    var err = el("p", "form-error"); err.hidden = true;
    body.appendChild(field("Title", title, "cl-title")); body.appendChild(field("Short description (optional)", desc, "cl-desc"));
    body.appendChild(field("Items (one per line)", items, "cl-items", "Each line becomes a step you can tick in the ticket.")); body.appendChild(err);
    var secState = { ok: false };
    function snap() { return [title.value, desc.value, items.value].join("\u0000"); }
    var initial = snap();
    SDT.modal.open({ title: cur ? "Edit checklist" : "New checklist", body: body, size: "md", initialFocus: title, isDirty: function () { return snap() !== initial; },
      actions: [{ label: "Save", kind: "primary", onClick: function (h) {
          var lines = items.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
          if (!title.value.trim() || !lines.length) { err.textContent = "Enter a title and at least one item."; err.hidden = false; return false; }
          if (SDT.secrets && !SDT.secrets.gate(secState, [title.value, desc.value, items.value], "this checklist", h)) return false;
          var rec = { id: cur ? cur.id : uid(), title: title.value.trim(), description: desc.value.trim(), items: lines };
          var all = list(); all = cur ? all.map(function (x) { return x.id === cur.id ? rec : x; }) : all.concat([rec]);
          save(all); openCards[rec.id] = true; render(); if (SDT.ticket) SDT.ticket.render(); toast("Checklist saved");
        } }, { label: "Cancel", kind: "ghost", cancel: true }] });
  }
  function duplicate(c) { var n = { id: uid(), title: c.title + " (copy)", description: c.description, items: c.items.slice() }; save(list().concat([n])); openCards[n.id] = true; render(); toast("Checklist duplicated"); }
  function remove(c) { var snap = list(); save(snap.filter(function (x) { return x.id !== c.id; })); render(); if (SDT.ticket) SDT.ticket.render(); toast("Checklist deleted", function () { save(snap); render(); if (SDT.ticket) SDT.ticket.render(); }); }

  function render() {
    var box = $("cl-list"); if (!box) return; box.innerHTML = "";
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean), all = list();
    var items = all.filter(function (c) { var h = (c.title + " " + (c.description || "") + " " + c.items.join(" ")).toLowerCase(); return terms.every(function (t) { return h.indexOf(t) > -1; }); });
    $("cl-summary").textContent = items.length + " of " + all.length + " checklist" + (all.length === 1 ? "" : "s");
    if (!items.length) { var e = el("div", "empty-state"); e.appendChild(el("p", "empty", all.length ? "No checklist matches that search." : "No checklists yet. Choose New checklist.")); box.appendChild(e); return; }
    items.sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (c) {
      var d = el("details", "sc-item"); d.open = !!openCards[c.id]; d.addEventListener("toggle", function () { openCards[c.id] = d.open; });
      var sm = el("summary", "sc-sum"); sm.appendChild(el("span", "sc-title", c.title)); sm.appendChild(el("span", "tag", c.items.length + " items")); d.appendChild(sm);
      var inner = el("div", "sc-body"); if (c.description) inner.appendChild(el("p", "sc-desc", c.description));
      var ol = el("ol", "steps"); c.items.forEach(function (t) { ol.appendChild(el("li", "", t)); }); inner.appendChild(ol);
      var row = el("div", "sc-tools");
      function btn(label, kind, fn) { var b = el("button", "btn " + kind + " btn-sm", label); b.type = "button"; b.setAttribute("aria-label", label + " " + c.title); b.addEventListener("click", fn); row.appendChild(b); }
      btn("Edit", "btn-ghost", function () { openEditor(c.id); }); btn("Duplicate", "btn-ghost", function () { duplicate(c); }); btn("Delete", "btn-danger", function () { remove(c); });
      inner.appendChild(row); d.appendChild(inner); box.appendChild(d);
    });
  }
  function init() {
    list();
    var timer;
    $("cl-search").addEventListener("input", function (e) { var v = e.target.value; clearTimeout(timer); timer = setTimeout(function () { query = v; render(); }, 120); });
    $("cl-new").addEventListener("click", function () { openEditor(null); });
  }
  /* Ticket Generator: choose a checklist and add its items as steps */
  function pick() {
    if (SDT.modal.isOpen() || !SDT.ticket) return;
    var all = list(), body = el("div", "kb-form"), h;
    if (!all.length) body.appendChild(el("p", "empty", "No checklists yet. Create one on the Checklists page."));
    all.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (c) {
      var row = el("div", "fl-ki"); row.appendChild(el("span", "fl-ki-name", c.title)); row.appendChild(el("span", "tag", c.items.length + " items"));
      var b = el("button", "btn btn-sm", "Add"); b.type = "button"; b.setAttribute("aria-label", "Add checklist " + c.title);
      b.addEventListener("click", function () { SDT.ticket.addCustom(c.items); toast(c.items.length + " steps added from " + c.title); h.close(); });
      row.appendChild(b); body.appendChild(row);
    });
    h = SDT.modal.open({ title: "Add a checklist", body: body, size: "sm", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }
  SDT.checklists = { init: init, render: render, list: list, openEditor: openEditor, pick: pick };
})(window);
