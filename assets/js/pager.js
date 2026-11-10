/* pager.js - shared pagination for long lists (Knowledge Base, Ticket History, Favorites).
   Usage per list:
     var pager = SDT.pager.create({ onChange: render });
     var pageItems = pager.slice(items, resetToken, jumpIndex);   // call before drawing the list
     pageItems.forEach(draw);
     pager.mount(listElement);                                    // call after drawing; adds the controls
   - resetToken: when it changes (for example the search text) the list goes back to page 1.
   - jumpIndex (optional): index in the full list that must be visible; the page is switched to show it.
   - Items per page is a single setting (Settings > Appearance) shared by every list. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};
  var SIZES = [10, 25, 50, 100];
  var DEFAULT_SIZE = 10;

  var el = window.SDT.dom.el;
  function pageSize() {
    var v = SDT.settings && SDT.settings.values ? parseInt(SDT.settings.values().pageSize, 10) : DEFAULT_SIZE;
    return SIZES.indexOf(v) > -1 ? v : DEFAULT_SIZE;
  }
  // 1 ... 4 5 6 ... 20  (always the first, the last and the neighbours of the current page)
  function pageList(page, pages) {
    if (pages <= 7) { var all = []; for (var i = 1; i <= pages; i++) all.push(i); return all; }
    var out = [1], from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
    if (page <= 3) { from = 2; to = 4; }
    if (page >= pages - 2) { from = pages - 3; to = pages - 1; }
    if (from > 2) out.push("gap");
    for (var p = from; p <= to; p++) out.push(p);
    if (to < pages - 1) out.push("gap");
    out.push(pages);
    return out;
  }

  function create(opts) {
    opts = opts || {};
    var page = 1, token = null, total = 0, size = pageSize(), nav = null, focusKey = null;
    var ctl = {};

    function pages() { return Math.max(1, Math.ceil(total / size)); }

    ctl.slice = function (items, resetToken, jumpIndex) {
      size = pageSize(); total = items.length;
      if (resetToken !== token) { token = resetToken; page = 1; }
      if (typeof jumpIndex === "number" && jumpIndex >= 0) page = Math.floor(jumpIndex / size) + 1;
      page = Math.min(Math.max(1, page), pages());
      return items.slice((page - 1) * size, page * size);
    };

    function go(n, key, list) {
      n = Math.min(Math.max(1, n), pages());
      if (n === page) return;
      page = n; focusKey = key;
      if (typeof opts.onChange === "function") opts.onChange();
      if (list && list.scrollIntoView) list.scrollIntoView({ block: "start" });
    }

    ctl.mount = function (list) {
      var old = list.querySelector(":scope > .pager-item");
      if (old) old.remove();
      if (total <= SIZES[0]) return;               // nothing worth paging
      var np = pages(), first = (page - 1) * size + 1, last = Math.min(total, page * size);

      var li = el("li", "pager-item");
      nav = el("nav", "pager"); nav.setAttribute("aria-label", "Pagination");
      nav.appendChild(el("span", "pager-info", "Showing " + first + "\u2013" + last + " of " + total));

      var pg = el("div", "pager-pages");
      function btn(label, key, target, disabled, aria, current) {
        var b = el("button", "pager-btn" + (current ? " current" : ""), label);
        b.type = "button"; b.setAttribute("data-pg", key);
        if (aria) b.setAttribute("aria-label", aria);
        if (current) b.setAttribute("aria-current", "page");
        if (disabled) b.disabled = true;
        else b.addEventListener("click", function () { go(target, key, list); });
        return b;
      }
      pg.appendChild(btn("\u2039 Prev", "prev", page - 1, page === 1, "Previous page"));
      pageList(page, np).forEach(function (p) {
        if (p === "gap") { var g = el("span", "pager-gap", "\u2026"); g.setAttribute("aria-hidden", "true"); pg.appendChild(g); }
        else pg.appendChild(btn(String(p), "p" + p, p, false, "Page " + p + " of " + np, p === page));
      });
      pg.appendChild(btn("Next \u203A", "next", page + 1, page === np, "Next page"));
      nav.appendChild(pg);

      var sizeBox = el("label", "pager-size", "Per page ");
      var sel = el("select"); sel.setAttribute("data-pg", "size");
      SIZES.forEach(function (n) { var o = el("option", "", String(n)); o.value = String(n); if (n === size) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", function () {
        var firstIdx = (page - 1) * size;             // keep the first visible item on screen
        focusKey = "size";
        if (SDT.settings) SDT.settings.update("pageSize", parseInt(sel.value, 10));
        size = pageSize();
        page = Math.floor(firstIdx / size) + 1;
        if (typeof opts.onChange === "function") opts.onChange();
      });
      sizeBox.appendChild(sel);
      nav.appendChild(sizeBox);

      li.appendChild(nav);
      list.appendChild(li);

      // the controls are redrawn on every change, so give focus back to the same control
      if (focusKey) {
        var target = li.querySelector('[data-pg="' + focusKey + '"]');
        if (!target || target.disabled) target = li.querySelector(".pager-btn.current");
        if (target) target.focus({ preventScroll: true });
        focusKey = null;
      }
    };
    return ctl;
  }

  SDT.pager = { create: create, SIZES: SIZES };
})(window);
