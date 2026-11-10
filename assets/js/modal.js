/* modal.js - accessible modal dialogs used across the app.
   SDT.modal.open({title, body, size, actions, isDirty, initialFocus, onClose}) -> handle {close, el, body}
   SDT.modal.confirm({title, message, confirmLabel, danger}) -> Promise<boolean>
   SDT.modal.prompt({title, message, label, value, placeholder, confirmLabel}) -> Promise<string|null>
   Esc closes, Tab is trapped, focus returns to the opener, the page behind is inert and cannot scroll.
   Dialogs can stack (a confirm can appear on top of an editor). */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};
  var stack = [], seq = 0;
  var FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

  var el = window.SDT.dom.el;
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }
  function setPageInert(on) {
    var app = document.querySelector(".app");
    var skip = document.getElementById("skip-link");
    [app, skip].forEach(function (n) {
      if (!n) return;
      if (on) n.setAttribute("inert", ""); else n.removeAttribute("inert");
    });
    document.body.classList.toggle("modal-open", on);
  }

  function open(opts) {
    opts = opts || {};
    var opener = document.activeElement;
    var titleId = "modal-title-" + (++seq);
    var backdrop = el("div", "modal-backdrop");
    var dlg = el("div", "modal modal-" + (opts.size || "md"));
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", titleId);

    var head = el("div", "modal-head");
    var h = el("h2", "", opts.title || ""); h.id = titleId;
    var x = el("button", "modal-x", "\u00D7"); x.type = "button"; x.setAttribute("aria-label", "Close dialog");
    head.appendChild(h); head.appendChild(x);

    var bodyEl = el("div", "modal-body");
    if (opts.body && opts.body.nodeType) bodyEl.appendChild(opts.body);
    else if (opts.body != null) bodyEl.textContent = String(opts.body);

    dlg.appendChild(head); dlg.appendChild(bodyEl);
    var closed = false, handle;

    function close(result) {
      if (closed) return;
      closed = true;
      var i = stack.indexOf(entry);
      if (i > -1) stack.splice(i, 1);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (stack.length) stack[stack.length - 1].backdrop.removeAttribute("inert"); else setPageInert(false);
      if (opts.onClose) opts.onClose(result);
      if (opener && document.body.contains(opener) && opener.focus) { try { opener.focus(); } catch (e) {} }
    }
    function requestClose() {
      if (opts.isDirty && opts.isDirty()) {
        confirm({ title: "Discard your changes?", message: "You have unsaved changes in this dialog.", confirmLabel: "Discard", danger: true })
          .then(function (ok) { if (ok) close(); });
      } else close();
    }

    if (opts.actions && opts.actions.length) {
      var foot = el("div", "modal-foot");
      opts.actions.forEach(function (a) {
        var b = el("button", "btn" + (a.kind === "ghost" ? " btn-ghost" : a.kind === "danger" ? " btn-danger" : ""), a.label);
        b.type = "button";
        if (a.id) b.id = a.id;
        b.addEventListener("click", function () {
          if (a.cancel) { requestClose(); return; }
          var r = a.onClick ? a.onClick(handle) : undefined;
          if (r !== false) close(a.value);
        });
        foot.appendChild(b);
      });
      dlg.appendChild(foot);
    }

    backdrop.appendChild(dlg);
    var downOnBackdrop = false;
    backdrop.addEventListener("mousedown", function (e) { downOnBackdrop = e.target === backdrop; });
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop && downOnBackdrop) requestClose(); });
    x.addEventListener("click", requestClose);

    var entry = { backdrop: backdrop, requestClose: requestClose, dlg: dlg };
    if (stack.length) stack[stack.length - 1].backdrop.setAttribute("inert", ""); else setPageInert(true);
    stack.push(entry);
    backdrop.style.zIndex = String(500 + stack.length * 10);
    document.body.appendChild(backdrop);

    handle = { el: dlg, body: bodyEl, close: close, setTitle: function (t) { h.textContent = t; } };

    // initial focus
    var target = null;
    if (opts.initialFocus && opts.initialFocus.nodeType) target = opts.initialFocus;
    else if (typeof opts.initialFocus === "string") target = dlg.querySelector(opts.initialFocus);
    if (!target) target = focusables(bodyEl)[0] || dlg.querySelector(".modal-foot .btn") || x;
    setTimeout(function () { if (target && target.focus) target.focus(); }, 0);
    return handle;
  }

  /* One global key handler: Esc closes the top dialog, Tab stays inside it. */
  document.addEventListener("keydown", function (e) {
    if (!stack.length) return;
    var top = stack[stack.length - 1];
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); top.requestClose(); return; }
    if (e.key === "Tab") {
      var f = focusables(top.dlg);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!top.dlg.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  function confirm(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      var body = el("p", "modal-message", o.message || "");
      var h = open({
        title: o.title || "Are you sure?", body: body, size: "sm",
        actions: [
          { label: o.cancelLabel || "Cancel", kind: "ghost", cancel: true, id: "modal-cancel" },
          { label: o.confirmLabel || "OK", kind: o.danger ? "danger" : "primary", id: "modal-ok", onClick: function () { done(true); } }
        ],
        onClose: function () { done(false); }
      });
      // safest default: focus Cancel for destructive actions, OK otherwise
      setTimeout(function () { var b = h.el.querySelector(o.danger ? "#modal-cancel" : "#modal-ok"); if (b) b.focus(); }, 10);
    });
  }

  function prompt(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      var body = el("div", "");
      if (o.message) body.appendChild(el("p", "modal-message", o.message));
      var lab = el("label", "", o.label || ""); lab.htmlFor = "modal-prompt-input";
      var input = el("input", ""); input.type = "text"; input.id = "modal-prompt-input"; input.value = o.value || ""; input.autocomplete = "off";
      if (o.placeholder) input.placeholder = o.placeholder;
      var err = el("p", "form-error", ""); err.hidden = true;
      if (o.label) body.appendChild(lab);
      body.appendChild(input); body.appendChild(err);
      function submit(h) {
        var v = input.value.trim();
        if (!v) { err.textContent = "Enter a value."; err.hidden = false; input.focus(); return false; }
        done(v); return true;
      }
      var handle = open({
        title: o.title || "Enter a value", body: body, size: "sm", initialFocus: input,
        actions: [
          { label: "Cancel", kind: "ghost", cancel: true },
          { label: o.confirmLabel || "OK", kind: "primary", onClick: submit }
        ],
        onClose: function () { done(null); }
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (submit()) handle.close(); } });
      setTimeout(function () { input.select(); }, 10);
    });
  }

  SDT.modal = { open: open, confirm: confirm, prompt: prompt, isOpen: function () { return stack.length > 0; } };
})(window);
