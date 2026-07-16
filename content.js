// OGcode Utils — content script.
// Shared helpers driven by simulating real UI events on the app's own
// controls (never touching its internal JS state directly, since it's all
// private to an inline <script type="module"> with nothing exposed on
// window). Used by three features (the last two implemented in modal.js):
//   1. Defaults: applies the user's saved printer/material/nozzle/temp once
//      per page load. Never re-applies afterwards, so loading a saved
//      project or changing things by hand is never overridden.
//   2. Print profile import/export: sections 2-5 (Pattern, Surface texture,
//      Floor, Printer) as a standalone file, independent of the Shape
//      (section 1), so print settings can be reused across designs.
//   3. Export bundle: a zip of preview images alongside the app's own real
//      project-save and G-code downloads.

const POLL_MS = 200;
const POLL_TIMEOUT_MS = 8000;
const SETTLE_MS = 40;

const SETTINGS_DEFAULTS = {
  enabled: true,
  printer: '',    // '' = leave the app's default untouched
  material: '',
  nozzle: '',
  nozzleTemp: '', // °C; the app clamps to the valid range for the combo
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The license gate serves a page without #printerSelect; give up quietly there.
function waitForElement(selector, timeoutMs = POLL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

function getSettings() {
  return chrome.storage.sync.get(SETTINGS_DEFAULTS);
}

function escapeAttr(value) {
  return String(value).replace(/[\\"]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Generic DOM control helpers — one apply + one scrape function per control
// kind. These are the only functions PROFILE_FIELD_MAP entries call, so the
// declarative map and the DOM never drift apart from each other.

function applySelect(id, value) {
  if (value === '' || value == null) return 'unchanged';
  const sel = document.getElementById(id);
  if (!sel) return 'not-found';
  const target = String(value);
  const opt = Array.from(sel.options).find((o) => o.value === target);
  if (!opt) return 'not-found';
  if (sel.value === target) return 'already-set';
  sel.value = target;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  // The app's handler can veto the switch (custom-G-code confirm) by
  // resetting the value, so read it back.
  return sel.value === target ? 'applied' : 'rejected';
}

function scrapeSelect(id) {
  const sel = document.getElementById(id);
  return sel ? sel.value : undefined;
}

function applyButtonGroup(containerSelector, buttonClass, attr, value) {
  if (value === '' || value == null) return 'unchanged';
  const target = String(value);
  const btn = document.querySelector(
    `${containerSelector} ${buttonClass}[${attr}="${escapeAttr(target)}"]`
  );
  if (!btn) return 'not-found';
  if (btn.classList.contains('active')) return 'already-set';
  if (btn.disabled) return 'unavailable';
  btn.click();
  return btn.classList.contains('active') ? 'applied' : 'rejected';
}

function scrapeButtonGroup(containerSelector, buttonClass, attr) {
  const active = document.querySelector(`${containerSelector} ${buttonClass}.active`);
  return active ? active.getAttribute(attr) : undefined;
}

// Range sliders are bound to the 'input' event by the app. The browser
// clamps the assignment to the slider's current min/max, which the app
// adjusts per printer/material/mode combo — so an out-of-range value lands
// on the nearest allowed value instead of being rejected outright.
function applyRangeSlider(id, value) {
  if (value === '' || value == null) return 'unchanged';
  const el = document.getElementById(id);
  if (!el) return 'not-found';
  const num = parseFloat(value);
  if (!isFinite(num)) return 'unchanged';
  if (parseFloat(el.value) === num) return 'already-set';
  el.value = num;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return parseFloat(el.value) === num ? 'applied' : 'clamped';
}

function scrapeSlider(id) {
  const el = document.getElementById(id);
  return el ? parseFloat(el.value) : undefined;
}

function applyTextarea(id, value) {
  if (value === '' || value == null) return 'unchanged';
  const el = document.getElementById(id);
  if (!el) return 'not-found';
  if (el.value === value) return 'already-set';
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value === value ? 'applied' : 'rejected';
}

function scrapeTextarea(id) {
  const el = document.getElementById(id);
  return el ? el.value : undefined;
}

function applyNumberInput(id, value) {
  if (value === '' || value == null) return 'unchanged';
  const el = document.getElementById(id);
  if (!el) return 'not-found';
  const num = parseFloat(value);
  if (!isFinite(num)) return 'unchanged';
  if (parseFloat(el.value) === num) return 'already-set';
  el.value = num;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return parseFloat(el.value) === num ? 'applied' : 'rejected';
}

function scrapeNumberInput(id) {
  const el = document.getElementById(id);
  if (!el || el.value === '') return undefined;
  return parseFloat(el.value);
}

function applyToggle(id, desired) {
  if (desired == null) return 'unchanged';
  const el = document.getElementById(id);
  if (!el) return 'not-found';
  const current = el.getAttribute('aria-pressed') === 'true';
  if (current === !!desired) return 'already-set';
  el.click();
  return (el.getAttribute('aria-pressed') === 'true') === !!desired ? 'applied' : 'rejected';
}

function scrapeToggle(id) {
  const el = document.getElementById(id);
  return el ? el.getAttribute('aria-pressed') === 'true' : undefined;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  if (value === undefined) return;
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] = cur[keys[i]] || {};
  }
  cur[keys[keys.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Printer defaults (existing feature)

function applyPrinter(value) {
  return applySelect('printerSelect', value);
}

function applyGroupButton(groupId, attr, value) {
  return applyButtonGroup(`#${groupId}`, '.nozzle-btn', attr, value);
}

async function applyDefaults(settings) {
  // Order matters: the printer preset can reset material/nozzle, material
  // resets the temperature ranges, and nozzle availability depends on the
  // printer/material combo. Temperature therefore goes last.
  const report = {};
  report.printer = applyPrinter(settings.printer);
  await sleep(SETTLE_MS);
  report.material = applyGroupButton('materialGroup', 'data-material', settings.material);
  await sleep(SETTLE_MS);
  report.nozzle = applyGroupButton('nozzleGroup', 'data-nozzle', settings.nozzle);
  await sleep(SETTLE_MS);
  report.nozzleTemp = applyRangeSlider('sNozzleT', settings.nozzleTemp);
  await sleep(SETTLE_MS);
  return report;
}

// ---------------------------------------------------------------------------
// Toast (self-contained; the page's own showToast lives in another world)

function printerLabel(value) {
  const sel = document.getElementById('printerSelect');
  const opt = sel && Array.from(sel.options).find((o) => o.value === value);
  return opt ? opt.textContent.trim() : value;
}

function toastText(report, settings) {
  const applied = [];
  const failed = [];
  const note = (key, label) => {
    if (report[key] === 'applied') applied.push(label);
    else if (report[key] === 'not-found' || report[key] === 'rejected' || report[key] === 'unavailable')
      failed.push(`${label} (${report[key]})`);
  };
  note('printer', printerLabel(settings.printer));
  note('material', settings.material);
  note('nozzle', settings.nozzle && `${settings.nozzle} mm`);
  note('nozzleTemp', settings.nozzleTemp && `${settings.nozzleTemp} °C`);
  if (report.nozzleTemp === 'clamped') {
    const el = document.getElementById('sNozzleT');
    applied.push(`${el ? el.value : '?'} °C (clamped from ${settings.nozzleTemp})`);
  }
  if (!applied.length && !failed.length) return null; // everything already set/unchanged
  let text = '';
  if (applied.length) text += `Defaults applied: ${applied.join(' · ')}`;
  if (failed.length) text += `${text ? ' — ' : ''}could not apply: ${failed.join(', ')}`;
  return text;
}

function showToast(text, isError) {
  if (!text) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
    'max-width:340px', 'padding:10px 14px', 'border-radius:8px',
    'font:500 13px/1.4 system-ui,sans-serif', 'color:#fff',
    `background:${isError ? '#c0392b' : '#f45612'}`,
    'box-shadow:0 4px 16px rgba(0,0,0,.25)', 'pointer-events:none',
    'opacity:0', 'transition:opacity .25s',
  ].join(';');
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 4500);
}

// ---------------------------------------------------------------------------
// Option scraping — feeds the Utils modal's selects straight from the live
// DOM, so new printers the developer adds show up automatically.

function scrapeOptions() {
  const sel = document.getElementById('printerSelect');
  if (!sel) return null;
  const printers = [];
  for (const opt of sel.options) {
    const group = opt.parentElement instanceof HTMLOptGroupElement
      ? opt.parentElement.label : '';
    printers.push({ value: opt.value, label: opt.textContent.trim(), group });
  }
  const materials = Array.from(
    document.querySelectorAll('#materialGroup .nozzle-btn[data-material]')
  ).map((b) => b.dataset.material);
  const nozzles = Array.from(
    document.querySelectorAll('#nozzleGroup .nozzle-btn[data-nozzle]')
  ).map((b) => b.dataset.nozzle);
  // Current temp range is combo-dependent; the popup shows it as a hint only.
  const tempEl = document.getElementById('sNozzleT');
  const nozzleTempRange = tempEl
    ? { min: tempEl.min, max: tempEl.max, step: tempEl.step, value: tempEl.value }
    : null;
  return { printers, materials, nozzles, nozzleTempRange, scrapedAt: Date.now() };
}

function getAppVersion() {
  const el = document.getElementById('versionBadge');
  return el ? el.textContent.trim() : null;
}

// ---------------------------------------------------------------------------
// Print profile (sections 2-5: Pattern, Surface texture, Floor, Printer).
//
// One entry per leaf field. `path` addresses the field inside the exported
// JSON (matching the app's own serializeState('project', ...) shape exactly,
// including its own gaps — see README). `onlyWhenCustom` fields are only
// meaningful when the resolved printer is CUSTOM and are skipped otherwise
// (not a failure — the preset printers overwrite them anyway).
//
// Deliberately excluded (documented limitations, not oversights):
//   - pattern.effectors[] (x/y/z per slot) — positioned by dragging discs in
//     the WebGL 3D view, no plain input exists.
//   - blobs.dip / blobs.overhangAdapt, printer.firstLayerHeight /
//     printer.firstLayerWidth — live sliders in the app, but the app's own
//     serializeState never persists them either, so a project/profile file
//     never contains them in the first place.
const PROFILE_FIELD_MAP = [
  // --- pattern (section 2) ---
  { path: 'pattern.type', kind: 'select', id: 'patternType' },
  { path: 'pattern.amplitude', kind: 'slider', id: 'sAmp' },
  { path: 'pattern.frequency', kind: 'slider', id: 'sFreq' },
  { path: 'pattern.bubbleDensityZ', kind: 'slider', id: 'sBubbleDZ' },
  { path: 'pattern.diamondDensityZ', kind: 'slider', id: 'sDiamondDZ' },
  { path: 'pattern.hexDensityZ', kind: 'slider', id: 'sHexDZ' },
  { path: 'pattern.triDensityZ', kind: 'slider', id: 'sTriDZ' },
  { path: 'pattern.hwaveAmp', kind: 'slider', id: 'sHwaveAmp' },
  { path: 'pattern.hwaveThick', kind: 'slider', id: 'sHwaveThick' },
  { path: 'pattern.vwaveAmp', kind: 'slider', id: 'sVwaveAmp' },
  { path: 'pattern.vwaveThick', kind: 'slider', id: 'sVwaveThick' },
  { path: 'pattern.grooveTop', kind: 'slider', id: 'sGrooveTop' },
  { path: 'pattern.grooveBottom', kind: 'slider', id: 'sGrooveBottom' },
  { path: 'pattern.grooveFlank', kind: 'slider', id: 'sGrooveFlank' },
  { path: 'pattern.grooveRound', kind: 'slider', id: 'sGrooveRound' },
  { path: 'pattern.effectorEnabled', kind: 'toggle', id: 'cEffector' },
  { path: 'pattern.effectorRadius', kind: 'slider', id: 'sEffRadius' },
  { path: 'pattern.effectorStrength', kind: 'slider', id: 'sEffStrength' },
  { path: 'pattern.twist', kind: 'slider', id: 'sTwist' },
  { path: 'pattern.patternOffset', kind: 'slider', id: 'sPatternOffset' },
  { path: 'pattern.fadeIn', kind: 'slider', id: 'sFadeIn' },
  { path: 'pattern.fadeOut', kind: 'slider', id: 'sFadeOut' },
  { path: 'pattern.capBottom', kind: 'slider', id: 'sCapBottom' },
  { path: 'pattern.capTop', kind: 'slider', id: 'sCapTop' },

  // --- stitches (section 3, surfaceMode 'stitches') ---
  { path: 'stitches.depth', kind: 'slider', id: 'sStDepth' },
  { path: 'stitches.spacing', kind: 'slider', id: 'sStSpacing' },
  { path: 'stitches.length', kind: 'slider', id: 'sStLength' },
  { path: 'stitches.smooth', kind: 'slider', id: 'sStSmooth' },
  { path: 'stitches.phaseShift', kind: 'slider', id: 'sStPhase' },
  { path: 'stitches.bundle', kind: 'slider', id: 'sStBundle' },
  { path: 'stitches.zTilt', kind: 'slider', id: 'sStZTilt' },
  { path: 'stitches.flowMod', kind: 'slider', id: 'sStFlowMod' },
  { path: 'stitches.fadeIn', kind: 'slider', id: 'sStFadeIn' },
  { path: 'stitches.fadeOut', kind: 'slider', id: 'sStFadeOut' },

  // --- surface mode switch (section 3) ---
  { path: 'surfaceMode', kind: 'group', container: '#surfaceModeSwitch', buttonClass: '.pattern-tile', attr: 'data-mode' },

  // --- blobs / columns (section 3, surfaceMode 'blobs') ---
  { path: 'blobs.spacing', kind: 'slider', id: 'sBlobSpacing' },
  { path: 'blobs.size', kind: 'slider', id: 'sBlobSize' },
  { path: 'blobs.lean', kind: 'slider', id: 'sBlobLean' },
  { path: 'blobs.thread', kind: 'slider', id: 'sBlobThread' },
  { path: 'blobs.height', kind: 'slider', id: 'sBlobHeight' },
  { path: 'blobs.columnSpeed', kind: 'slider', id: 'sBlobColumnSpeed' },
  { path: 'blobs.threadSpeed', kind: 'slider', id: 'sBlobThreadSpeed' },
  { path: 'blobs.columnFlow', kind: 'slider', id: 'sBlobColumnFlow' },
  { path: 'blobs.columnLift', kind: 'slider', id: 'sBlobColumnLift' },
  { path: 'blobs.twist', kind: 'slider', id: 'sBlobTwist' },
  { path: 'blobs.fadeIn', kind: 'slider', id: 'sBlobFadeIn' },
  { path: 'blobs.fadeOut', kind: 'slider', id: 'sBlobFadeOut' },

  // --- arches / mesh (section 3, surfaceMode 'arches') ---
  { path: 'arches.spacing', kind: 'slider', id: 'sArchSpacing' },
  { path: 'arches.height', kind: 'slider', id: 'sArchHeight' },
  { path: 'arches.flow', kind: 'slider', id: 'sArchFlow' },
  { path: 'arches.cornerRound', kind: 'slider', id: 'sArchCornerRound' },
  { path: 'arches.overlap', kind: 'slider', id: 'sArchOverlap' },
  { path: 'arches.overhangAdapt', kind: 'slider', id: 'sArchOverhangAdapt' },
  { path: 'arches.footShift', kind: 'slider', id: 'sArchFootShift' },
  { path: 'arches.speed', kind: 'slider', id: 'sArchSpeed' },
  { path: 'arches.fadeIn', kind: 'slider', id: 'sArchFadeIn' },
  { path: 'arches.fadeOut', kind: 'slider', id: 'sArchFadeOut' },

  // --- waves / distortion (section 3, surfaceMode 'waves') ---
  { path: 'waves.depth', kind: 'slider', id: 'sWvDepth' },
  { path: 'waves.spacing', kind: 'slider', id: 'sWvSpacing' },
  { path: 'waves.length', kind: 'slider', id: 'sWvLength' },
  { path: 'waves.smooth', kind: 'slider', id: 'sWvSmooth' },
  { path: 'waves.fadeIn', kind: 'slider', id: 'sWvFadeIn' },
  { path: 'waves.fadeOut', kind: 'slider', id: 'sWvFadeOut' },
  { path: 'waves.flowMod', kind: 'slider', id: 'sWvFlowMod' },
  { path: 'waves.drift', kind: 'slider', id: 'sWvDrift' },
  { path: 'waves.amp', kind: 'slider', id: 'sWvAmp' },

  // --- floor (section 4) ---
  {
    path: 'floor.patternedFloor', kind: 'floorMode',
    container: '#floorModeSwitch', buttonClass: '.pattern-tile', attr: 'data-floor',
  },
  { path: 'floor.floorFill', kind: 'group', container: '#floorFillSwitch', buttonClass: '.pattern-tile', attr: 'data-fill' },
  { path: 'floor.bottomLayers', kind: 'slider', id: 'sBottom' },
  { path: 'floor.bottomHoleDiameter', kind: 'slider', id: 'sHoleD' },
  { path: 'floor.lampInnerDiameter', kind: 'slider', id: 'sLampID' },
  { path: 'floor.lampRingWall', kind: 'slider', id: 'sLampRingWall' },
  { path: 'floor.lampSpokeWidth', kind: 'slider', id: 'sLampSpokeWidth' },
  { path: 'floor.lampSpokes', kind: 'slider', id: 'sLampSpokes' },

  // --- printer (section 5) ---
  { path: 'printer.activePrinter', kind: 'select', id: 'printerSelect' },
  { path: 'printer.activeMaterial', kind: 'group', container: '#materialGroup', buttonClass: '.nozzle-btn', attr: 'data-material' },
  { path: 'printer.activeNozzle', kind: 'group', container: '#nozzleGroup', buttonClass: '.nozzle-btn', attr: 'data-nozzle' },
  { path: 'printer.nozzleTemp', kind: 'slider', id: 'sNozzleT' },
  { path: 'printer.bedTemp', kind: 'slider', id: 'sBedT' },
  { path: 'printer.layerHeight', kind: 'slider', id: 'sLayer' },
  { path: 'printer.lineWidth', kind: 'slider', id: 'sLine' },
  { path: 'printer.speed', kind: 'slider', id: 'sSpeed' },
  { path: 'printer.overhangSpeed', kind: 'slider', id: 'sOverhangSpeed' },
  { path: 'printer.overhangDetail', kind: 'slider', id: 'sOverhangDetail' },
  { path: 'printer.innerOverhangSpeed', kind: 'slider', id: 'sInnerOverhangSpeed' },
  { path: 'printer.innerOverhangDetail', kind: 'slider', id: 'sInnerOverhangDetail' },
  { path: 'printer.fanSpeed', kind: 'slider', id: 'sFan' },
  // Only meaningful once printer.activePrinter resolves to CUSTOM.
  { path: 'printer.customBuildVolume.x', kind: 'number', id: 'inCustomBVX', onlyWhenCustom: true },
  { path: 'printer.customBuildVolume.y', kind: 'number', id: 'inCustomBVY', onlyWhenCustom: true },
  { path: 'printer.customBuildVolume.z', kind: 'number', id: 'inCustomBVZ', onlyWhenCustom: true },
  { path: 'printer.customBedCenter.x', kind: 'number', id: 'inCustomCX', onlyWhenCustom: true },
  { path: 'printer.customBedCenter.y', kind: 'number', id: 'inCustomCY', onlyWhenCustom: true },
  { path: 'printer.startGcode', kind: 'textarea', id: 'startGcode', onlyWhenCustom: true },
  { path: 'printer.endGcode', kind: 'textarea', id: 'endGcode', onlyWhenCustom: true },
];

// Fields whose apply can trigger cascading UI changes (confirm dialogs,
// dependent-slider resets, panel visibility) — settle briefly after these.
const SETTLES_AFTER = new Set([
  'pattern.type', 'surfaceMode', 'floor.patternedFloor', 'floor.floorFill',
  'printer.activePrinter', 'printer.activeMaterial', 'printer.activeNozzle',
]);

function applyProfileField(field, value) {
  switch (field.kind) {
    case 'select': return applySelect(field.id, value);
    case 'slider': return applyRangeSlider(field.id, value);
    case 'textarea': return applyTextarea(field.id, value);
    case 'number': return applyNumberInput(field.id, value);
    case 'toggle': return applyToggle(field.id, value);
    case 'group': return applyButtonGroup(field.container, field.buttonClass, field.attr, value);
    case 'floorMode': {
      if (value == null) return 'unchanged';
      return applyButtonGroup(field.container, field.buttonClass, field.attr, value ? 'loose' : 'circular');
    }
    default: return 'error';
  }
}

function scrapeProfileField(field) {
  switch (field.kind) {
    case 'select': return scrapeSelect(field.id);
    case 'slider': return scrapeSlider(field.id);
    case 'textarea': return scrapeTextarea(field.id);
    case 'number': return scrapeNumberInput(field.id);
    case 'toggle': return scrapeToggle(field.id);
    case 'group': return scrapeButtonGroup(field.container, field.buttonClass, field.attr);
    case 'floorMode': {
      const mode = scrapeButtonGroup(field.container, field.buttonClass, field.attr);
      return mode === undefined ? undefined : mode === 'loose';
    }
    default: return undefined;
  }
}

function scrapeProfile(name) {
  const profile = {
    format: 'ogcode-print-profile',
    version: 1,
    name: name || '',
    savedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
  };
  for (const field of PROFILE_FIELD_MAP) {
    setPath(profile, field.path, scrapeProfileField(field));
  }
  return profile;
}

const FAILURE_STATUSES = new Set(['not-found', 'rejected', 'unavailable', 'error']);

// Best-effort: every field is applied independently, wrapped so one bad
// field (an app update renamed an id, a value the app rejects, a control
// that's disabled for the current combo) can never stop the rest of the
// batch from being attempted.
async function applyProfile(profile) {
  const currentAppVersion = getAppVersion();
  const importedAppVersion = profile.appVersion || null;
  const versionMismatch = !!(importedAppVersion && currentAppVersion
    && importedAppVersion !== currentAppVersion);

  // printer.activePrinter is processed before any onlyWhenCustom field (see
  // field order above), so by the time we reach those the live select
  // already reflects whatever actually took effect — including a rejected
  // switch (e.g. a cancelled confirm dialog), which the profile's own
  // intended value wouldn't capture.
  const results = {};
  const isCustomPrinterNow = () =>
    document.getElementById('printerSelect')?.value === 'CUSTOM';

  for (const field of PROFILE_FIELD_MAP) {
    const value = getPath(profile, field.path);
    let status;
    if (value === undefined) {
      status = 'unchanged';
    } else if (field.onlyWhenCustom && !isCustomPrinterNow()) {
      status = 'skipped';
    } else {
      try {
        status = applyProfileField(field, value);
      } catch (e) {
        status = 'error';
      }
    }
    results[field.path] = status;
    if (SETTLES_AFTER.has(field.path)) await sleep(SETTLE_MS);
  }

  const presentPaths = Object.keys(results).filter((p) => results[p] !== 'unchanged');
  const skippedFields = presentPaths.filter((p) => results[p] === 'skipped');
  const failedFields = presentPaths.filter((p) => FAILURE_STATUSES.has(results[p]));
  const appliedCount = presentPaths.filter((p) =>
    results[p] === 'applied' || results[p] === 'already-set' || results[p] === 'clamped').length;
  const totalCount = presentPaths.length - skippedFields.length;

  return {
    results,
    appliedCount,
    totalCount,
    failedFields,
    skippedFields,
    versionMismatch,
    currentAppVersion,
    importedAppVersion,
  };
}

function triggerBlobDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function triggerDownload(filename, jsonObj) {
  const json = JSON.stringify(jsonObj, null, 2);
  triggerBlobDownload(filename, new Blob([json], { type: 'application/json' }));
}

// Converts a canvas.toDataURL('image/png') string into raw bytes, for
// bundling captured view screenshots into a zip (see the Export bundle
// feature in modal.js).
function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Sent by background.js when the toolbar icon is clicked. openUtilsModal
  // is defined by modal.js (same isolated world, loaded after this script).
  if (msg && msg.type === 'open-utils-modal') {
    if (typeof openUtilsModal === 'function') openUtilsModal();
    sendResponse({ ok: true });
  }
});

(async function init() {
  const sel = await waitForElement('#printerSelect');
  if (!sel) return; // license gate page, or the app changed its markup
  const settings = await getSettings();
  if (!settings.enabled) return;
  const report = await applyDefaults(settings);
  const failed = Object.values(report).some((r) =>
    r === 'not-found' || r === 'rejected' || r === 'unavailable');
  showToast(toastText(report, settings), failed);
})();
