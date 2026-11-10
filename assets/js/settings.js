/* settings.js - defaults, ticket templates, backup / restore, stored-data overview, clear data. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var DEFAULTS = { tz: "", outcome: "", analystName: "", signNotes: false, notesStyle: "numbered", backupReminder: true, density: "comfortable", pageSize: 10, emailSignature: "", aiPrompt: "", followNotify: false, guardCopy: true, aiPresets: null, aiPreset: "", autoBackup: false, rememberTz: true, rememberOutcome: false, userIdPattern: "", hostPattern: "" };

  var $ = window.SDT.dom.$;
  var toast = window.SDT.dom.toast;

  /* ---- Preference values (used by other modules) ---- */
  function values() {
    var s = store.get("settings", {});
    return Object.assign({}, DEFAULTS, s && typeof s === "object" ? s : {});
  }
  function update(key, value) { var s = values(); s[key] = value; store.set("settings", s); if (SDT.app && SDT.app.applyPrefs) SDT.app.applyPrefs(); }

  /* ---- Backup ---- */
  function exportBackup() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    SDT.app.download("service-desk-toolkit-backup-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json",
      JSON.stringify(store.exportAll(), null, 2), "application/json");
    store.set("lastBackup", d.toISOString());
    render();
    toast("Backup downloaded");
  }
  function reload() {
    SDT.app.skipUnloadPrompt = true;
    setTimeout(function () { global.location.hash = "#ticket"; global.location.reload(); }, 700);
  }
  function importBackup(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast("That file is not valid JSON"); return; }
      if (!obj || obj.app !== "service-desk-toolkit" || !obj.data) { toast("That file is not a Service Desk Toolkit backup"); return; }
      var problems = store.validateBackup(obj);
      if (problems.length) { toast("This backup cannot be restored. " + problems[0]); return; }
      function restore(opts) {
        try { var d = new Date(); SDT.app.download("sdt-before-restore-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + ".json", JSON.stringify(store.exportAll()), "application/json"); } catch (e) {}
        try { store.importAll(obj, opts); } catch (e) { toast(e.message); return; }
        toast("Backup restored - reloading");
        reload();
      }
      SDT.modal.confirm({ title: "Restore this backup?", message: "This REPLACES all current data in this browser (KB edits, tickets, favorites).\n\nA copy of your current data is saved to a file first, in case you change your mind.", confirmLabel: "Restore backup", danger: true })
        .then(function (ok) {
          if (!ok) return;
          if (obj.checksum && obj.checksum !== store.checksumOf(obj.data)) {
            SDT.modal.confirm({ title: "This backup looks damaged", message: "The file does not match the check value saved with it, so it may be damaged or edited.\n\nRestore it anyway?", confirmLabel: "Restore anyway", danger: true }).then(function (ok2) { if (ok2) restore({ ignoreChecksum: true }); });
            return;
          }
          restore({});
        });
    };
    reader.onerror = function () { toast("Could not read that file"); };
    reader.readAsText(file);
  }

  /* ---- Rendering ---- */
  function row(label, value) {
    var li = document.createElement("li");
    li.textContent = label + ": " + value;
    return li;
  }
  function renderPresets() {
    var ul = $("set-presets");
    ul.innerHTML = "";
    var list = store.get("presets", []);
    if (!Array.isArray(list) || !list.length) {
      var e = document.createElement("li"); e.className = "empty small"; e.textContent = "No templates. In the Ticket Generator, apply KIs and choose Save current as template.";
      ul.appendChild(e); return;
    }
    list.forEach(function (p) {
      var li = document.createElement("li"); li.className = "follow-item";
      var t = document.createElement("span"); t.className = "follow-text";
      t.textContent = p.name + " (" + (p.kis || []).join(", ") + ")" + (p.outcome ? " - " + p.outcome : "");
      var del = document.createElement("button"); del.type = "button"; del.className = "btn btn-danger btn-sm"; del.textContent = "Delete";
      del.setAttribute("aria-label", "Delete template " + p.name);
      del.addEventListener("click", function () {
        var snap = list.slice();
        store.set("presets", list.filter(function (x) { return x.id !== p.id; }));
        renderPresets();
        toast("Template deleted", function () { store.set("presets", snap); renderPresets(); });
      });
      li.appendChild(t); li.appendChild(del); ul.appendChild(li);
    });
  }
  function renderAi() {
    var list = SDT.ticket.aiPresets(), sel = $("set-ai-select"), id = values().aiPreset;
    sel.innerHTML = "";
    list.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
    if (!list.some(function (p) { return p.id === id; })) id = (list.filter(function (p) { return p.id === "custom"; })[0] || list[0]).id;
    sel.value = id;
    var p = list.filter(function (x) { return x.id === id; })[0];
    $("set-ai-name").value = p.name; $("set-ai-prompt").value = p.prompt;
  }
  function render() {
    var kb = store.get("kb", []), tickets = store.get("tickets", []), tabs = store.get("ticketTabs", { tabs: [] });
    var size = JSON.stringify(store.exportAll()).length;
    var last = store.get("lastBackup", null);
    var ul = $("set-info");
    ul.innerHTML = "";
    ul.appendChild(row("Knowledge Base articles", kb.length));
    ul.appendChild(row("Saved tickets", tickets.length));
    ul.appendChild(row("Email templates", SDT.email.list().length));
    ul.appendChild(row("Open ticket tabs", (tabs.tabs || []).length));
    ul.appendChild(row("Approximate size", (size / 1024).toFixed(1) + " KB"));
    $("set-last").textContent = last ? "Last backup: " + new Date(last).toLocaleString() : "No backup made yet.";

    var v = values();
    $("set-tz").value = v.tz; $("set-outcome").value = v.outcome; $("set-name").value = v.analystName;
    $("set-sign").checked = !!v.signNotes; $("set-style").value = v.notesStyle; $("set-remind").checked = !!v.backupReminder;
    $("set-density").value = v.density; $("set-pagesize").value = String(v.pageSize);
    $("set-remtz").checked = !!v.rememberTz; $("set-remoutcome").checked = !!v.rememberOutcome;
    $("set-uidpat").value = v.userIdPattern || ""; $("set-hostpat").value = v.hostPattern || "";
    if (SDT.backup) SDT.backup.render();
    $("set-signature").value = v.emailSignature || ""; renderAi();
    $("set-guard").checked = v.guardCopy !== false; $("set-notify").checked = !!v.followNotify;
    var u = store.usage();
    $("set-meter-bar").style.width = u.pct + "%"; $("set-meter-bar").className = "meter-bar" + (u.pct >= 90 ? " bad" : u.pct >= 80 ? " warn" : "");
    $("set-meter-text").textContent = "About " + (u.chars / 1000000).toFixed(2) + " million of about 5 million characters used (" + u.pct + "%). " + (u.pct >= 80 ? "Export a backup and delete old tickets soon." : "");
    $("set-meter").setAttribute("aria-valuenow", String(u.pct));
    if (SDT.errors) SDT.errors.render();
    renderPresets();
  }

  function showSection(name) {
    Array.prototype.forEach.call(document.querySelectorAll("#set-tabs [data-sec]"), function (b) {
      var on = b.getAttribute("data-sec") === name;
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      b.classList.toggle("active", on);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#view-settings .settings-grid > .panel"), function (p) {
      p.hidden = p.getAttribute("data-sec") !== name;
    });
  }

  function init() {
    $("set-export").addEventListener("click", exportBackup);
    $("set-import").addEventListener("click", function () { $("set-file").click(); });
    $("set-file").addEventListener("change", function (e) { importBackup(e.target.files[0]); e.target.value = ""; });
    $("set-clear-history").addEventListener("click", function () {
      SDT.modal.confirm({ title: "Clear ticket history?", message: "Deletes ALL saved tickets and usage statistics. KB articles are not affected. You can undo right after.", confirmLabel: "Clear history", danger: true })
        .then(function (ok) {
          if (!ok) return;
          var t = store.get("tickets", []), u = store.get("usage", {});
          store.set("tickets", []); store.set("usage", {});
          render();
          toast("Ticket history cleared", function () { store.set("tickets", t); store.set("usage", u); render(); });
        });
    });
    $("set-clear-all").addEventListener("click", function () {
      SDT.modal.confirm({ title: "Erase all data?", message: "Erases EVERYTHING stored by this app: KB edits, favorites, tickets and open tabs. The starter KB is restored. This cannot be undone.", confirmLabel: "Erase everything", danger: true })
        .then(function (ok) {
          if (!ok) return;
          store.clearAll();
          toast("All data cleared - reloading");
          reload();
        });
    });
    // sections
    var secBtns = document.querySelectorAll("#set-tabs [data-sec]");
    Array.prototype.forEach.call(secBtns, function (b, i) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-sec")); });
      b.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!n) return;
        e.preventDefault();
        var next = secBtns[(i + n + secBtns.length) % secBtns.length];
        showSection(next.getAttribute("data-sec")); next.focus();
      });
    });
    showSection("backup");
    $("set-density").addEventListener("change", function (e) { update("density", e.target.value); });
    $("set-pagesize").addEventListener("change", function (e) { update("pageSize", parseInt(e.target.value, 10)); });
    $("set-remtz").addEventListener("change", function (e) { update("rememberTz", e.target.checked); });
    $("set-remoutcome").addEventListener("change", function (e) { update("rememberOutcome", e.target.checked); });
    [["set-uidpat", "userIdPattern", "User ID"], ["set-hostpat", "hostPattern", "Hostname"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function (e) {
        var v = e.target.value.trim();
        if (v) { try { new RegExp(v); } catch (err) { toast("That pattern is not valid"); e.target.value = values()[x[1]] || ""; return; } }
        update(x[1], v); toast(x[2] + " format saved");
      });
    });
    $("set-signature").addEventListener("change", function (e) { update("emailSignature", e.target.value.trim()); });
    $("set-ai-select").addEventListener("change", function (e) { update("aiPreset", e.target.value); renderAi(); });
    $("set-ai-save").addEventListener("click", function () {
      var name = $("set-ai-name").value.trim(), prompt = $("set-ai-prompt").value.trim();
      if (!name || !prompt) { toast("Enter a name and the instructions"); return; }
      var cur = $("set-ai-select").value;
      update("aiPresets", SDT.ticket.aiPresets().map(function (p) { return p.id === cur ? { id: p.id, name: name, prompt: prompt } : p; }));
      update("aiPreset", cur); renderAi(); toast("Prompt saved");
    });
    $("set-ai-new").addEventListener("click", function () {
      var p = { id: "p" + Date.now().toString(36), name: "New prompt", prompt: SDT.ticket.defaultAiPrompt };
      update("aiPresets", SDT.ticket.aiPresets().concat([p])); update("aiPreset", p.id); renderAi();
      $("set-ai-name").focus(); $("set-ai-name").select();
    });
    $("set-ai-del").addEventListener("click", function () {
      var list = SDT.ticket.aiPresets(), cur = $("set-ai-select").value;
      if (list.length <= 1) { toast("Keep at least one prompt"); return; }
      var snap = values().aiPresets, selSnap = values().aiPreset;
      update("aiPresets", list.filter(function (p) { return p.id !== cur; })); update("aiPreset", ""); renderAi();
      toast("Prompt deleted", function () { update("aiPresets", snap); update("aiPreset", selSnap); renderAi(); });
    });
    $("set-ai-reset").addEventListener("click", function () {
      update("aiPresets", null); update("aiPreset", ""); update("aiPrompt", ""); renderAi(); toast("Starter prompts restored");
    });
    $("set-guard").addEventListener("change", function (e) { update("guardCopy", e.target.checked); });
    $("set-notify").addEventListener("change", function (e) {
      var box = e.target;
      if (!box.checked) { update("followNotify", false); return; }
      if (!("Notification" in global)) { box.checked = false; toast("This browser does not support desktop notifications"); return; }
      Promise.resolve(global.Notification.requestPermission()).then(function (p) {
        if (p === "granted") { update("followNotify", true); toast("Desktop reminders are on while the app is open"); }
        else { box.checked = false; update("followNotify", false); toast("Notifications are blocked for this page in the browser"); }
      });
    });
    // defaults: saved as soon as they change
    $("set-tz").addEventListener("change", function (e) { update("tz", e.target.value.trim()); });
    $("set-outcome").addEventListener("change", function (e) { update("outcome", e.target.value); });
    $("set-name").addEventListener("change", function (e) { update("analystName", e.target.value.trim()); });
    $("set-sign").addEventListener("change", function (e) { update("signNotes", e.target.checked); });
    $("set-style").addEventListener("change", function (e) { update("notesStyle", e.target.value); });
    $("set-remind").addEventListener("change", function (e) { update("backupReminder", e.target.checked); });
  }

  SDT.settings = { init: init, render: render, values: values, update: update, exportBackup: exportBackup };
})(window);
