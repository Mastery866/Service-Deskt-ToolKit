/* errorlog.js - keeps a short list of problems the app hit (script errors and failed promises) so they are easy
   to report. Loads first so it can also catch errors while the other scripts load. Stays on this computer. */
(function (global) {
  "use strict";
  var KEY = "sdt.errorLog", MAX = 30;
  var SDT = global.SDT = global.SDT || {};

  function read() { try { var v = JSON.parse(global.localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function add(kind, msg, where) {
    var list = read();
    list.unshift({ at: new Date().toISOString(), kind: kind, message: String(msg || "").slice(0, 300), where: String(where || "").slice(0, 160) });
    try { global.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {}
  }
  global.addEventListener("error", function (e) {
    var file = String(e.filename || "").split("/").pop();
    add("error", e.message, file ? file + ":" + e.lineno : "");
  });
  global.addEventListener("unhandledrejection", function (e) {
    var r = e.reason; add("promise", (r && r.message) || r, "");
  });

  function clear() { try { global.localStorage.removeItem(KEY); } catch (e) {} }
  function text() {
    var list = read();
    var head = "Service Desk Toolkit - problem report\nVersion: " + ((SDT.version && SDT.version.current) || "unknown") + "\nBrowser: " + global.navigator.userAgent + "\n";
    if (!list.length) return head + "\nNo problems recorded.";
    return head + "\n" + list.map(function (x) { return x.at + " | " + x.kind + " | " + x.message + (x.where ? " | " + x.where : ""); }).join("\n");
  }
  function render() {
    var ul = document.getElementById("err-list"); if (!ul) return;
    var list = read();
    ul.innerHTML = "";
    document.getElementById("err-clear").hidden = !list.length;
    document.getElementById("err-copy").hidden = !list.length;
    if (!list.length) { var li = document.createElement("li"); li.className = "empty small"; li.textContent = "No problems recorded."; ul.appendChild(li); return; }
    list.slice(0, 10).forEach(function (x) {
      var li = document.createElement("li"); li.className = "follow-item";
      var s = document.createElement("span"); s.className = "follow-text";
      var b = document.createElement("strong"); b.textContent = x.message || "(no message)";
      var m = document.createElement("div"); m.className = "result-meta";
      m.textContent = [new Date(x.at).toLocaleString(), x.kind, x.where].filter(Boolean).join(" | ");
      s.appendChild(b); s.appendChild(m); li.appendChild(s); ul.appendChild(li);
    });
  }
  function init() {
    var c = document.getElementById("err-copy"); if (!c) return;
    c.addEventListener("click", function () { SDT.app.copy(text(), "Problem details copied"); });
    document.getElementById("err-clear").addEventListener("click", function () { clear(); render(); SDT.app.toast("Problem list cleared"); });
  }
  SDT.errors = { list: read, text: text, clear: clear, render: render, init: init, add: add };
})(window);
