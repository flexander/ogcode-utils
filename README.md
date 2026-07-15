# OGcode Utils

Chrome extension that sets your own default **printer / material / nozzle /
nozzle temperature** in [OGcode](https://ogcode.dabi.design/) (Section 5),
instead of it starting on "Bambu Lab A1" every session. After installing,
click the toolbar icon once and pick your printer — until then everything is
left at the app's defaults. The popup matches OGcode's own dark theme
(DM Sans / JetBrains Mono, same palette).

## Install (load unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Open/reload OGcode — a small orange toast confirms "Defaults applied: …"

## Usage

- Click the toolbar icon to open the popup:
  - pick your default printer, material, nozzle, and nozzle temp ("— leave app
    default —" / empty temp skips that setting; out-of-range temps are clamped
    by the app to the valid range for the combo)
  - toggle **auto-apply** on/off
  - **Apply now** pushes the defaults to an already-open OGcode tab
- Settings sync across your Chrome profile (`chrome.storage.sync`).
- The popup's printer list is scraped live from the app when an OGcode tab is
  open (and cached), so new printers the developer adds appear automatically.

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
- popup shows the current printer list and "Apply now" works
