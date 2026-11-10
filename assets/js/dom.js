/* dom.js - small helpers shared by every module (one copy instead of one per file).
   $(id)            element by id
   el(tag, cls, text) create an element; text is always set with textContent, so user data can never run as HTML
   uid(prefix)      a short unique id such as "sc1k3j9a2b1" (never repeats, even within the same millisecond)
   toast(msg, undo) show a message, with an optional Undo callback
   today(), csv(s)  today as YYYY-MM-DD, and a comma separated string as a clean array */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {}, seq = 0;
  SDT.dom = {
    $: function (id) { return document.getElementById(id); },
    el: function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    },
    uid: function (prefix) {
      seq = (seq + 1) % 46656;
      return (prefix || "x") + Date.now().toString(36) + ("00" + seq.toString(36)).slice(-3) + Math.random().toString(36).slice(2, 4);
    },
    toast: function (msg, undo) { if (SDT.app && SDT.app.toast) SDT.app.toast(msg, undo); },
    today: function () {
      var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    },
    /* A repeating job that sleeps while the tab is hidden (no wasted work in the background) and catches up when you return */
    every: function (fn, ms, runWhenHidden) {
      var id = setInterval(function () { if (runWhenHidden || !document.hidden) fn(); }, ms);
      if (!runWhenHidden) document.addEventListener("visibilitychange", function () { if (!document.hidden) fn(); });
      return id;
    },
    csv: function (v) { return String(v || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }
  };
})(window);
