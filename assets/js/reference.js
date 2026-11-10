/* reference.js - quick reference: commands, ports and error codes you look up often. Copy the key with one click.
   Starter entries are added the first time; you can edit, add and delete your own. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var state = { query: "", group: "" };
  var pager = null;
  var GROUP_ORDER = ["Commands", "Ports", "Error codes"];

  var STARTER = [
    ["Commands", "ipconfig /all", "Full network adapter details, DNS servers and DHCP lease"],
    ["Commands", "ipconfig /flushdns", "Clears the DNS resolver cache"],
    ["Commands", "ipconfig /release", "Releases the DHCP address (follow with /renew)"],
    ["Commands", "ipconfig /renew", "Requests a new DHCP address"],
    ["Commands", "nslookup <name>", "Looks up a DNS name"],
    ["Commands", "ping <host>", "Checks that a host answers"],
    ["Commands", "tracert <host>", "Shows each hop on the way to a host"],
    ["Commands", "netstat -ano", "Open connections with the process ID of each"],
    ["Commands", "gpupdate /force", "Reapplies Group Policy now"],
    ["Commands", "gpresult /r", "Shows which policies apply to the user and computer"],
    ["Commands", "whoami /groups", "Shows the groups the signed-in user belongs to"],
    ["Commands", "sfc /scannow", "Scans and repairs protected Windows files (run as administrator)"],
    ["Commands", "DISM /Online /Cleanup-Image /RestoreHealth", "Repairs the Windows image (run as administrator)"],
    ["Commands", "chkdsk C: /scan", "Online scan of the disk for errors"],
    ["Commands", "systeminfo", "OS version, hardware, uptime and hotfixes"],
    ["Commands", "klist purge", "Clears cached Kerberos tickets"],
    ["Commands", "tasklist", "Lists running processes"],
    ["Commands", "taskkill /PID <id> /F", "Ends a process by its ID"],
    ["Commands", "shutdown /r /t 0", "Restarts the computer now"],
    ["Ports", "20, 21", "FTP (data, control)"],
    ["Ports", "22", "SSH / SFTP"],
    ["Ports", "23", "Telnet"],
    ["Ports", "25", "SMTP"],
    ["Ports", "53", "DNS"],
    ["Ports", "67, 68", "DHCP (server, client)"],
    ["Ports", "80", "HTTP"],
    ["Ports", "88", "Kerberos"],
    ["Ports", "110", "POP3"],
    ["Ports", "123", "NTP (time)"],
    ["Ports", "135", "RPC endpoint mapper"],
    ["Ports", "143", "IMAP"],
    ["Ports", "389", "LDAP"],
    ["Ports", "443", "HTTPS"],
    ["Ports", "445", "SMB (file sharing)"],
    ["Ports", "465, 587", "SMTP over TLS (submission)"],
    ["Ports", "636", "LDAPS"],
    ["Ports", "993", "IMAP over TLS"],
    ["Ports", "995", "POP3 over TLS"],
    ["Ports", "1433", "Microsoft SQL Server"],
    ["Ports", "3306", "MySQL"],
    ["Ports", "3389", "Remote Desktop (RDP)"],
    ["Ports", "5985, 5986", "WinRM (HTTP, HTTPS)"],
    ["Error codes", "0x80070005", "Access denied (E_ACCESSDENIED)"],
    ["Error codes", "0x80070057", "The parameter is incorrect (E_INVALIDARG)"],
    ["Error codes", "0x80004005", "Unspecified error (E_FAIL)"],
    ["Error codes", "0x80070002", "The system cannot find the file specified"],
    ["Error codes", "0x80070003", "The system cannot find the path specified"],
    ["Error codes", "0x8007000E", "Not enough memory (E_OUTOFMEMORY)"],
    ["Error codes", "0x800706BA", "The RPC server is unavailable"],
    ["Error codes", "0x80070422", "The service cannot be started because it is disabled"],
    ["Error codes", "0x80072EE7", "The server name or address could not be resolved"]
  ];

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid() { return window.SDT.dom.uid("r"); }
  var toast = window.SDT.dom.toast;

  function list() {
    var s = store.get("quickRef", null);
    if (!Array.isArray(s)) { s = STARTER.map(function (r) { return { id: uid(), group: r[0], key: r[1], value: r[2], note: "" }; }); store.set("quickRef", s); }
    return s;
  }
  function groups() {
    var g = []; list().forEach(function (r) { if (g.indexOf(r.group) === -1) g.push(r.group); });
    return g.sort(function (a, b) { var x = GROUP_ORDER.indexOf(a), y = GROUP_ORDER.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b); });
  }
  function filtered() {
    var terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    return list().filter(function (r) {
      if (state.group && r.group !== state.group) return false;
      var h = (r.group + " " + r.key + " " + r.value + " " + (r.note || "")).toLowerCase();
      return terms.every(function (t) { return h.indexOf(t) > -1; });
    }).sort(function (a, b) {
      var x = GROUP_ORDER.indexOf(a.group), y = GROUP_ORDER.indexOf(b.group);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.group.localeCompare(b.group) || a.key.localeCompare(b.key, undefined, { numeric: true });
    });
  }

  function openEditor(id) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? list().filter(function (r) { return r.id === id; })[0] : null;
    var body = el("div", "kb-form");
    function field(label, ctl, idv) { var d = el("div"); var l = el("label", "", label); l.htmlFor = idv; d.appendChild(l); d.appendChild(ctl); return d; }
    function input(idv, v) { var i = el("input"); i.type = "text"; i.id = idv; i.value = v || ""; i.autocomplete = "off"; return i; }
    var g = input("rf-group", cur ? cur.group : (state.group || "Commands")); g.setAttribute("list", "rf-groups");
    var dl = el("datalist"); dl.id = "rf-groups"; groups().forEach(function (x) { var o = document.createElement("option"); o.value = x; dl.appendChild(o); });
    var k = input("rf-key", cur ? cur.key : ""), v = input("rf-value", cur ? cur.value : ""), n = input("rf-note", cur ? cur.note : "");
    var err = el("p", "form-error"); err.hidden = true;
    body.appendChild(field("Group", g, "rf-group")); body.appendChild(dl);
    body.appendChild(field("What you copy (command, port, code)", k, "rf-key"));
    body.appendChild(field("What it means", v, "rf-value"));
    body.appendChild(field("Note (optional)", n, "rf-note"));
    body.appendChild(err);
    var initial = [g.value, k.value, v.value, n.value].join("\u0000");
    SDT.modal.open({
      title: cur ? "Edit entry" : "New entry", body: body, size: "md", initialFocus: k,
      isDirty: function () { return [g.value, k.value, v.value, n.value].join("\u0000") !== initial; },
      actions: [
        { label: "Save", kind: "primary", onClick: function () {
            if (!g.value.trim() || !k.value.trim() || !v.value.trim()) { err.textContent = "Enter a group, the text to copy and what it means."; err.hidden = false; return false; }
            var rec = { id: cur ? cur.id : uid(), group: g.value.trim(), key: k.value.trim(), value: v.value.trim(), note: n.value.trim() };
            var all = list(); all = cur ? all.map(function (x) { return x.id === cur.id ? rec : x; }) : all.concat([rec]);
            store.set("quickRef", all); render(); toast("Entry saved");
          } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  function renderGroups() {
    var sel = $("ref-group"), cur = state.group;
    sel.innerHTML = "";
    var o = el("option", "", "All groups"); o.value = ""; sel.appendChild(o);
    groups().forEach(function (x) { var p = el("option", "", x); p.value = x; sel.appendChild(p); });
    sel.value = groups().indexOf(cur) > -1 ? cur : ""; state.group = sel.value;
  }

  function render() {
    renderGroups();
    var items = filtered(), ul = $("ref-list"); ul.innerHTML = "";
    $("ref-summary").textContent = items.length + " of " + list().length + " entries";
    if (!items.length) { ul.appendChild(el("li", "empty", "Nothing matches. Try a different word or add a new entry.")); return; }
    pager = pager || SDT.pager.create({ onChange: render });
    pager.slice(items, state.query + "|" + state.group).forEach(function (r) {
      var li = el("li", "ref-row");
      var main = el("div", "ref-main");
      main.appendChild(el("span", "tag", r.group));
      main.appendChild(el("code", "ref-key", r.key));
      main.appendChild(el("span", "ref-value", r.value));
      if (r.note) main.appendChild(el("span", "result-meta", r.note));
      li.appendChild(main);
      var row = el("div", "ref-tools");
      function btn(label, kind, fn) { var b = el("button", "btn " + kind + " btn-sm", label); b.type = "button"; b.setAttribute("aria-label", label + " " + r.key); b.addEventListener("click", fn); return b; }
      row.appendChild(btn("Copy", "", function () { SDT.app.copy(r.key, "Copied " + r.key, { skipGuard: true }); }));
      row.appendChild(btn("Edit", "btn-ghost", function () { openEditor(r.id); }));
      row.appendChild(btn("Delete", "btn-danger", function () {
        var snap = list(); store.set("quickRef", snap.filter(function (x) { return x.id !== r.id; })); render();
        toast("Entry deleted", function () { store.set("quickRef", snap); render(); });
      }));
      li.appendChild(row); ul.appendChild(li);
    });
    pager.mount(ul);
  }

  function init() {
    list();
    var timer;
    $("ref-search").addEventListener("input", function (e) { var v = e.target.value; clearTimeout(timer); timer = setTimeout(function () { state.query = v; render(); }, 120); });
    $("ref-group").addEventListener("change", function (e) { state.group = e.target.value; render(); });
    $("ref-new").addEventListener("click", function () { openEditor(null); });
  }

  SDT.reference = { init: init, render: render, list: list };
})(window);
