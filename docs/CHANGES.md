# Changes in version 2026.11.11 (audit and hardening round)

Findings from inspecting the whole project, what was done, and how it was tested.

## Problems found and fixed

| Finding | Fix | Test |
|---|---|---|
| One `null` entry in a saved list (for example the KB) stopped the whole app from starting. | Lists and settings are checked when read. Unusable entries are dropped, wrong-typed values are replaced by a safe default, and the original is set aside. | `21-damaged-data`, `02-storage-hardening` |
| Records with missing or wrong-typed fields crashed eight places (reports, history, flows, checklists). | Records are repaired once at read time (`FIX` in `storage.js`) instead of patching each page. | `21-damaged-data` (every page and button, damaged data in every collection) |
| Damaged data was replaced by empty defaults and then overwritten on the next save (silent loss). | It is set aside first, shown in Settings, and can be downloaded. If the browser has no room, it is kept in memory for the session. | `02-storage-hardening`, `20-reliability...` |
| Restoring a backup deleted current data first, then wrote the new data. A failure part-way lost everything. | The backup is validated first (app id, safe names, list types, checksum). On failure the previous data is put back. A copy of current data is downloaded before restoring. | `02-storage-hardening` |
| Backup files could contain unsafe item names such as `__proto__`. | Names must match `^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`; `__proto__`, `constructor` and `prototype` are refused. | `02-storage-hardening` |
| Backups could be edited or damaged without notice. | Exports carry a checksum; a mismatch asks before restoring. Older backups without a checksum still restore. | `02-storage-hardening` |
| A save that did not fit in storage kept showing the old data on screen. | The newest value is read back for the session, and the warning stays. | `02-storage-hardening` |
| **Ticket history removed the 500th-oldest tickets first and downloaded the CSV afterwards.** A blocked download meant permanent loss. | Nothing is removed until you save the CSV and confirm it worked. "Not now" and "No, keep them" keep everything. | `20-reliability...` |
| The app could be open in two tabs and the last save silently overwrote the other. | A warning banner appears in both tabs. | `20-reliability...` |
| A 1-second timer ran all the time, even with the tab hidden. | `SDT.dom.every` sleeps while the tab is hidden and catches up on return. | review |
| Two empty placeholder files (`templates.js`, `troubleshooting.js`) were shipped. | Removed. | `21-damaged-data`, all suites |

## Improvements

- **Offline**: Content-Security-Policy that blocks all network access; a Works offline / Offline indicator; a no-JavaScript message; an inline icon (no favicon request).
- **Speed**: every script is `defer`red; the first paint is no longer blocked. Card bodies are built only when opened (done earlier). Measured with 900 tickets and 330 KB articles: every page renders in well under a second.
- **Code**: 66 copies of five small helper functions were replaced by one shared `dom.js` (about 4 KB less code, one place to fix bugs). IDs can no longer repeat within the same millisecond.
- **Safety**: text boxes have sensible length limits (300 characters, 60 000 for large text areas, and tighter limits on ticket fields).
- **Responsive**: tablet widths get the icon-only menu automatically; phone rules for touch-size controls, 16 px fields (stops zooming on iOS), wrapping toolbars and modals; grids use `min(…, 100%)` so nothing can force sideways scrolling; safe-area padding; print styles.
- **Documentation and tests**: this file, `README.md`, and 16 test files with a one-command runner (371 checks).

## Not changed on purpose

- No feature was removed. All existing data keeps working; unreadable records are set aside, not deleted.
- Normal storage stays the default. Large storage is opt-in because switching engines should be your decision.

## Not verified here

- Layout at real phone and tablet sizes in a real browser (no browser was available). The responsive rules are written defensively and the CSS validates, but please look at it on your devices.
- A real airplane-mode run, the real IndexedDB, and the backup-folder picker. They are covered by simulated tests only.
