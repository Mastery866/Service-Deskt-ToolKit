/* commands.js - commands inside steps. Put a command in backticks, for example `ipconfig /flushdns`,
   and it is shown as code with its own Copy button. The backticks are removed in copied work notes. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};
  var RE = /`([^`\n]+)`/g;

  var el = window.SDT.dom.el;
  function code(cmd) {
    var w = el("span", "cmd");
    var c = el("code", "", cmd);
    var b = el("button", "cmd-copy", "Copy"); b.type = "button";
    b.title = "Copy this command"; b.setAttribute("aria-label", "Copy command " + cmd);
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      SDT.app.copy(cmd, "Command copied", { skipGuard: true });
    });
    w.appendChild(c); w.appendChild(b);
    return w;
  }
  /* Adds text to container; commands become code + Copy. plain(container, text) renders the text between commands. */
  function render(container, text, plain) {
    var re = new RegExp(RE.source, "g"), last = 0, m;
    text = String(text == null ? "" : text);
    plain = plain || function (c, t) { if (t) c.appendChild(document.createTextNode(t)); };
    while ((m = re.exec(text))) {
      plain(container, text.slice(last, m.index));
      container.appendChild(code(m[1]));
      last = re.lastIndex;
    }
    plain(container, text.slice(last));
  }
  function strip(text) { return String(text == null ? "" : text).replace(new RegExp(RE.source, "g"), "$1"); }

  SDT.cmd = { render: render, strip: strip };
})(window);
