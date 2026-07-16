# Changelog

All notable changes to OGcode Utils are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Export bundle.** One click zips up Body, Toolpath, and Preview images of
  the current design — automatically angled for a good 3D view — and also
  triggers OGcode's own Save (Full project) and Download .gcode, so those
  land alongside the zip with matching filenames.

## [1.0.0] - 2026-07-16

First public release.

### Added

- **Default printer setup.** Automatically selects your printer — and,
  optionally, material, nozzle, and nozzle temperature — every time OGcode
  loads, so it no longer starts on "Bambu Lab A1". Any field can be left at
  the app's own default.
- **Utils button and window.** An orange "Utils" button in OGcode's header
  opens an in-app window (styled to match the app) with all the settings.
  The Chrome toolbar icon opens or focuses OGcode and brings up the same
  window.
- **Auto-apply toggle and Apply now.** Turn automatic application on or off,
  or apply your defaults immediately without reloading the page.
- **Print profile export.** Save a design's print settings — Pattern,
  Surface texture, Floor, and Printer, i.e. everything except the shape — to
  a file.
- **Print profile import.** Load those settings into any other design, or
  pull them out of a full OGcode project file. Imports apply everything they
  can, report exactly what was applied, and flag any OGcode version
  differences.
- **Settings sync** across your Chrome profile, plus a live printer list that
  picks up new printers OGcode adds without needing an extension update.

[Unreleased]: https://github.com/flexander/ogcode-utils/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/flexander/ogcode-utils/releases/tag/v1.0.0
