# OGcode Utils — Chrome Extension Plan

Set personal default values for OGcode's **Section 5 (Printer)** — printer model,
material, nozzle — so the app no longer starts on "Bambu Lab A1" every session.

## Why an extension works here (findings from the live app)

Inspected the unlocked app at `https://ogcode.dabi.design/` (single ~1.3 MB HTML
page, all JS inline, vanilla DOM — no React/Vue):

- **The app never persists the printer choice.** Its only cross-session
  localStorage state is saved projects (`LS_PREFIX`-keyed, loaded manually) and
  one viewer preference (`ogcode_bgBrightness`). On every load the DOM default
  `<option value="A1" selected>` wins. There is nothing to fight with — applying
  defaults once at page load is safe and won't stomp a project the user opens
  later.
- **Section 5 controls and how the app listens to them:**
  - Printer: `<select id="printerSelect">` with a `change` listener that calls
    `applyPrinterPreset(value)`. Setting `.value` + dispatching a bubbling
    `change` event from a content script triggers it (DOM events cross the
    isolated-world boundary).
  - Material: `#materialGroup .nozzle-btn[data-material="PLA"|"PETG"]` with
    `click` listeners → `.click()` works.
  - Nozzle: `#nozzleGroup .nozzle-btn[data-nozzle="0.4"|"0.8"|"1.4"]` with
    `click` listeners; the app itself rejects unavailable printer/material/nozzle
    combos (shows its own toast), so the extension can click and then verify.
  - The user's printer is `<option value="PRUSA_COREONE">Prusa CORE One</option>`.
- **Startup hazards are benign:** the "overwrite custom G-code?" `confirm()`
  only fires when leaving `CUSTOM`, and at page load `activePrinter` is `A1`,
  so applying defaults never triggers it. The `change` handler early-returns if
  the value is already active — idempotent.
- **License gate:** the site first serves a key-entry page (POST → cookie →
  full reload of the app document). The content script runs on both documents;
  on the gate page `#printerSelect` doesn't exist and the script must silently
  do nothing. After unlock it's a fresh page load, so the script runs again.

## Architecture (Manifest V3)

```
ogcode-defaults/
├── manifest.json        MV3; content script on https://ogcode.dabi.design/*
├── content.js           applies defaults at document_idle
├── popup.html/js/css    configure defaults + "Apply now"
└── icons/
```

**Permissions:** `storage` only, plus the single host match for the content
script. No background service worker, no activeTab, no broad host access.

### content.js

1. On `document_idle`, wait for `#printerSelect` to exist (short
   `MutationObserver`/poll with ~5 s give-up — covers the gate page and any
   future async init).
2. Read defaults from `chrome.storage.sync`
   (`{ printer, material, nozzle, enabled }`; any field may be `"unchanged"`).
3. Apply, in order: printer (set `select.value`, verify the option exists first,
   dispatch `new Event('change', { bubbles: true })`) → material (`.click()` the
   matching button) → nozzle (`.click()`, skip if `disabled`).
4. Verify: select value stuck and the intended buttons carry `.active`. Show a
   small self-injected toast ("OGcode defaults applied: Prusa CORE One · PLA ·
   0.8 mm") so a silent failure after an app update is noticeable.
5. Apply **once per page load only** — never re-apply on later DOM changes, so
   loading a saved project or manual changes are never overridden.
6. Also listen for a `"apply-now"` message from the popup (re-runs step 3).

### popup

- Dropdowns for printer / material / nozzle plus an on/off toggle, saved to
  `chrome.storage.sync` (syncs across the user's Chrome profiles).
- **Don't hardcode the printer list.** When an OGcode tab is open, message the
  content script to scrape live `<option>`s/buttons from the page, and cache the
  scraped list in storage as fallback. The dev ships new printers regularly
  (changelog shows Snapmaker/Elegoo/Bambu additions) — this keeps the extension
  maintenance-free as models are added.
- "Apply now" button that messages the active tab — useful right after
  installing/changing settings without a reload.

## Robustness / edge cases

| Case | Handling |
|---|---|
| License gate page | `#printerSelect` never appears → timeout, do nothing |
| App update renames IDs | verify step fails → toast "couldn't apply defaults", no crash |
| Section renumbering | irrelevant — targeting is by element ID, not "section 5" |
| Nozzle unavailable for combo | button `disabled` or app toast; extension reports what it could apply |
| Saved default printer removed from app | option-exists check fails → leave app default, warn in toast |
| User opens a saved project | one-shot apply happened at load; project's own `applyPrinterPreset` wins afterwards |

## Non-goals

- No interception of localStorage/project files, no page-world script
  injection, no patching of app functions — UI-event simulation is the only
  contact surface, which is the most stable one against app updates.
- Not a Web Store release (load unpacked via `chrome://extensions` → Developer
  mode); can be revisited if others in the Discord want it.
- Delete/retire the extension if the developer ships native defaults.

## Implementation order

1. `manifest.json` + minimal `content.js` with hardcoded `PRUSA_COREONE` — proves
   the event-dispatch approach end-to-end (~30 lines).
2. `chrome.storage.sync` config + apply/verify/toast logic.
3. Popup with live-scraped printer list and "Apply now".
4. Manual test matrix: fresh load, gate → unlock flow, load-saved-project
   (defaults must not reapply), unavailable nozzle combo.
