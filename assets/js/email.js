/* email.js - email templates: write once, fill from the open ticket, copy it or open it in your mail app.
   Placeholders: {{userName}} {{userId}} {{hostname}} {{analystName}} {{shortDescription}} {{signature}}
   Any other {{name}} you type (for example {{ticketNumber}}) becomes a fill-in field when you use the template.
   The app cannot send mail by itself: it prepares the message, then you copy it or open it in your mail app.
   Emails you copy or open are listed under "Recent emails" so you can find them again. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var PH = /\{\{\s*(\w+)\s*\}\}/g;
  var CHIPS = ["userName", "userId", "hostname", "analystName", "shortDescription", "ticketNumber", "signature"];
  var LOG_MAX = 30;
  var state = { query: "" };
  var memory = {};   // values typed for custom fields, per open ticket, so the next email for it is pre-filled

  var DEFAULTS = [
    { title: "Ticket update - waiting for your reply", to: "", cc: "",
      subject: "{{ticketNumber}} - Update on your request: {{shortDescription}}",
      body: "Hi {{userName}},\n\nThank you for contacting the Service Desk. I am following up on your request ({{ticketNumber}}) regarding: {{shortDescription}}.\n\nTo continue, I need the following from you:\n{{whatWeNeed}}\n\nPlease reply to this email when you can.\n\n{{signature}}" },
    { title: "Request for more information", to: "", cc: "",
      subject: "{{ticketNumber}} - More information needed",
      body: "Hi {{userName}},\n\nTo continue working on {{ticketNumber}} ({{shortDescription}}), could you please send us the following:\n\n{{details}}\n\nA screenshot of any error message is also helpful.\n\n{{signature}}" },
    { title: "No response - follow-up", to: "", cc: "",
      subject: "{{ticketNumber}} - We could not reach you",
      body: "Hi {{userName}},\n\nI tried to reach you about {{ticketNumber}} ({{shortDescription}}) but could not connect. Please reply with a good time to call, or contact the Service Desk when you are available.\n\nIf we do not hear from you by {{closeDate}}, the ticket may be closed.\n\n{{signature}}" },
    { title: "Remote session request", to: "", cc: "",
      subject: "{{ticketNumber}} - Remote session request",
      body: "Hi {{userName}},\n\nTo continue with {{ticketNumber}}, I would like to connect to your computer ({{hostname}}) remotely. Please reply with a time today that works for you.\n\n{{signature}}" },
    { title: "Escalated to another team", to: "", cc: "",
      subject: "{{ticketNumber}} - Your request has been escalated",
      body: "Hi {{userName}},\n\nYour request {{ticketNumber}} ({{shortDescription}}) has been escalated to {{teamName}}. They will contact you directly. Thank you for your patience.\n\n{{signature}}" },
    { title: "Resolved - closing the ticket", to: "", cc: "",
      subject: "{{ticketNumber}} - Resolved: {{shortDescription}}",
      body: "Hi {{userName}},\n\nI'm glad we were able to resolve your issue today. Ticket {{ticketNumber}} will be closed. If the issue comes back, please reply to this email or contact the Service Desk and we will reopen it.\n\n{{signature}}" }
  ];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid() { return window.SDT.dom.uid("e"); }
  var toast = window.SDT.dom.toast;
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function list() {
    var s = store.get("emailTemplates", null);
    if (!Array.isArray(s)) {
      s = DEFAULTS.map(function (d) { return { id: uid(), title: d.title, to: d.to, cc: d.cc, subject: d.subject, body: d.body }; });
      store.set("emailTemplates", s);
    }
    return s;
  }
  function logs() { var l = store.get("emailLog", []); return Array.isArray(l) ? l : []; }

  /* ---- Placeholders ---- */
  function labelOf(name) {
    var s = String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function namesIn(tpl) {   // fill-in fields, in the order they first appear (the signature is automatic)
    var out = [], re = new RegExp(PH.source, "g"), m;
    var text = (tpl.subject || "") + "\n" + (tpl.body || "");
    while ((m = re.exec(text))) { if (m[1] !== "signature" && out.indexOf(m[1]) === -1) out.push(m[1]); }
    return out;
  }
  function signature() {
    var v = SDT.settings.values(), me = (v.analystName || "").trim(), s = (v.emailSignature || "").trim();
    if (!s) return "Regards,\n" + (me || "Service Desk");
    return s.replace(new RegExp(PH.source, "g"), function (m, k) { return k === "analystName" ? me : ""; }).trim();
  }
  function known() {   // values taken from the ticket that is open right now
    var t = (SDT.ticket && SDT.ticket.current && SDT.ticket.current()) || {};
    function s(x) { return String(x || "").trim(); }
    return { userName: s(t.userName), userId: s(t.userId), hostname: s(t.host),
             analystName: s(SDT.settings.values().analystName), shortDescription: s(t.shortDesc) };
  }
  function build(tpl, values) {
    var empty = [];
    function fill(text) {
      return String(text || "").replace(new RegExp(PH.source, "g"), function (m, k) {
        if (k === "signature") return signature();
        var v = String(values[k] == null ? "" : values[k]).trim();
        if (!v) { if (empty.indexOf(k) === -1) empty.push(k); return "[" + labelOf(k) + "]"; }
        return v;
      });
    }
    return { subject: fill(tpl.subject).replace(/\s*\n\s*/g, " "), body: fill(tpl.body), empty: empty };
  }

  /* ---- Log of emails that were copied or opened ---- */
  function logEmail(id, tpl, to, cc, r, who) {
    var all = logs().filter(function (x) { return x.id !== id; });
    all.unshift({ id: id, at: new Date().toISOString(), title: tpl.title, to: to, cc: cc, subject: r.subject, body: r.body, who: who });
    store.set("emailLog", all.slice(0, LOG_MAX));
    renderLog();
  }

  /* ---- mail app hand-off ---- */
  function mailtoUrl(to, cc, subject, body) {
    function addr(s) { return encodeURIComponent(s).replace(/%40/g, "@").replace(/%2C/g, ",").replace(/%3B/g, ";"); }
    var q = [];
    if (cc) q.push("cc=" + addr(cc));
    q.push("subject=" + encodeURIComponent(subject));
    q.push("body=" + encodeURIComponent(body).replace(/%0A/g, "%0D%0A"));
    return "mailto:" + addr(to || "") + "?" + q.join("&");
  }
  function openMailApp(url) {
    var a = document.createElement("a");
    a.href = url; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---- Use a template: fill the fields, preview, copy or open ---- */
  function compose(id) {
    if (SDT.modal.isOpen()) return;
    var tpl = list().filter(function (x) { return x.id === id; })[0];
    if (!tpl) return;
    var tk = (SDT.ticket && SDT.ticket.current && SDT.ticket.current()) || {};
    var mem = memory[tk.id || "none"] = memory[tk.id || "none"] || {};
    var base = known(), fields = namesIn(tpl), values = {}, inputs = {}, logId = uid();

    fields.forEach(function (n) { values[n] = (n in base && base[n]) ? base[n] : (mem[n] != null ? mem[n] : (base[n] || "")); });

    var wrap = el("div", "em-compose");
    var left = el("div", "em-fields"), right = el("div", "em-side");
    function field(labelText, control, hint) {
      var d = el("div", "");
      var l = el("label", "", labelText); l.htmlFor = control.id;
      d.appendChild(l); d.appendChild(control);
      if (hint) d.appendChild(el("p", "empty small", hint));
      return d;
    }
    function input(idv, val) { var i = el("input", ""); i.type = "text"; i.id = idv; i.value = val || ""; i.autocomplete = "off"; return i; }

    var to = input("em-to", tpl.to), cc = input("em-cc", tpl.cc);
    left.appendChild(field("To", to));
    left.appendChild(field("Cc", cc));
    if (fields.length) left.appendChild(el("h3", "em-sub", "Fill in"));
    fields.forEach(function (n) {
      var i = input("em-f-" + n, values[n]);
      inputs[n] = i;
      left.appendChild(field(labelOf(n), i));
      i.addEventListener("input", update);
    });
    to.addEventListener("input", update); cc.addEventListener("input", update);

    right.appendChild(el("h3", "em-sub", "Preview"));
    var subj = el("div", "em-subject");
    var bodyPre = el("pre", "output em-body");
    var note = el("p", "warn"); note.hidden = true;
    right.appendChild(subj); right.appendChild(bodyPre); right.appendChild(note);
    var det = el("details", "em-ai");
    det.appendChild(el("summary", "", "Polish the wording with AI (optional)"));
    det.appendChild(el("p", "empty small", "Copy the prompt, paste it into your approved AI tool, then paste its reply here. While this box has text, Copy body and Open in mail app use it. The prompt contains the names you filled in."));
    var aiBtn = el("button", "btn btn-ghost btn-sm", "Copy AI prompt"); aiBtn.type = "button";
    var aiBox = el("textarea", ""); aiBox.id = "em-ai"; aiBox.rows = 7; aiBox.setAttribute("aria-label", "Email body from the AI tool");
    var aiRow = el("div", "btn-row"); aiRow.appendChild(aiBtn);
    det.appendChild(aiRow); det.appendChild(aiBox);
    right.appendChild(det);
    wrap.appendChild(left); wrap.appendChild(right);

    var last = null, built = "";
    function update() {
      fields.forEach(function (n) {
        values[n] = inputs[n].value;
        if (!(n in base)) mem[n] = inputs[n].value;
      });
      last = build(tpl, values); built = last.body;
      if (aiBox.value.trim()) last = { subject: last.subject, body: aiBox.value.replace(/\s+$/, ""), empty: last.empty };
      subj.textContent = "Subject: " + last.subject;
      bodyPre.textContent = last.body;
      note.hidden = !last.empty.length;
      note.textContent = last.empty.length ? "Still empty: " + last.empty.map(labelOf).join(", ") + ". Empty items show in [brackets]." : "";
      return last;
    }
    aiBox.addEventListener("input", update);
    aiBtn.addEventListener("click", function () {
      update();
      SDT.app.copy("Improve the wording of this email so it is clear, polite and professional. Keep all names, numbers, dates and the signature exactly as they are. " +
        "Do not add information. Reply with only the email body, without a subject line.\n\n" + built, "Prompt copied - paste the AI's reply into the box");
    });
    update();
    function warnText(r) { return r.empty.length ? " - " + r.empty.length + " field" + (r.empty.length === 1 ? "" : "s") + " still empty" : ""; }
    function record(r) { logEmail(logId, tpl, to.value.trim(), cc.value.trim(), r, values.userName || base.userName || ""); }

    SDT.modal.open({
      title: tpl.title, body: wrap, size: "lg", initialFocus: fields.length ? inputs[fields[0]] : to,
      actions: [
        { label: "Copy subject", kind: "ghost", onClick: function () { SDT.app.copy(update().subject, "Subject copied"); return false; } },
        { label: "Copy body", onClick: function () { var r = update(); SDT.app.copy(r.body, "Email body copied" + warnText(r)); record(r); return false; } },
        { label: "Open in mail app", onClick: function () {
            var r = update(), url = mailtoUrl(to.value.trim(), cc.value.trim(), r.subject, r.body);
            openMailApp(url); record(r);
            toast(url.length > 1900 ? "Opened - the message is long; if your mail app cut it off, use Copy body instead" : "Opened in your mail app" + warnText(r));
            return false;
          } },
        { label: "Close", kind: "ghost", cancel: true }
      ]
    });
  }

  /* ---- Create / edit a template ---- */
  function openEditor(id, copyOf) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? list().filter(function (x) { return x.id === id; })[0] : null;
    var src = cur || copyOf || null;
    var body = el("div", "kb-form");
    function field(labelText, control, idv) { var d = el("div", ""); var l = el("label", "", labelText); l.htmlFor = idv; d.appendChild(l); d.appendChild(control); return d; }
    function input(idv, val) { var i = el("input", ""); i.type = "text"; i.id = idv; i.value = val || ""; i.autocomplete = "off"; return i; }

    var title = input("em-title", copyOf ? copyOf.title + " (copy)" : (src ? src.title : ""));
    var to = input("em-e-to", src ? src.to : ""), cc = input("em-e-cc", src ? src.cc : "");
    var subject = input("em-subject", src ? src.subject : "");
    var text = el("textarea", ""); text.id = "em-body"; text.rows = 12; text.value = src ? src.body : "";
    var err = el("p", "form-error", ""); err.hidden = true;

    var two = el("div", "two"); two.appendChild(field("To (optional)", to, "em-e-to")); two.appendChild(field("Cc (optional)", cc, "em-e-cc"));
    body.appendChild(field("Template name", title, "em-title"));
    body.appendChild(two);
    body.appendChild(field("Subject", subject, "em-subject"));
    body.appendChild(field("Message", text, "em-body"));

    var chipBox = el("div", "em-chips");
    chipBox.appendChild(el("span", "tpl-label", "Insert:"));
    var lastField = text;
    subject.addEventListener("focus", function () { lastField = subject; });
    text.addEventListener("focus", function () { lastField = text; });
    CHIPS.forEach(function (c) {
      var b = el("button", "btn btn-ghost btn-sm", "{{" + c + "}}"); b.type = "button";
      b.addEventListener("click", function () {
        var f = lastField, s = f.selectionStart == null ? f.value.length : f.selectionStart, e = f.selectionEnd == null ? s : f.selectionEnd;
        var ins = "{{" + c + "}}";
        f.value = f.value.slice(0, s) + ins + f.value.slice(e);
        f.focus(); f.setSelectionRange(s + ins.length, s + ins.length);
      });
      chipBox.appendChild(b);
    });
    body.appendChild(chipBox);
    body.appendChild(el("p", "empty small", "Anything else in double braces, such as {{ticketNumber}} or {{details}}, becomes a fill-in field when you use the template. {{signature}} is added from Settings."));
    body.appendChild(err);

    function snap() { return [title.value, to.value, cc.value, subject.value, text.value].join("\u0000"); }
    var initial = snap();
    SDT.modal.open({
      title: cur ? "Edit email template" : "New email template", body: body, size: "lg", initialFocus: title,
      isDirty: function () { return snap() !== initial; },
      actions: [
        { label: "Save", kind: "primary", onClick: function () {
            if (!title.value.trim() || !subject.value.trim() || !text.value.trim()) { err.textContent = "Enter a name, a subject and a message."; err.hidden = false; return false; }
            var rec = { id: cur ? cur.id : uid(), title: title.value.trim(), to: to.value.trim(), cc: cc.value.trim(), subject: subject.value.trim(), body: text.value.replace(/\s+$/, "") };
            var all = list();
            if (cur) all = all.map(function (x) { return x.id === cur.id ? rec : x; }); else all.push(rec);
            store.set("emailTemplates", all);
            render(); toast("Email template saved");
          } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  /* ---- Pages ---- */
  function render() {
    var q = state.query.toLowerCase().trim();
    var items = list().filter(function (t) { return !q || (t.title + " " + t.subject + " " + t.body).toLowerCase().indexOf(q) > -1; });
    var ul = $("em-list");
    ul.innerHTML = "";
    if (!items.length) ul.appendChild(el("li", "empty", list().length ? "No templates match." : "No email templates yet. Choose New template."));
    items.forEach(function (t) {
      var li = el("li", "snippet");
      li.appendChild(el("h3", "", t.title));
      li.appendChild(el("p", "snippet-text em-subject-line", "Subject: " + t.subject));
      li.appendChild(el("p", "snippet-text em-preview-text", t.body));
      var row = el("div", "btn-row");
      function btn(label, kind, fn) { var b = el("button", "btn " + kind + " btn-sm", label); b.type = "button"; b.setAttribute("aria-label", label + " " + t.title); b.addEventListener("click", fn); return b; }
      row.appendChild(btn("Use", "", function () { compose(t.id); }));
      row.appendChild(btn("Edit", "btn-ghost", function () { openEditor(t.id); }));
      row.appendChild(btn("Duplicate", "btn-ghost", function () { openEditor(null, t); }));
      row.appendChild(btn("Delete", "btn-danger", function () {
        var snap = list();
        store.set("emailTemplates", snap.filter(function (x) { return x.id !== t.id; }));
        render();
        toast("Template deleted", function () { store.set("emailTemplates", snap); render(); });
      }));
      li.appendChild(row);
      ul.appendChild(li);
    });
    renderLog();
  }

  function renderLog() {
    var ul = $("em-log"); if (!ul) return;
    var items = logs();
    ul.innerHTML = "";
    $("em-log-clear").hidden = !items.length;
    if (!items.length) { ul.appendChild(el("li", "empty small", "Nothing yet. Emails you copy or open in your mail app are listed here.")); return; }
    items.forEach(function (x) {
      var li = el("li", "follow-item");
      var t = el("span", "follow-text");
      t.appendChild(el("strong", "", x.subject || x.title));
      t.appendChild(el("div", "result-meta", [fmt(x.at), x.who, x.to ? "To: " + x.to : "", x.title].filter(Boolean).join(" | ")));
      var c = el("button", "btn btn-ghost btn-sm", "Copy body"); c.type = "button"; c.setAttribute("aria-label", "Copy the body of " + (x.subject || x.title));
      c.addEventListener("click", function () { SDT.app.copy(x.body, "Email body copied"); });
      var d = el("button", "btn btn-danger btn-sm", "Remove"); d.type = "button"; d.setAttribute("aria-label", "Remove " + (x.subject || x.title) + " from the list");
      d.addEventListener("click", function () {
        var snap = logs();
        store.set("emailLog", snap.filter(function (y) { return y.id !== x.id; })); renderLog();
        toast("Removed from the list", function () { store.set("emailLog", snap); renderLog(); });
      });
      li.appendChild(t); li.appendChild(c); li.appendChild(d); ul.appendChild(li);
    });
  }

  function init() {
    list(); // seeds the starter templates on first run
    $("em-new").addEventListener("click", function () { openEditor(null); });
    var timer;
    $("em-search").addEventListener("input", function (e) {
      var v = e.target.value; clearTimeout(timer);
      timer = setTimeout(function () { state.query = v; render(); }, 120);
    });
    $("em-log-clear").addEventListener("click", function () {
      var snap = logs();
      store.set("emailLog", []); renderLog();
      toast("Recent emails cleared", function () { store.set("emailLog", snap); renderLog(); });
    });
  }

  SDT.email = { init: init, render: render, list: list, compose: compose, openEditor: openEditor };
})(window);
