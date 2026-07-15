# OGcode Utils

Chrome extension that sets your own default **printer / material / nozzle /
nozzle temperature** in [OGcode](https://ogcode.dabi.design/) (Section 5),
instead of it starting on "Bambu Lab A1" every session — plus **print
profile import/export**. It adds an orange **Utils** button to OGcode's own
header that opens a native-looking modal (built from the app's own modal
styles). After installing, open Utils once and pick your printer — until
then everything is left at the app's defaults.

## Install (load unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Open/reload OGcode — a small orange toast confirms "Defaults applied: …"

## Usage

- An orange **Utils** button (cog icon) appears in OGcode's own header, next
  to Help / Load / Save / Reset. It opens a modal — same look and behavior
  as the app's Help dialog (Esc, backdrop click, or ✕ to close) — containing
  everything below.
- **Defaults** section:
  - pick your default printer, material, nozzle, and nozzle temp ("— leave app
    default —" / empty temp skips that setting; out-of-range temps are clamped
    by the app to the valid range for the combo)
  - toggle **auto-apply** on/off
  - **Apply now** pushes the defaults into the page immediately
- Settings sync across your Chrome profile (`chrome.storage.sync`).
- The printer list is read live from the app's own dropdown every time the
  modal opens, so new printers the developer adds appear automatically.
- The toolbar icon no longer opens a popup: clicking it focuses your OGcode
  tab (or opens one) and pops the Utils modal.

## Print profile (sections 2–5)

The second section of the Utils modal: save and reuse just the **print
settings** — Pattern, Surface texture, Floor, Printer (OGcode's own sections
2–5) — independent of the Shape (section 1), which is unique to each design.

- **Export current** downloads a `.json` snapshot of the current design's
  print settings.
- **Import file…** accepts either one of those exported files, or a full
  project file you saved from OGcode itself (`Save → Project`) — only the
  print-settings keys are read from it, the shape is ignored. A shape-only
  "profile" save (OGcode's own `Save → Profile`) is rejected with a clear
  error, since it has no print settings to import.
- **Apply imported profile** pushes the loaded file into the page
  and reports what happened: how many of the file's settings were
  applied, a list of any that couldn't be (e.g. a control the app has since
  renamed or removed), and how many custom-printer fields (build volume,
  start/end G-code) were skipped because the imported printer isn't "Custom".
  **Import never stops partway through on one bad field** — it always
  attempts every setting in the file and reports the full outcome at the end,
  rather than aborting.
- Every export is stamped with the OGcode app version (read from the
  version badge in its header) at export time. If you later import it into a
  different app version, the report flags the mismatch — it still applies
  everything it can, this is just a heads-up that some fields may not have
  mapped cleanly if the app changed in between.
- Known limitations, inherited from OGcode's own project-save format rather
  than introduced by this extension: the "dip" and "overhang adapt" column
  sliders aren't saved by OGcode's own project files either, so they don't
  round-trip here; and the 3D "Live effector" positions are set by dragging
  in the viewport, so only whether it's enabled and its radius/strength are
  restored, not the exact drag positions.

## How it works

A content script runs once per page load, waits for `#printerSelect` to exist,
then drives the app's own UI controls — sets the select and dispatches a real
`change` event, clicks the material/nozzle buttons — exactly as a human would.
It verifies the app accepted each value and reports via the toast.

It deliberately applies **only once per page load**: loading a saved project or
changing anything by hand afterwards is never overridden. On the license-key
gate page it does nothing. If the app rejects a value (e.g. nozzle unavailable
for the combo, or a printer removed from the app), the toast says so and the
app's default stays.

If OGcode ever ships native default settings, retire this extension.

## Testing

DOM-level tests run the content script against a saved copy of the real app
page in jsdom (see `PLAN.md` for design notes). Manual checklist after app
updates:

- fresh load applies defaults (toast appears, Section 5 shows your printer)
- license gate → unlock → defaults applied on the app page
- loading a saved project does **not** re-apply defaults
- orange Utils button appears in the header; modal opens and closes like the
  app's own Help dialog (✕, backdrop click, Esc)
- modal shows the current printer list and "Apply now" works
- toolbar icon focuses/opens the OGcode tab and pops the Utils modal
- export a print profile, re-import it on a fresh design, and confirm
  sections 2–5 match while the shape (section 1) is untouched
- import a full project file and confirm only sections 2–5 are picked up
- import a shape-only "profile" file and confirm it's rejected with a clear
  error rather than silently applying nothing
