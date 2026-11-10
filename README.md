# Service Desk Toolkit

An offline web app for service desk work: a **Ticket Generator** with guided troubleshooting, a **Knowledge Base**, **Question Flows** (probing questions that lead to the right KI), a **Script Library**, checklists, canned responses and email templates, reports, and backups.

**Everything stays on your computer.** The app never uses the internet, has no accounts and sends nothing anywhere.

## Start

1. Unzip the folder anywhere.
2. Open `index.html` in Chrome, Edge or Firefox. No install, no server, no internet needed.
3. Optional: in **Settings** choose a backup folder (Chrome/Edge) so the app saves copies automatically.

Press **Ctrl+K** for the command palette and **?** for every keyboard shortcut.

## Offline guarantees

- No external URLs, CDNs, fonts, scripts or API calls anywhere in the code. All icons are inline SVG.
- A Content-Security-Policy in `index.html` makes the browser refuse any network request (`connect-src 'none'`), form post, frame or plug-in.
- A **Works offline** indicator in the top bar changes to **Offline: all features work** when the connection drops.
- Test `20-reliability-security-offline` runs a full session and fails if any `fetch`, XHR, WebSocket, beacon or EventSource call is made.

## Where your data lives

| | |
|---|---|
| Normal mode | The browser's `localStorage` (about 5 MB). Keys start with `sdt.` |
| Large storage (optional) | IndexedDB, hundreds of MB. Turn it on in **Settings > Stored data**. Your data is copied and verified first, and the old copy stays until you free it. |
| Backups | Automatic copies to a folder you choose, manual JSON export, and **Restore** (Settings). Share packs (KB, flows, scripts, responses, templates, checklists) can be exported and imported with a preview. |

Safety features built into the storage layer (`assets/js/storage.js`):

- **Damaged data is set aside, never overwritten.** If a saved item cannot be read, a copy is kept (Settings > Stored data > Download the unreadable data) and the app carries on with a safe default.
- **Damaged records are repaired when read.** Wrong or missing fields are filled in with safe values, so one bad record cannot break a page.
- **Restore is checked and reversible.** A backup is validated first (right app, safe item names, lists really are lists, checksum). If the restore cannot finish, your previous data is put back. A copy of your current data is downloaded before any restore.
- **Old tickets are never removed silently.** When the history passes its limit (500, or 5000 in large storage) you are asked to save a CSV first, and tickets are only removed after you confirm the file was saved.
- **A save that does not fit** keeps the newest value in memory for the session and warns you, instead of showing stale data.
- A warning appears if the app is open in **two tabs** (the last tab to save would overwrite the other).

## Folder layout

```
index.html            the page (all views live here)
assets/css/           style.css (base), forms.css, responsive.css, modern.css (design system, loaded last)
assets/js/            one module per feature (table below); dom.js has the shared helpers
database/             built-in data: knowledge base, categories, templates, starter content pack
tests/                developer tests (not needed to use the app)
docs/CHANGES.md      what changed in the latest improvement round
```

### Modules (`assets/js`)

| File | What it does |
|---|---|
| `app.js` | bootstrap: theme, routing, shared helpers (toast with undo, copy, download), dashboard, follow-up reminders, global shortcuts, backup reminder on... |
| `backup.js` | automatic backup to a folder you choose (Chrome and Edge on a computer), plus a request to keep the browser data |
| `checklists.js` | checklists for repeating jobs (new laptop, offboarding, software install) |
| `commands.js` | commands inside steps |
| `dom.js` | small helpers shared by every module (one copy instead of one per file) |
| `email.js` | email templates: write once, fill from the open ticket, copy it or open it in your mail app |
| `errorlog.js` | keeps a short list of problems the app hit (script errors and failed promises) so they are easy to report |
| `escalation.js` | builds a ready-to-paste escalation note for the next team from the open ticket: user and machine, impact, urgency, error message, what the user... |
| `flows.js` | Question Flows (probing questions that lead to a KI) |
| `flowtext.js` | write a question flow as plain indented text, and turn a flow back into text |
| `guard.js` | looks for things that should not be copied into a ticket: passwords, card numbers, ID numbers |
| `handoff.js` | shift handoff summary: the tickets you handled, follow-ups still pending and tickets still open, as one block of text you can copy into an email... |
| `insights.js` | what to write next (knowledge gaps), how Question Flows perform, and the shift handover note |
| `knowledge-base.js` | KB browsing/search, article detail, favorites, recents, and KI management: create / edit / duplicate / merge / delete (with undo), review dates,... |
| `library.js` | Library home: what you have, what needs attention, what you used or changed lately |
| `modal.js` | accessible modal dialogs used across the app |
| `pager.js` | shared pagination for long lists (Knowledge Base, Ticket History, Favorites) |
| `palette.js` | command palette (Ctrl+K): jump to pages, run actions, apply KIs, templates, copy responses |
| `reference.js` | quick reference: commands, ports and error codes you look up often |
| `reports.js` | what your saved tickets say: outcomes, busy hours, how well each KI works, repeat callers, KIs that need a review, and a weekly summary you can copy |
| `scripts.js` | Script Library |
| `search.js` | KB search engine |
| `secrets.js` | looks for things that should not be saved or shared: passwords, keys and tokens |
| `settings.js` | defaults, ticket templates, backup / restore, stored-data overview, clear data |
| `sharepack.js` | share your work with a teammate in one file (Knowledge Base, flows, scripts, canned responses, email templates, checklists), with a preview before... |
| `shell.js` | how the app feels: collapsible menu groups, an icon-only menu, pinned pages, call focus mode, a quick tour, remembered filters, category colours... |
| `snippets.js` | canned responses: reusable messages with one-click copy |
| `storage.js` | safe wrapper around localStorage |
| `ticket-generator.js` | Ticket workflow |
| `ticket-history.js` | saved tickets: search, view, copy again, reopen, delete (with undo), export CSV |
| `tools.js` | small offline helpers (subnet calculator, text cleaner, timestamp converter, password generator) and the keyboard shortcut sheet (press ?) |
| `version.js` | the app version and a short list of changes |

### Conventions

- Each module is an IIFE that adds one object to `window.SDT` (for example `SDT.flows`). `app.js` wires them together at start-up.
- Shared helpers live in `dom.js`: `SDT.dom.el`, `$`, `uid`, `toast`, `today`, `csv`, `every`. Text is always set with `textContent`, so anything a user types is shown as text and never runs as HTML.
- Colours, spacing, radius and shadows are CSS variables in `assets/css/modern.css` (`:root` and `[data-theme="dark"]`). Use them instead of fixed colours. Text on accent or danger fills uses `--on-accent` / `--on-danger`.
- Deletes use an Undo toast; bigger actions use `SDT.modal.confirm`.
- To add a page: add a `<section class="view" id="view-NAME">` and a nav link with `data-view="NAME"` in `index.html`, add `NAME` to the views list in `app.js`, and give your module `init()` and `render()`.

## Tests

The app needs no install. The tests use `jsdom` to run the real page without a browser:

```
npm install        (once; downloads jsdom, fake-indexeddb, postcss for the tests only)
npm test           (runs all test files, about 2 minutes)
npm run perf       (timings with hundreds of tickets and KB articles)
```

What they cover: every page and button, data saving, close and reopen, damaged and hand-edited data, malicious backup files, script injection attempts, quota failures, the no-network guarantee, the large-storage switch (using a simulated IndexedDB), the flow text format, accessibility labels and colour contrast in both themes.

**What they do not cover** (please check these by hand): how the pages look at real phone and tablet sizes, a real airplane-mode run in a browser, the real IndexedDB in your browser, and the backup-folder feature (it needs a real file picker).

## If something looks wrong

- **A message says some saved data could not be read:** open Settings > Stored data and download the unreadable data before deleting it.
- **Storage warning in the top bar:** export a backup, then use large storage or remove old tickets.
- **Two-tab warning:** close the extra tab. The last one to save wins.
