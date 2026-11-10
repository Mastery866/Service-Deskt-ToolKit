/* snippets.js - canned responses: reusable messages with one-click copy.
   Placeholders {{userName}} {{userId}} {{hostname}} {{analystName}} are filled from the open ticket. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var state = { query: "" };

  var DEFAULTS = [
    { title: "Verify identity", text: "Hello, before I can continue I need to verify your identity. Could you please confirm your full name, employee ID and your manager's name?" },
    { title: "Ask for hostname", text: "Could you please give me the hostname of your computer? It is usually on a sticker on the device, or under Settings > System > About." },
    { title: "Closing - resolved", text: "Hi {{userName}}, I'm glad we were able to resolve your issue today. If anything changes, please contact the Service Desk again. Have a great day!" },
    { title: "Callback - no answer", text: "Hi {{userName}}, I tried to reach you about your ticket but could not connect. Please contact the Service Desk when you are available and we will continue." },
    { title: "Escalation notice", text: "Hi {{userName}}, I have escalated your issue to the next support team. They will contact you directly. Thank you for your patience." }
  ];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid() { return window.SDT.dom.uid("s"); }
  function list() {
    var s = store.get("snippets", null);
    if (!Array.isArray(s)) {
      s = DEFAULTS.map(function (d) { return { id: uid(), title: d.title, text: d.text }; });
      store.set("snippets", s);
    }
    return s;
  }
  var toast = window.SDT.dom.toast;

  /* Fill placeholders from the ticket that is currently open. */
  function fillText(text) {
    var t = (SDT.ticket && SDT.ticket.current && SDT.ticket.current()) || {};
    var map = { userName: (t.userName || "").trim(), userId: (t.userId || "").trim(), hostname: (t.host || "").trim(),
                analystName: SDT.settings.values().analystName };
    return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return k in map && map[k] ? map[k] : (k === "userName" ? "there" : ""); })
      .replace(/ {2,}/g, " ").replace(/\s+([.,!])/g, "$1");
  }
  function copySnippet(s) { SDT.app.copy(fillText(s.text), "\u201C" + s.title + "\u201D copied"); }

  function openEditor(id) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? list().filter(function (x) { return x.id === id; })[0] : null;
    var body = el("div", "kb-form");
    var l1 = el("label", "", "Title"); l1.htmlFor = "sn-title";
    var title = el("input", ""); title.type = "text"; title.id = "sn-title"; title.value = cur ? cur.title : ""; title.autocomplete = "off";
    var l2 = el("label", "", "Message"); l2.htmlFor = "sn-text";
    var text = el("textarea", ""); text.id = "sn-text"; text.rows = 6; text.value = cur ? cur.text : "";
    var hint = el("p", "empty small", "Placeholders: {{userName}} {{userId}} {{hostname}} {{analystName}} are filled from the open ticket when you copy.");
    var err = el("p", "form-error", ""); err.hidden = true;
    var w1 = el("div", ""); w1.appendChild(l1); w1.appendChild(title);
    var w2 = el("div", ""); w2.appendChild(l2); w2.appendChild(text); w2.appendChild(hint);
    body.appendChild(w1); body.appendChild(w2); body.appendChild(err);
    var initial = title.value + "\u0000" + text.value;
    SDT.modal.open({
      title: cur ? "Edit response" : "New response", body: body, size: "md", initialFocus: title,
      isDirty: function () { return title.value + "\u0000" + text.value !== initial; },
      actions: [
        { label: "Save", kind: "primary", onClick: function () {
          if (!title.value.trim() || !text.value.trim()) { err.textContent = "Enter a title and a message."; err.hidden = false; return false; }
          var all = list();
          if (cur) all = all.map(function (x) { return x.id === cur.id ? { id: cur.id, title: title.value.trim(), text: text.value.trim() } : x; });
          else all.push({ id: uid(), title: title.value.trim(), text: text.value.trim() });
          store.set("snippets", all);
          render(); toast("Response saved");
        } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  function render() {
    var q = state.query.toLowerCase().trim();
    var items = list().filter(function (s) { return !q || (s.title + " " + s.text).toLowerCase().indexOf(q) > -1; });
    var ul = $("sn-list");
    ul.innerHTML = "";
    if (!items.length) { ul.appendChild(el("li", "empty", list().length ? "No responses match." : "No canned responses yet. Choose New response.")); }
    items.forEach(function (s) {
      var li = el("li", "snippet");
      li.appendChild(el("h3", "", s.title));
      li.appendChild(el("p", "snippet-text", s.text));
      var row = el("div", "btn-row");
      var c = el("button", "btn btn-sm", "Copy"); c.type = "button"; c.setAttribute("aria-label", "Copy " + s.title);
      c.addEventListener("click", function () { copySnippet(s); });
      var e = el("button", "btn btn-ghost btn-sm", "Edit"); e.type = "button"; e.setAttribute("aria-label", "Edit " + s.title);
      e.addEventListener("click", function () { openEditor(s.id); });
      var d = el("button", "btn btn-danger btn-sm", "Delete"); d.type = "button"; d.setAttribute("aria-label", "Delete " + s.title);
      d.addEventListener("click", function () {
        var snap = list();
        store.set("snippets", snap.filter(function (x) { return x.id !== s.id; }));
        render();
        toast("Response deleted", function () { store.set("snippets", snap); render(); });
      });
      row.appendChild(c); row.appendChild(e); row.appendChild(d);
      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function init() {
    list(); // seeds the starter responses on first run
    $("sn-new").addEventListener("click", function () { openEditor(null); });
    var timer;
    $("sn-search").addEventListener("input", function (e) {
      var v = e.target.value; clearTimeout(timer);
      timer = setTimeout(function () { state.query = v; render(); }, 120);
    });
  }

  SDT.snippets = { init: init, render: render, list: list, fillText: fillText, copy: copySnippet, openEditor: openEditor };
})(window);
