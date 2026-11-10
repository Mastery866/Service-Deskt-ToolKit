/* scripts.js - Script Library.
   Batch, PowerShell, shell and registry scripts, Win+R run commands and registry paths, grouped by category.
   Click an item to expand it. Copy it, or download a ready-to-run file (.bat, .ps1, .sh, .reg).
   Extras: risk levels (Dangerous items ask first), {{variables}} that are asked when you copy, tags, favorites,
   recently used, version history, links to Knowledge Base articles, library export/import and file import.
   Everything is saved in the browser with the rest of the app. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var state = { query: "", category: "", type: "", show: "all", sort: "name", select: false };
  var selected = {};
  function savePrefs() { if (SDT.prefs) SDT.prefs.set("scripts", { category: state.category, type: state.type, show: state.show, sort: state.sort }); }
  function dot(name) { var s = document.createElement("span"); s.className = "cat-dot"; if (SDT.shell) s.style.background = SDT.shell.catColor(name); s.setAttribute("aria-hidden", "true"); return s; }
  function cmp(a, b) {
    if (state.sort === "updated") return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.title.localeCompare(b.title);
    if (state.sort === "used") return String(b.usedAt || "").localeCompare(String(a.usedAt || "")) || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  }
  var openScripts = {}, closedCats = {}, lastVars = {}, pendingScroll = null;

  var TYPES = {
    bat:     { label: "Batch (.bat)", short: "Batch", ext: ".bat" },
    ps1:     { label: "PowerShell (.ps1)", short: "PowerShell", ext: ".ps1" },
    sh:      { label: "Shell (.sh)", short: "Shell", ext: ".sh" },
    reg:     { label: "Registry file (.reg)", short: "Registry file", ext: ".reg" },
    run:     { label: "Run command (Win+R)", short: "Run command", ext: "", noFile: true },
    regpath: { label: "Registry path (regedit)", short: "Registry path", ext: "", noFile: true },
    txt:     { label: "Text / notes (.txt)", short: "Text", ext: ".txt" }
  };
  var TYPE_ORDER = ["bat", "ps1", "sh", "reg", "run", "regpath", "txt"];
  var RISKS = { safe: "Safe", changes: "Changes settings", danger: "Dangerous" };
  var MAX_VERSIONS = 8;

  /* ---- Starter content (added once; edit or delete freely) ---- */
  var STARTER_V1 = [
    {
      title: "Windows System Repair", category: "Windows Repair", type: "bat", filename: "Windows_System_Repair", admin: true, risk: "changes", tags: ["dism", "sfc", "chkdsk"],
      description: "Runs DISM, SFC and CHKDSK one after the other and writes everything to a log file next to the script.",
      code: String.raw`@echo off
title Windows System Repair Utility
color 0B

:: Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set "LOG=%~dp0Windows_Repair_Log.txt"

echo ==========================================
echo       WINDOWS SYSTEM REPAIR UTILITY
echo ==========================================
echo.
echo Repair started: %date% %time%
echo Log file: %LOG%
echo.

echo [1/3] Checking Windows component store...
echo Running DISM...
echo. >> "%LOG%"
echo ===== DISM REPAIR ===== >> "%LOG%"

DISM /Online /Cleanup-Image /RestoreHealth >> "%LOG%" 2>&1

echo.
echo [2/3] Scanning and repairing system files...
echo Running SFC...
echo ===== SFC SCAN ===== >> "%LOG%"

sfc /scannow >> "%LOG%" 2>&1

echo.
echo [3/3] Checking file system...
echo Running CHKDSK...
echo ===== CHKDSK SCAN ===== >> "%LOG%"

chkdsk C: /scan >> "%LOG%" 2>&1

echo.
echo ==========================================
echo          REPAIR PROCESS COMPLETED
echo ==========================================
echo.
echo Please review the repair log:
echo %LOG%
echo.
echo A restart may be required.
echo.

pause
exit /b`
    },
    {
      title: "Network Reset", category: "Network", type: "bat", filename: "Network_Reset", admin: true, risk: "changes", tags: ["dns", "winsock", "ip"],
      description: "Flushes DNS, renews the IP address and resets Winsock and the TCP/IP stack. Restart the computer afterwards.",
      code: String.raw`@echo off
title Network Reset Utility
color 0B

:: Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Flushing DNS cache...
ipconfig /flushdns
echo.
echo Releasing IP address...
ipconfig /release
echo.
echo Renewing IP address...
ipconfig /renew
echo.
echo Resetting Winsock...
netsh winsock reset
echo.
echo Resetting TCP/IP stack...
netsh int ip reset
echo.
echo Done. Please restart the computer.
echo.

pause
exit /b`
    }
  ];

  var RUN_CMDS = [
    ["Network Connections", "ncpa.cpl", "Adapters: enable, disable, IP settings"],
    ["Computer Management", "compmgmt.msc", "Event Viewer, Services and Disk Management in one console"],
    ["Services", "services.msc", "Start, stop and set the startup type of services"],
    ["Device Manager", "devmgmt.msc", "Drivers and hardware"],
    ["Disk Management", "diskmgmt.msc", "Partitions and drives"],
    ["Event Viewer", "eventvwr.msc", "Application, System and Security logs"],
    ["Task Scheduler", "taskschd.msc", "Scheduled tasks"],
    ["Local Users and Groups", "lusrmgr.msc", "Not available on Windows Home"],
    ["Local Group Policy Editor", "gpedit.msc", "Not available on Windows Home"],
    ["Local Security Policy", "secpol.msc", "Password and audit policy"],
    ["Certificates (current user)", "certmgr.msc", ""],
    ["Certificates (local computer)", "certlm.msc", ""],
    ["Performance Monitor", "perfmon.msc", ""],
    ["Print Management", "printmanagement.msc", "Needs the Print Management feature"],
    ["Windows Firewall with Advanced Security", "wf.msc", ""],
    ["Shared Folders", "fsmgmt.msc", "Shares, sessions and open files"],
    ["Programs and Features", "appwiz.cpl", "Uninstall or change programs"],
    ["System Properties", "sysdm.cpl", "Computer name, domain, remote settings"],
    ["Internet Properties", "inetcpl.cpl", "Proxy, security zones, certificates"],
    ["Mouse Properties", "main.cpl", ""],
    ["Date and Time", "timedate.cpl", ""],
    ["Power Options", "powercfg.cpl", ""],
    ["Sound", "mmsys.cpl", "Playback and recording devices"],
    ["Windows Defender Firewall", "firewall.cpl", ""],
    ["User Accounts (advanced)", "netplwiz", "Account list and automatic sign-in"],
    ["System Configuration", "msconfig", "Startup and boot options"],
    ["System Information", "msinfo32", "Hardware and software summary"],
    ["Resource Monitor", "resmon", ""],
    ["Task Manager", "taskmgr", ""],
    ["Registry Editor", "regedit", ""],
    ["Remote Desktop Connection", "mstsc", ""],
    ["DirectX Diagnostic Tool", "dxdiag", ""],
    ["Disk Cleanup", "cleanmgr", ""],
    ["Printers (classic)", "control printers", "Devices and Printers"],
    ["Credential Manager", "control keymgr.dll", "Saved Windows credentials"],
    ["Network and Sharing Center", "control /name Microsoft.NetworkAndSharingCenter", ""],
    ["Windows Update (Settings)", "ms-settings:windowsupdate", "Opens the Settings app"],
    ["Apps and features (Settings)", "ms-settings:appsfeatures", "Opens the Settings app"]
  ];
  var REG_PATHS = [
    ["Startup programs (all users)", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", "Programs that start for every user"],
    ["Startup programs (current user)", "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", "Programs that start for the signed-in user"],
    ["Run once (all users)", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "Runs at the next sign-in, then is removed"],
    ["Installed programs", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "Uninstall entries (64-bit)"],
    ["Installed programs (32-bit)", "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "Uninstall entries (32-bit)"],
    ["Services", "HKLM\\SYSTEM\\CurrentControlSet\\Services", "One key per service; Start value sets the startup type"],
    ["Winlogon", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon", "Sign-in behaviour, shell, auto-logon values"],
    ["User profile list", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList", "Maps user SIDs to profile folders"],
    ["Windows version info", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "Build number, edition, install date"],
    ["System policies", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", "UAC and sign-in policy values"],
    ["Windows Update policy", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate", "Where Group Policy settings for updates are stored"],
    ["Network interfaces (TCP/IP)", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces", "IP, DNS and DHCP values per adapter"],
    ["Installed printers", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers", "Printer definitions and settings"],
    ["Environment variables (system)", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "Machine-wide variables such as Path"],
    ["Environment variables (user)", "HKCU\\Environment", "Variables for the signed-in user"],
    ["Remote Desktop settings", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server", "fDenyTSConnections turns Remote Desktop on or off"],
    ["Desktop settings (user)", "HKCU\\Control Panel\\Desktop", "Wallpaper, screen saver and display options"]
  ];
  var STARTER_V2 = [
    {
      title: "Clear Print Queue", category: "Printing", type: "bat", filename: "Clear_Print_Queue", admin: true, risk: "changes", tags: ["spooler", "printer"],
      description: "Stops the Print Spooler, deletes stuck print jobs and starts the spooler again.",
      code: String.raw`@echo off
title Clear Print Queue
color 0B

:: Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Stopping the Print Spooler service...
net stop spooler
echo.
echo Deleting stuck print jobs...
del /Q /F /S "%systemroot%\System32\spool\PRINTERS\*.*"
echo.
echo Starting the Print Spooler service...
net start spooler
echo.
echo Done. Try printing again.
echo.

pause
exit /b`
    }
  ];
  RUN_CMDS.forEach(function (r) { STARTER_V2.push({ title: r[0], category: "Run Commands", type: "run", risk: "safe", tags: [], description: r[2], code: r[1] }); });
  REG_PATHS.forEach(function (r) { STARTER_V2.push({ title: r[0], category: "Registry Paths", type: "regpath", risk: "safe", tags: ["regedit"], description: r[2], code: r[1] }); });

  /* ---- Helpers ---- */
  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid() { return window.SDT.dom.uid("sc"); }
  var toast = window.SDT.dom.toast;
  function typeOf(s) { return TYPES[s.type] || TYPES.txt; }
  function tagsOf(s) { return Array.isArray(s.tags) ? s.tags : []; }
  function kisOf(s) { return Array.isArray(s.kis) ? s.kis : []; }
  function versionsOf(s) { return Array.isArray(s.history) ? s.history : []; }
  function lineCount(t) { return t ? String(t).split("\n").length : 0; }
  var csv = window.SDT.dom.csv;
  function fmt(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString(); }
  function build(r, now) {
    return { id: uid(), title: r.title, category: r.category, type: r.type, filename: r.filename || "", admin: !!r.admin, risk: r.risk || "safe",
             tags: r.tags || [], favorite: false, kis: [], description: r.description || "", code: r.code, history: [], createdAt: now, updatedAt: now };
  }

  function list() {
    var s = store.get("scripts", null), now = new Date().toISOString();
    if (!Array.isArray(s)) {
      s = STARTER_V1.concat(STARTER_V2).map(function (r) { return build(r, now); });
      store.set("scripts", s); store.set("scriptsSeed2", true);
    } else if (!store.get("scriptsSeed2", false)) {
      STARTER_V2.forEach(function (r) {
        var dup = s.some(function (x) { return x.title === r.title && x.category === r.category; });
        if (!dup) s.push(build(r, now));
      });
      store.set("scripts", s); store.set("scriptsSeed2", true);
    }
    return s;
  }
  function save(arr) { store.set("scripts", arr); }
  function patch(id, fn) { save(list().map(function (x) { if (x.id === id) fn(x); return x; })); }
  function categories() {
    var c = []; list().forEach(function (s) { if (c.indexOf(s.category) === -1) c.push(s.category); });
    return c.sort(function (a, b) { return a.localeCompare(b); });
  }
  function filtered() {
    var terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    var out = list().filter(function (s) {
      if (state.category && s.category !== state.category) return false;
      if (state.type && s.type !== state.type) return false;
      if (state.show === "favorites" && !s.favorite) return false;
      if (state.show === "recent" && !s.usedAt) return false;
      var h = (s.title + " " + s.category + " " + typeOf(s).short + " " + (s.description || "") + " " + (s.filename || "") + " " + tagsOf(s).join(" ") + " " + kisOf(s).join(" ") + " " + (s.code || "")).toLowerCase();
      return terms.every(function (t) { return h.indexOf(t) > -1; });
    });
    if (state.show === "recent") out.sort(function (a, b) { return String(b.usedAt).localeCompare(String(a.usedAt)); }).splice(12);
    return out;
  }
  function forKi(id) { return list().filter(function (s) { return kisOf(s).indexOf(id) > -1; }); }

  /* ---- File name and download ---- */
  function fileName(s) {
    var base = String(s.filename || s.title || "script").replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").replace(/^\.+/, "")
      .replace(/\.(bat|cmd|ps1|sh|reg|txt)$/i, "");
    return (base || "script") + typeOf(s).ext;
  }
  function makeBlob(s, code) {
    var text = String(code).replace(/\r\n/g, "\n"), mime = "application/octet-stream";
    if (s.type === "sh") return new Blob([text], { type: mime });            // Linux and macOS need LF line endings
    var crlf = text.replace(/\n/g, "\r\n");                                  // Windows files use CRLF
    if (s.type === "reg") {                                                  // regedit expects UTF-16 with a byte order mark
      var u = new Uint16Array(crlf.length + 1); u[0] = 0xFEFF;
      for (var i = 0; i < crlf.length; i++) u[i + 1] = crlf.charCodeAt(i);
      return new Blob([u], { type: mime });
    }
    if (s.type === "ps1") return new Blob(["\uFEFF", crlf], { type: mime }); // BOM so Windows PowerShell reads non-English text
    return new Blob([crlf], { type: mime });
  }

  /* ---- Risk check and {{variables}} before copy or download ---- */
  function varsIn(code) {
    var out = [], re = /\{\{\s*([A-Za-z0-9_ .-]+?)\s*\}\}/g, m;
    while ((m = re.exec(code))) if (out.indexOf(m[1]) === -1) out.push(m[1]);
    return out;
  }
  function fillVars(s, code) {
    var names = varsIn(code);
    if (!names.length) return Promise.resolve(code);
    return new Promise(function (resolve) {
      var body = el("div", "kb-form"), inputs = {}, done = false;
      body.appendChild(el("p", "empty small", "This script has placeholders. Fill them in and they are replaced before copying or downloading."));
      names.forEach(function (n, i) {
        var d = el("div"), l = el("label", "", n), inp = el("input"); inp.type = "text"; inp.id = "sc-var-" + i; l.htmlFor = inp.id;
        inp.value = lastVars[n] || ""; inp.autocomplete = "off"; inputs[n] = inp; d.appendChild(l); d.appendChild(inp); body.appendChild(d);
      });
      function finish() {
        if (done) return; done = true;
        var out = code;
        names.forEach(function (n) {
          lastVars[n] = inputs[n].value;
          out = out.replace(new RegExp("\\{\\{\\s*" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\}\\}", "g"), function () { return inputs[n].value; });
        });
        resolve(out);
      }
      var h = SDT.modal.open({
        title: "Fill in: " + s.title, body: body, size: "sm", initialFocus: inputs[names[0]],
        onClose: function () { if (!done) { done = true; resolve(null); } },
        actions: [{ label: "Continue", kind: "primary", onClick: function () { finish(); } }, { label: "Cancel", kind: "ghost", cancel: true }]
      });
      body.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); finish(); h.close(); } });
    });
  }
  function gate(s, verb) {
    var risk = s.risk === "danger" ? SDT.modal.confirm({
      title: "This script is marked Dangerous", danger: true, confirmLabel: verb === "download" ? "Download anyway" : "Copy anyway",
      message: "\u201C" + s.title + "\u201D can change or delete data. Make sure you are on the right computer and understand what it does before you run it."
    }) : Promise.resolve(true);
    return risk.then(function (ok) { return ok ? fillVars(s, s.code) : null; });
  }
  function touch(s) {
    patch(s.id, function (x) { x.usedAt = new Date().toISOString(); });
    if (state.show === "recent") render();
  }
  function copyScript(s, mode) {
    return gate(s, "copy").then(function (code) {
      if (code == null) return;
      if (mode === "query") code = "reg query \"" + code + "\" /s";
      if (mode === "export") code = "reg export \"" + code + "\" \"%USERPROFILE%\\Desktop\\registry-export.reg\" /y";
      SDT.app.copy(code, "\u201C" + s.title + "\u201D copied", { skipGuard: true }); touch(s);
    });
  }
  function downloadScript(s) {
    if (typeOf(s).noFile) { toast("This type is copy-only"); return Promise.resolve(); }
    return gate(s, "download").then(function (code) {
      if (code == null) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(makeBlob(s, code)); a.download = fileName(s);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast("Downloaded " + fileName(s)); touch(s);
    });
  }

  /* ---- Editor ---- */
  function openEditor(id, preset) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? list().filter(function (r) { return r.id === id; })[0] : null;
    var src = cur || preset || {};
    var body = el("div", "kb-form");
    function field(label, ctl, idv, hint) {
      var d = el("div"); var l = el("label", "", label); l.htmlFor = idv; d.appendChild(l); d.appendChild(ctl);
      if (hint) d.appendChild(el("p", "empty small", hint));
      return d;
    }
    function input(idv, v) { var i = el("input"); i.type = "text"; i.id = idv; i.value = v || ""; i.autocomplete = "off"; return i; }

    var title = input("sc-title", src.title);
    var cat = input("sc-cat", src.category || state.category || ""); cat.setAttribute("list", "sc-cats");
    var dl = el("datalist"); dl.id = "sc-cats";
    categories().forEach(function (x) { var o = document.createElement("option"); o.value = x; dl.appendChild(o); });
    var type = el("select"); type.id = "sc-type";
    TYPE_ORDER.forEach(function (k) { var o = el("option", "", TYPES[k].label); o.value = k; type.appendChild(o); });
    type.value = TYPES[src.type] ? src.type : "bat";
    var risk = el("select"); risk.id = "sc-risk";
    Object.keys(RISKS).forEach(function (k) { var o = el("option", "", RISKS[k]); o.value = k; risk.appendChild(o); });
    risk.value = RISKS[src.risk] ? src.risk : "safe";
    var fname = input("sc-file", src.filename);
    var tags = input("sc-tags", tagsOf(src).join(", "));
    var kis = input("sc-kis", kisOf(src).join(", "));
    var desc = el("textarea"); desc.id = "sc-desc"; desc.rows = 2; desc.value = src.description || "";
    var code = el("textarea", "sc-code"); code.id = "sc-codebox"; code.rows = 16; code.value = src.code || "";
    code.spellcheck = false; code.setAttribute("wrap", "off"); code.setAttribute("autocapitalize", "off");
    var adminLab = el("label", "check"); var admin = el("input"); admin.type = "checkbox"; admin.checked = !!src.admin;
    adminLab.appendChild(admin); adminLab.appendChild(el("span", "", "Needs administrator rights"));
    var err = el("p", "form-error"); err.hidden = true;
    var codeHint = "Tab indents, Shift+Tab removes an indent, Ctrl+M lets Tab move between fields. Use {{name}} for a value you fill in when copying.";

    var fileField = field("File name (optional, without extension)", fname, "sc-file");
    function syncType() { var nf = !!(TYPES[type.value] || {}).noFile; fileField.hidden = nf; adminLab.hidden = nf; }
    type.addEventListener("change", syncType); syncType();

    var two = el("div", "two"); two.appendChild(field("Title", title, "sc-title")); two.appendChild(field("Category", cat, "sc-cat"));
    var two2 = el("div", "two"); two2.appendChild(field("Type", type, "sc-type")); two2.appendChild(fileField);
    var two3 = el("div", "two"); two3.appendChild(field("Risk", risk, "sc-risk", "Dangerous items ask for confirmation before copying or downloading."));
    two3.appendChild(field("Tags (comma separated)", tags, "sc-tags", "e.g. printer, spooler"));
    body.appendChild(two); body.appendChild(dl); body.appendChild(two2); body.appendChild(two3);
    body.appendChild(field("Linked KB articles (optional, comma separated)", kis, "sc-kis", "e.g. KB-002. The script then shows up inside that article."));
    body.appendChild(field("What it does (optional)", desc, "sc-desc"));
    body.appendChild(field("Code", code, "sc-codebox", codeHint));
    body.appendChild(adminLab); body.appendChild(err);

    var tabMoves = false;
    code.addEventListener("keydown", function (e) {
      if (e.ctrlKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault(); tabMoves = !tabMoves; toast(tabMoves ? "Tab now moves to the next field" : "Tab now indents"); return;
      }
      if (e.key !== "Tab" || tabMoves || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      var v = code.value, a = code.selectionStart, b = code.selectionEnd;
      if (a === b && !e.shiftKey) {
        if (!(document.execCommand && document.execCommand("insertText", false, "    "))) { code.value = v.slice(0, a) + "    " + v.slice(b); code.selectionStart = code.selectionEnd = a + 4; }
        return;
      }
      var ls = v.lastIndexOf("\n", a - 1) + 1, le = v.indexOf("\n", b); if (le === -1) le = v.length;
      var lines = v.slice(ls, le).split("\n"), first = 0, total = 0;
      lines = lines.map(function (l, i) {
        if (e.shiftKey) { var m = /^( {1,4}|\t)/.exec(l), r = m ? m[0].length : 0; if (i === 0) first = r; total += r; return l.slice(r); }
        return "    " + l;
      });
      code.value = v.slice(0, ls) + lines.join("\n") + v.slice(le);
      if (e.shiftKey) { code.selectionStart = Math.max(ls, a - first); code.selectionEnd = Math.max(code.selectionStart, b - total); }
      else { code.selectionStart = a + 4; code.selectionEnd = b + 4 * lines.length; }
    });

    function snap() { return [title.value, cat.value, type.value, risk.value, fname.value, tags.value, kis.value, desc.value, code.value, admin.checked].join("\u0000"); }
    var initial = snap(), secState = { ok: false };
    SDT.modal.open({
      title: cur ? "Edit script" : "New script", body: body, size: "lg", initialFocus: title,
      isDirty: function () { return snap() !== initial; },
      actions: [
        { label: "Save", kind: "primary", onClick: function (h) {
            if (!title.value.trim() || !cat.value.trim() || !code.value.trim()) { err.textContent = "Enter a title, a category and the code."; err.hidden = false; return false; }
            if (SDT.secrets && !SDT.secrets.gate(secState, [title.value, desc.value, code.value], "this script", h)) return false;
            var now = new Date().toISOString(), newCode = code.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            var rec = {
              id: cur ? cur.id : uid(), title: title.value.trim(), category: cat.value.trim(), type: type.value, filename: fname.value.trim(),
              admin: admin.checked, risk: risk.value, tags: csv(tags.value), kis: csv(kis.value).map(function (k) { return k.toUpperCase(); }),
              favorite: cur ? !!cur.favorite : false, usedAt: cur ? cur.usedAt : undefined,
              description: desc.value.trim(), code: newCode, history: cur ? versionsOf(cur) : [],
              createdAt: cur ? cur.createdAt : now, updatedAt: now
            };
            if (cur && (cur.code !== newCode || cur.title !== rec.title || cur.type !== rec.type)) {
              rec.history = [{ at: cur.updatedAt, title: cur.title, type: cur.type, code: cur.code }].concat(rec.history).slice(0, MAX_VERSIONS);
            }
            var all = list(); all = cur ? all.map(function (x) { return x.id === cur.id ? rec : x; }) : all.concat([rec]);
            save(all); openScripts[rec.id] = true; delete closedCats[rec.category];
            render(); toast("Script saved");
          } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  /* ---- Version history ---- */
  function openVersions(s) {
    var vs = versionsOf(s);
    var body = el("div", "sc-versions");
    if (!vs.length) body.appendChild(el("p", "empty", "No earlier versions yet. A version is kept each time you change the title, type or code."));
    var h;
    vs.forEach(function (v) {
      var d = el("details", "sc-ver"), sm = el("summary", "", fmt(v.at) + "  |  " + lineCount(v.code) + " lines  |  " + v.title);
      d.appendChild(sm);
      var pre = el("pre", "sc-pre"); pre.appendChild(el("code", "", v.code)); d.appendChild(pre);
      var b = el("button", "btn btn-sm", "Restore this version"); b.type = "button";
      b.addEventListener("click", function () {
        var snapAll = list(), now = new Date().toISOString();
        patch(s.id, function (x) {
          x.history = [{ at: x.updatedAt, title: x.title, type: x.type, code: x.code }].concat(versionsOf(x).filter(function (y) { return y !== v && y.at !== v.at; })).slice(0, MAX_VERSIONS);
          x.title = v.title; x.type = v.type; x.code = v.code; x.updatedAt = now;
        });
        h.close(); render(); toast("Version restored", function () { save(snapAll); render(); });
      });
      d.appendChild(b); body.appendChild(d);
    });
    h = SDT.modal.open({ title: "Version history: " + s.title, body: body, size: "lg", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }

  /* ---- Import and export ---- */
  function readText(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result), text = "";
      try { text = new TextDecoder(buf[0] === 0xFF && buf[1] === 0xFE ? "utf-16le" : "utf-8").decode(buf); } catch (e) { text = ""; }
      cb(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
    };
    r.onerror = function () { toast("Could not read that file"); };
    r.readAsArrayBuffer(file);
  }
  function importLibrary(text) {
    var data; try { data = JSON.parse(text); } catch (e) { toast("That is not a valid library file"); return; }
    var items = data && Array.isArray(data.scripts) ? data.scripts : null;
    if (!items) { toast("That file has no scripts in it"); return; }
    var all = list().slice(), added = 0, skipped = 0, ids = {};
    all.forEach(function (x) { ids[x.id] = true; });
    items.forEach(function (r) {
      if (!r || !r.title || !r.code || !r.category) { skipped++; return; }
      var dup = all.some(function (x) { return x.id === r.id || (x.title === r.title && x.category === r.category && x.code === r.code); });
      if (dup) { skipped++; return; }
      var rec = build({ title: String(r.title), category: String(r.category), type: TYPES[r.type] ? r.type : "txt", filename: r.filename, admin: r.admin, risk: RISKS[r.risk] ? r.risk : "safe", tags: tagsOf(r), description: r.description, code: String(r.code) }, new Date().toISOString());
      rec.kis = kisOf(r); rec.favorite = !!r.favorite; all.push(rec); added++;
    });
    save(all); render(); toast("Imported " + added + " script" + (added === 1 ? "" : "s") + (skipped ? ", skipped " + skipped + " already here or incomplete" : ""));
  }
  function exportLibrary() {
    var all = list(); if (!all.length) { toast("Nothing to export"); return; }
    var text = JSON.stringify({ app: "ServiceDeskToolkit", kind: "scripts", version: 1, exportedAt: new Date().toISOString(), scripts: all }, null, 2);
    var finish = function () {
      var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
      SDT.app.download("script-library-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json", text, "application/json");
      toast("Exported " + all.length + " scripts");
    };
    if (SDT.secrets) SDT.secrets.check([text], "the script library", "Export anyway").then(function (ok) { if (ok) finish(); }); else finish();
  }
  function importFile(file) {
    if (!file) return;
    if (file.size > 2000000) { toast("That file is too large"); return; }
    var m = /\.([a-z0-9]+)$/i.exec(file.name), ext = m ? m[1].toLowerCase() : "";
    readText(file, function (text) {
      if (ext === "json") { importLibrary(text); return; }
      var type = { bat: "bat", cmd: "bat", ps1: "ps1", sh: "sh", reg: "reg" }[ext] || "txt";
      var base = file.name.replace(/\.[^.]+$/, "");
      openEditor(null, { title: base.replace(/[_]+/g, " "), filename: base, type: type, code: text, admin: false });
    });
  }

  /* ---- Actions ---- */
  function duplicate(s) {
    var now = new Date().toISOString(), c = {};
    Object.keys(s).forEach(function (k) { c[k] = s[k]; });
    c.id = uid(); c.title = s.title + " (copy)"; c.createdAt = now; c.updatedAt = now; c.history = []; c.favorite = false; delete c.usedAt;
    save(list().concat([c])); openScripts[c.id] = true; render(); toast("Script duplicated");
  }
  function remove(s) {
    var snap = list();
    save(snap.filter(function (x) { return x.id !== s.id; })); render();
    toast("Script deleted", function () { save(snap); render(); });
  }
  function toggleFav(s) { patch(s.id, function (x) { x.favorite = !x.favorite; }); render(); }
  function kbExists(id) { return (store.get("kb", []) || []).some(function (a) { return a.id === id; }); }

  /* ---- Drawing ---- */
  function renderFilters() {
    var cs = $("sc-category"), ts = $("sc-typesel");
    cs.innerHTML = ""; var o = el("option", "", "All categories"); o.value = ""; cs.appendChild(o);
    categories().forEach(function (x) { var p = el("option", "", x); p.value = x; cs.appendChild(p); });
    cs.value = categories().indexOf(state.category) > -1 ? state.category : ""; state.category = cs.value;
    ts.innerHTML = ""; var t0 = el("option", "", "All types"); t0.value = ""; ts.appendChild(t0);
    TYPE_ORDER.forEach(function (k) { var p = el("option", "", TYPES[k].short); p.value = k; ts.appendChild(p); });
    ts.value = state.type;
    Array.prototype.forEach.call(document.querySelectorAll("#sc-show [data-show]"), function (b) {
      var on = b.getAttribute("data-show") === state.show; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("sc-search").value = state.query;
    var so = $("sc-sort"); if (so) so.value = state.sort;
    var sb = $("sc-select"); if (sb) { sb.setAttribute("aria-pressed", state.select ? "true" : "false"); sb.classList.toggle("active", state.select); }
  }

  function codeBlock(s) {
    var pre = el("pre", "sc-pre"); pre.tabIndex = 0; pre.setAttribute("aria-label", "Code of " + s.title);
    var c = el("code", "");
    var lines = String(s.code).split("\n");
    if (lines.length === 1) { c.textContent = s.code; pre.className += " one-line"; }
    else lines.forEach(function (l) { c.appendChild(el("span", "ln", l)); });
    pre.appendChild(c); return pre;
  }

  function drawScript(s) {
    var d = el("details", "sc-item"); d.open = !!openScripts[s.id]; d.setAttribute("data-id", s.id);
    d.addEventListener("toggle", function () { openScripts[s.id] = d.open; });
    var sum = el("summary", "sc-sum");
    if (state.select) {
      var cbx = el("input", "sel-box"); cbx.type = "checkbox"; cbx.checked = !!selected[s.id]; cbx.setAttribute("aria-label", "Select " + s.title);
      cbx.addEventListener("click", function (e) { e.stopPropagation(); }); cbx.addEventListener("change", function () { selected[s.id] = cbx.checked; renderBulk(); });
      sum.appendChild(cbx);
    }
    sum.appendChild(el("span", "sc-title", s.title));
    sum.appendChild(el("span", "tag", typeOf(s).short));
    if (s.admin && !typeOf(s).noFile) sum.appendChild(el("span", "tag sc-admin", "Admin"));
    if (s.risk === "changes") sum.appendChild(el("span", "tag sc-risk-changes", "Changes settings"));
    if (s.risk === "danger") sum.appendChild(el("span", "tag sc-risk-danger", "Dangerous"));
    if (varsIn(s.code).length) sum.appendChild(el("span", "tag", "Variables"));
    var star = el("button", "sc-star" + (s.favorite ? " on" : ""), s.favorite ? "\u2605" : "\u2606"); star.type = "button";
    star.setAttribute("aria-label", (s.favorite ? "Remove from favorites: " : "Add to favorites: ") + s.title); star.setAttribute("aria-pressed", s.favorite ? "true" : "false");
    star.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggleFav(s); });
    sum.appendChild(star);
    d.appendChild(sum);

    var filled = false;
    function fill() {   // the body is only built when the item is opened, so long lists stay fast
    if (filled) return; filled = true;
    var inner = el("div", "sc-body");
    if (s.description) inner.appendChild(el("p", "sc-desc", s.description));
    var meta = typeOf(s).noFile ? lineCount(s.code) > 1 ? lineCount(s.code) + " lines" : "" : fileName(s) + "  |  " + lineCount(s.code) + " lines" + (s.admin ? "  |  run as administrator" : "");
    if (s.usedAt) meta += (meta ? "  |  " : "") + "last used " + fmt(s.usedAt);
    if (meta) inner.appendChild(el("p", "result-meta", meta));
    inner.appendChild(codeBlock(s));

    var tg = tagsOf(s), ks = kisOf(s);
    if (tg.length || ks.length) {
      var chips = el("div", "sc-chips");
      tg.forEach(function (t) {
        var b = el("button", "tag tag-btn", "#" + t); b.type = "button"; b.setAttribute("aria-label", "Search tag " + t);
        b.addEventListener("click", function () { state.query = t; render(); }); chips.appendChild(b);
      });
      ks.forEach(function (k) {
        if (kbExists(k)) {
          var b = el("button", "tag tag-btn tag-ki", k); b.type = "button"; b.setAttribute("aria-label", "Open knowledge base article " + k);
          b.addEventListener("click", function () { SDT.kb.openArticle(k); global.location.hash = "#kb"; }); chips.appendChild(b);
        } else chips.appendChild(el("span", "tag", k));
      });
      inner.appendChild(chips);
    }

    var row = el("div", "sc-tools");
    function btn(label, kind, fn) { var b = el("button", "btn " + kind + " btn-sm", label); b.type = "button"; b.setAttribute("aria-label", label + " " + s.title); b.addEventListener("click", fn); return b; }
    row.appendChild(btn(s.type === "run" ? "Copy command" : s.type === "regpath" ? "Copy path" : "Copy code", "", function () { copyScript(s); }));
    if (s.type === "regpath") {
      row.appendChild(btn("Copy as reg query", "btn-ghost", function () { copyScript(s, "query"); }));
      row.appendChild(btn("Copy as reg export", "btn-ghost", function () { copyScript(s, "export"); }));
    }
    if (!typeOf(s).noFile) row.appendChild(btn("Download " + typeOf(s).ext, "", function () { downloadScript(s); }));
    row.appendChild(btn("Log in ticket", "btn-ghost", function () { SDT.ticket.logStep((s.type === "regpath" ? "Checked registry path: " : s.type === "run" ? "Ran command: " : "Ran script: ") + s.title); }));
    row.appendChild(btn("Edit", "btn-ghost", function () { openEditor(s.id); }));
    row.appendChild(btn("Duplicate", "btn-ghost", function () { duplicate(s); }));
    var nv = versionsOf(s).length;
    row.appendChild(btn("History" + (nv ? " (" + nv + ")" : ""), "btn-ghost", function () { openVersions(s); }));
    row.appendChild(btn("Delete", "btn-danger", function () { remove(s); }));
    inner.appendChild(row);
    d.appendChild(inner);
    }
    d.addEventListener("toggle", function () { if (d.open) fill(); });
    if (d.open) fill();
    return d;
  }

  function render() {
    renderFilters();
    var items = filtered(), box = $("sc-list"); box.innerHTML = "";
    var total = list().length;
    renderBulk();
    $("sc-summary").textContent = items.length + " of " + total + " items in " + categories().length + " categories";
    if (!items.length) {
      var msg = state.show === "favorites" ? "No favorites yet. Select the star on any item to keep it here."
        : state.show === "recent" ? "Nothing used yet. Copy or download an item and it shows up here."
        : total ? "Nothing matches. Try a different word or clear the filters." : "No scripts yet. Choose New script or Import file.";
      var empty = el("div", "empty-state"); empty.appendChild(el("p", "empty", msg));
      if (total && (state.query || state.category || state.type || state.show !== "all")) {
        var c = el("button", "btn btn-ghost btn-sm", "Clear filters"); c.type = "button";
        c.addEventListener("click", function () { state.query = ""; state.category = ""; state.type = ""; state.show = "all"; render(); });
        empty.appendChild(c);
      }
      box.appendChild(empty); return;
    }
    var by = {};
    items.forEach(function (s) { var k = state.show === "recent" ? "Recently used" : s.category; (by[k] = by[k] || []).push(s); });
    var searching = !!state.query.trim() || state.show !== "all";
    Object.keys(by).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (c) {
      var g = el("details", "sc-cat"); g.open = searching || !closedCats[c];
      g.addEventListener("toggle", function () { if (!searching) closedCats[c] = !g.open; });
      var h = el("summary", "sc-cat-sum");
      h.appendChild(dot(c)); h.appendChild(el("span", "sc-cat-name", c)); h.appendChild(el("span", "tag", String(by[c].length)));
      g.appendChild(h);
      var wrap = el("div", "sc-cat-body");
      if (state.show !== "recent") by[c].sort(cmp);
      by[c].forEach(function (s) { wrap.appendChild(drawScript(s)); });
      g.appendChild(wrap); box.appendChild(g);
    });
    if (pendingScroll) {
      var t = box.querySelector('[data-id="' + pendingScroll + '"]'); pendingScroll = null;
      if (t) setTimeout(function () { t.scrollIntoView({ block: "center" }); }, 30);
    }
  }

  function selectedIds() { return Object.keys(selected).filter(function (k) { return selected[k]; }); }
  function renderBulk() {
    var bar = $("sc-bulk"); if (!bar) return; bar.innerHTML = ""; bar.hidden = !state.select;
    if (!state.select) return;
    var n = selectedIds().length;
    bar.appendChild(el("span", "", n + " selected"));
    function b(label, kind, fn, dis) { var x = el("button", "btn btn-sm " + kind, label); x.type = "button"; x.disabled = !!dis; x.addEventListener("click", fn); bar.appendChild(x); }
    b("Select all shown", "btn-ghost", function () { filtered().forEach(function (s) { selected[s.id] = true; }); render(); });
    b("Change category...", "btn-ghost", function () {
      SDT.modal.prompt({ title: "Move " + n + " item" + (n === 1 ? "" : "s") + " to a category", label: "Category", value: "", confirmLabel: "Move" }).then(function (v) {
        if (v == null || !String(v).trim()) return;
        var ids = selectedIds(); save(list().map(function (x) { if (ids.indexOf(x.id) > -1) x.category = String(v).trim(); return x; })); render(); toast("Moved " + ids.length);
      });
    }, !n);
    b("Add tag...", "btn-ghost", function () {
      SDT.modal.prompt({ title: "Add a tag to " + n + " item" + (n === 1 ? "" : "s"), label: "Tag", value: "", confirmLabel: "Add tag" }).then(function (v) {
        v = String(v || "").trim().replace(/^#/, ""); if (!v) return;
        var ids = selectedIds(); save(list().map(function (x) { if (ids.indexOf(x.id) > -1 && tagsOf(x).indexOf(v) === -1) x.tags = tagsOf(x).concat([v]); return x; })); render(); toast("Tagged " + ids.length);
      });
    }, !n);
    b("Delete", "btn-danger", function () {
      var ids = selectedIds(), snap = list();
      save(snap.filter(function (x) { return ids.indexOf(x.id) === -1; })); selected = {}; render();
      toast("Deleted " + ids.length + " item" + (ids.length === 1 ? "" : "s"), function () { save(snap); render(); });
    }, !n);
  }

  function setAll(open) {
    filtered().forEach(function (s) { openScripts[s.id] = open; });
    if (open) closedCats = {};
    render();
  }
  function show(id) {
    state.query = ""; state.category = ""; state.type = ""; state.show = "all";
    openScripts[id] = true; closedCats = {}; pendingScroll = id;
  }

  function init() {
    list();
    var timer, pf = SDT.prefs ? SDT.prefs.get("scripts", {}) : {};
    state.category = pf.category || ""; state.type = pf.type || ""; state.show = pf.show || "all"; state.sort = pf.sort || "name";
    $("sc-search").addEventListener("input", function (e) { var v = e.target.value; clearTimeout(timer); timer = setTimeout(function () { state.query = v; render(); }, 120); });
    $("sc-category").addEventListener("change", function (e) { state.category = e.target.value; savePrefs(); render(); });
    $("sc-sort").addEventListener("change", function (e) { state.sort = e.target.value; savePrefs(); render(); });
    $("sc-select").addEventListener("click", function () { state.select = !state.select; if (!state.select) selected = {}; render(); });
    $("sc-typesel").addEventListener("change", function (e) { state.type = e.target.value; savePrefs(); render(); });
    Array.prototype.forEach.call(document.querySelectorAll("#sc-show [data-show]"), function (b) {
      b.addEventListener("click", function () { state.show = b.getAttribute("data-show"); savePrefs(); render(); });
    });
    $("sc-new").addEventListener("click", function () { openEditor(null); });
    $("sc-import").addEventListener("click", function () { $("sc-file-input").click(); });
    $("sc-file-input").addEventListener("change", function (e) { importFile(e.target.files[0]); e.target.value = ""; });
    $("sc-export").addEventListener("click", exportLibrary);
    $("sc-expand").addEventListener("click", function () { setAll(true); });
    $("sc-collapse").addEventListener("click", function () { setAll(false); });
  }

  SDT.scripts = { init: init, render: render, list: list, openEditor: openEditor, copy: copyScript, download: downloadScript, show: show, forKi: forKi, typeOf: typeOf };
})(window);
