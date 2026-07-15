<img src="icons/icon128.png" width="64" align="left" alt="OGcode Utils icon">

# OGcode Utils

A little Chrome extension that makes [OGcode](https://ogcode.dabi.me/) — the
G-code generator for beautiful spiral-printed vases and lamps — remember
*your* setup.

<br clear="left">

## What it does

**Remembers your printer.** OGcode starts on "Bambu Lab A1" every time you
open it. If you print on something else, you've probably exported a file at
least once with the wrong printer selected. This extension picks your
printer (and material, nozzle, and nozzle temperature if you like)
automatically every time the page loads. A small orange note in the corner
confirms it happened.

**Saves your print settings.** Ever dialed in the perfect combination of
pattern, texture, floor, and printer settings — and wished you could use it
on your next design? You can export those settings to a file and load them
into any other design later. The shape itself stays untouched, so the same
"recipe" works on a vase today and a lampshade tomorrow. It can even pull
the settings out of a full project file you saved from OGcode itself.

## How to install

The extension isn't in the Chrome Web Store, so it's loaded manually — it
only takes a minute:

1. Download this project (green **Code** button, then **Download ZIP**) and
   unzip it somewhere you won't accidentally delete it
2. In Chrome, open `chrome://extensions`
3. Turn on **Developer mode** (top-right corner)
4. Click **Load unpacked** and choose the unzipped folder
5. Open OGcode — you'll see a new orange **Utils** button in the top bar

Chrome may occasionally ask if you want to keep developer-mode extensions.
That's normal for manually installed extensions — just keep it enabled.

## How to use it

Click the orange **Utils** button in OGcode's header (it sits right next to
Help, Load, Save, and Reset). A window opens with two sections:

**Defaults** — choose your printer, material, nozzle, and nozzle
temperature. Anything set to "leave app default" is left alone. From then
on, every time you open OGcode, your choices are already selected. The
auto-apply switch turns this on and off, and **Apply now** sets everything
immediately without reloading.

**Print profile** — **Export current** saves your design's print settings
(everything except the shape) as a file. **Import file** loads one back —
either a file you exported here, or a full project file saved from OGcode
itself. **Apply imported profile** then sets everything in one go and tells
you exactly what was applied.

You can also click the extension's icon in Chrome's toolbar at any time —
it jumps to your OGcode tab (or opens one) and brings up the Utils window.

## Good to know

- Your saved choices are never forced on you: they're applied once when the
  page loads, so loading a saved project or changing things by hand always
  wins.
- Settings follow your Chrome profile, so they come along if you use Chrome
  on another computer.
- If OGcode adds new printers, they show up in the Utils window
  automatically — no update needed.
- Each exported settings file remembers which OGcode version it came from.
  If you import it into a newer version of the app, you'll get a friendly
  heads-up in case something didn't carry over — whatever can be applied
  still is.
- Two things can't round-trip because OGcode's own save files don't include
  them: the "dip" and "overhang adapt" column sliders, and the exact
  positions of the draggable 3D effectors (whether they're enabled, and
  their range and strength, do carry over).
- If the OGcode developer ever builds these features into the app itself,
  this extension can happily retire.

## Questions or problems

Found a bug or have an idea? Open an issue here on GitHub. For OGcode
itself, visit [ogcode.dabi.me](https://ogcode.dabi.me/) or the OGcode
Discord.
