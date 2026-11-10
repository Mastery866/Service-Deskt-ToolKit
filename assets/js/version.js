/* version.js - the app version and a short list of changes. A "What's new" box opens once after an update. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};
  var CURRENT = "2026.11.11";
  var CHANGES = [
    { v: "2026.11.11", items: [
      "Safer data: damaged data is set aside instead of overwritten, restore is checked and can be undone, backups carry a checksum, and old tickets are only removed after you confirm a CSV copy was saved",
      "The app can no longer be stopped from starting by a damaged saved record",
      "Offline: a policy that blocks all network access, a Works offline indicator, and a warning when the app is open in two tabs",
      "Faster start (scripts no longer block the page), less duplicated code, background work pauses when the tab is hidden",
      "Better on tablets and phones; README and tests added"
    ] },
    { v: "2026.11.10", items: [
      "Ticket page: a What the user said box at the top. Flows and KIs are suggested from their own words, Ctrl+Enter starts the best flow, and the text is never saved to history",
      "Quick start chips in Probing questions: your pinned flows and the three you use most, one click to start",
      "Compact view for the ticket page (Compact button or Alt+D); Alt+W jumps to What the user said"
    ] },
    { v: "2026.11.09", items: [
      "Ticket page: grouped toolbar with icons, a note that the draft is kept, and the required fields shown as buttons that jump to the field",
      "Side column has tabs (Notes, Live preview, AI rewrite); Probing questions is step 2, can be collapsed, and shows a progress bar",
      "Probing questions: up to 3 suggested flows, category filters, clearer lists; Alt+Q jumps to the flow search",
      "Dark theme: search, date and number fields now match the theme; the user's local time understands PH, UTC+8 and city names"
    ] },
    { v: "2026.11.08", items: [
      "Starter content pack (Library home > Add starter content): 24 more KIs with questions to ask, 13 question flows, 40 scripts, run commands and registry paths, 7 checklists, 13 canned responses and 6 email templates",
      "You see what is new before anything is added, and importing it twice never makes duplicates"
    ] },
    { v: "2026.11.07", items: [
      "Question Flows for big libraries: categories, tags, owner and review date, a searchable picker in the ticket, sorting, bulk select, an outline and a visual map",
      "Flows: Not sure and None of these fit buttons, notes on answers, progress, KI steps beside the questions, and a result can continue into another flow",
      "Write a whole flow as text (Edit as text...) and turn any flow back into text",
      "Library home with a health check; Script Library has sorting, remembered filters, tags and bulk select",
      "Menu groups collapse, the menu can shrink to icons, pages can be pinned; Focus mode (Alt+F) for calls; a quick tour",
      "Command palette: filter chips, recent choices, and flows and checklists you can start from it",
      "Large storage (optional, in Settings) for libraries that outgrow normal browser storage"
    ] },
    { v: "2026.11.06.3", items: [
      "Create a KI from a finished ticket (History) or from the Knowledge gaps report",
      "Reports: Knowledge gaps and Question flows in use; flows show how often they were used",
      "Script Library: Log in ticket button; Checklists and Tools pages; press ? for keyboard shortcuts",
      "Ticket Generator: fill the name and hostname from the last ticket for the same User ID, and see the user's local time",
      "Settings: share packs with a preview before importing, and a backup check",
      "Warnings before saving or exporting scripts, flows and KB articles that look like they contain a password or key"
    ] },
    { v: "2026.11.06.2", items: [
      "Question Flows: probing questions that lead to the right KI (example: Unable to access VPN)",
      "Ticket Generator has a Probing questions panel: click the answers the user gives, apply the suggested KI, and add the questions to the work notes"
    ] },
    { v: "2026.11.06", items: [
      "New look: softer colours, rounded cards, grouped sidebar (Work, Library, Insights, App)",
      "Copy buttons added inside the Ticket details and Work notes live panels",
      "Ticket History and Knowledge Base details have a close button (or press Esc)",
      "Script Library: Run commands and Registry paths, risk levels, {{variables}}, tags, favorites, recently used, version history, links to KB articles, library export and import",
      "Scripts linked to a KB article show inside that article; a storage warning appears in the top bar when browser storage is 80% full"
    ] },
    { v: "2026.11.05.2", items: [
      "Script Library: save batch, PowerShell, shell and registry scripts by category; click to expand, copy or download as a ready-to-run file",
      "Import an existing .bat, .ps1, .sh or .reg file, then edit, duplicate or delete it; scripts also appear in the Ctrl+K palette"
    ] },
    { v: "2026.11.05", items: [
      "Reports page: outcomes, busy hours, KI effectiveness, repeat callers, weekly summary and KIs that need review",
      "Quick Reference page for commands, ports and error codes, with Copy buttons",
      "Ask the user: each KI can list questions to ask, shown beside your notes",
      "Guided mode: one step at a time with Done and Skip",
      "Ticket History filters by date, outcome and KI; the oldest tickets are saved to a CSV file before they are removed",
      "Storage meter, restore prompt on a fresh browser and a problem list in Settings",
      "KI version history, and an import preview that shows what is new or changed",
      "Several AI prompt presets, a check for card and ID numbers when copying, and desktop reminders for follow-ups"
    ] },
    { v: "2026.11.04", items: [
      "Automatic folder backup, repeat-caller lookup, escalation note, shift handoff and Email Templates",
      "Rewrite with AI in Temporary notes, Save and next, copyable commands in steps"
    ] }
  ];
  var el = window.SDT.dom.el;
  function body() {
    var wrap = el("div", "whatsnew");
    CHANGES.forEach(function (c) {
      wrap.appendChild(el("h3", "", "Version " + c.v));
      var ul = el("ul", "plain-list");
      c.items.forEach(function (i) { ul.appendChild(el("li", "", i)); });
      wrap.appendChild(ul);
    });
    return wrap;
  }
  function open() {
    if (SDT.modal.isOpen()) return;
    SDT.modal.open({ title: "What's new", body: body(), size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }
  function init() {
    var tag = document.getElementById("app-version"); if (tag) tag.textContent = "Version " + CURRENT;
    var b = document.getElementById("whatsnew-btn"); if (b) b.addEventListener("click", open);
    var seen = SDT.storage.get("seenVersion", null);
    SDT.storage.set("seenVersion", CURRENT);
    if (seen && seen !== CURRENT) setTimeout(open, 600);
  }
  SDT.version = { current: CURRENT, init: init, open: open };
})(window);
