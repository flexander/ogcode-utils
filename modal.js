// OGcode Utils — in-page UI. Runs after content.js and zip.js in the same
// isolated world, so it calls their helpers (applyDefaults, scrapeProfile,
// applyProfile, scrapeOptions, getSettings, triggerDownload,
// triggerBlobDownload, dataUrlToUint8Array, showToast, waitForElement,
// sleep, buildZip, ...) directly.
//
// Injects an orange "Utils" button into the app's header (drawn in the
// app's own .btn.btn-ghost style) and a modal built from the app's own
// help-modal CSS classes, so both inherit the native look — including the
// backdrop blur, z-index and responsive rules — without duplicating any of
// the app's styling.

const OGU_COG_SVG = `
<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/>
  <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.4"/>
  <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.95 3.05l-1.41 1.41M4.46 11.54l-1.41 1.41M12.95 12.95l-1.41-1.41M4.46 4.46L3.05 3.05"
        stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

const OGU_STYLE = `
.ogu-utils-btn{color:var(--accent)}
.ogu-utils-btn:hover{background:var(--surface-2);color:var(--accent-hover)}
.ogu-field{margin-bottom:12px}
.ogu-field .ogu-lbl{display:block;font-family:var(--font-mono);font-size:10px;font-weight:500;
  color:var(--text-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em}
.ogu-field select,.ogu-field input[type=number]{width:100%;padding:7px 9px;font-size:13px;
  font-family:var(--font-sans);background:var(--surface-2);color:var(--text);
  border:1px solid var(--border);border-radius:6px}
.ogu-field input[type=number]{font-family:var(--font-mono)}
.ogu-field select:hover,.ogu-field input[type=number]:hover{border-color:var(--border-strong)}
.ogu-field select:focus,.ogu-field input[type=number]:focus{outline:none;border-color:var(--accent)}
.ogu-hint{font-family:var(--font-mono);font-size:10px;color:var(--text-3);margin-top:3px;display:block}
.ogu-toggle{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2);
  font-family:var(--font-mono);cursor:pointer}
.ogu-toggle input{accent-color:var(--accent)}
.ogu-row{display:flex;gap:6px;margin-bottom:8px}
.ogu-row .btn{flex:1;justify-content:center}
.ogu-w100{width:100%;justify-content:center}
.ogu-file-label{border-style:dashed !important}
.ogu-file-label.has-file{border-style:solid !important;color:var(--text)}
.ogu-status{font-family:var(--font-mono);font-size:10px;color:var(--text-2);margin-top:8px;
  min-height:14px;line-height:1.5;white-space:pre-line}
.ogu-status.err{color:var(--danger)}
#oguFile{display:none}
`;

const OGU_MODAL_HTML = `
<div class="help-modal-backdrop" data-close="1"></div>
<div class="help-modal-content" role="dialog" aria-labelledby="oguTitle" style="max-width:460px">
  <div class="help-modal-header">
    <div class="help-modal-title">
      <span style="color:var(--accent);display:flex">${OGU_COG_SVG.replace('width="13" height="13"', 'width="15" height="15"')}</span>
      <span id="oguTitle" style="color:var(--text-3);font-family:var(--font-mono);font-size:13px;letter-spacing:.04em">OGcode Utils</span>
    </div>
    <div class="help-modal-actions">
      <button class="help-modal-close" id="oguCloseBtn" aria-label="Close Utils">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>
  <div class="help-modal-body">
    <section class="help-section">
      <div class="help-section-title">Defaults</div>
      <div class="ogu-field"><span class="ogu-lbl">Printer</span>
        <select id="oguPrinter"></select>
      </div>
      <div class="ogu-field"><span class="ogu-lbl">Material</span>
        <select id="oguMaterial"></select>
      </div>
      <div class="ogu-field"><span class="ogu-lbl">Nozzle</span>
        <select id="oguNozzle"></select>
      </div>
      <div class="ogu-field"><span class="ogu-lbl">Nozzle temp °C</span>
        <input type="number" id="oguNozzleTemp" min="150" max="350" step="5" placeholder="leave app default">
        <span class="ogu-hint" id="oguTempHint"></span>
      </div>
      <div class="ogu-field">
        <label class="ogu-toggle"><input type="checkbox" id="oguEnabled"> auto-apply on page load</label>
      </div>
      <button class="btn btn-primary ogu-w100" id="oguApplyNow">Apply now</button>
      <p class="ogu-status" id="oguStatus"></p>
    </section>
    <section class="help-section">
      <div class="help-section-title">Print profile</div>
      <div class="ogu-row">
        <button class="btn btn-outline" id="oguExport">Export current</button>
        <label class="btn btn-outline ogu-file-label" id="oguImportLabel" for="oguFile">Import file…</label>
        <input type="file" id="oguFile" accept="application/json,.json">
      </div>
      <button class="btn btn-primary ogu-w100" id="oguApplyProfile" disabled>Apply imported profile</button>
      <p class="ogu-status" id="oguProfileStatus"></p>
    </section>
    <section class="help-section">
      <div class="help-section-title">Export bundle</div>
      <p class="ogu-hint" style="margin-bottom:8px">
        Zips Body / Toolpath / Preview images of the current design (angled
        automatically for a good 3D view), and also triggers OGcode's own
        Save (Full project) and Download .gcode — those two land as their
        own files alongside the zip.
      </p>
      <button class="btn btn-primary ogu-w100" id="oguExportBundleBtn">Download bundle</button>
      <p class="ogu-status" id="oguBundleStatus"></p>
    </section>
  </div>
</div>`;

const OGU_PROFILE_KEYS = ['pattern', 'stitches', 'surfaceMode', 'blobs', 'arches', 'waves', 'floor', 'printer'];

let oguImportedProfile = null;

// Decides what to keep from an imported file: our own standalone export, or
// a full project save (only the print-settings keys are used). Shape-only
// saves are rejected — there'd be nothing to apply.
function extractProfile(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Not an OGcode file.');
  }
  if (parsed.format !== 'ogcode-print-profile' && parsed.format !== 'ogcode') {
    throw new Error('Not an OGcode file.');
  }
  const found = OGU_PROFILE_KEYS.filter((k) => parsed[k] !== undefined);
  if (!found.length) {
    throw new Error('This file has no print-profile sections (Pattern / Surface / Floor / Printer) '
      + '— likely a shape-only save.');
  }
  const profile = { appVersion: parsed.appVersion || null };
  for (const k of found) profile[k] = parsed[k];
  return { profile, found };
}

const $ogu = (id) => document.getElementById(id);

function oguSetStatus(id, text, isError) {
  const el = $ogu(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = `ogu-status${isError ? ' err' : ''}`;
}

function oguFillPrinterSelect(sel, printers, selected) {
  sel.textContent = '';
  sel.appendChild(new Option('— leave app default —', ''));
  const groups = new Map();
  for (const p of printers) {
    const name = p.group || 'Other';
    if (!groups.has(name)) {
      const og = document.createElement('optgroup');
      og.label = name;
      sel.appendChild(og);
      groups.set(name, og);
    }
    groups.get(name).appendChild(new Option(p.label, p.value));
  }
  if (selected && !printers.some((p) => p.value === selected)) {
    sel.appendChild(new Option(`${selected} (no longer in app?)`, selected));
  }
  sel.value = selected || '';
}

function oguFillSimpleSelect(sel, values, selected, unit) {
  sel.textContent = '';
  sel.appendChild(new Option('— leave app default —', ''));
  for (const v of values) sel.appendChild(new Option(unit ? `${v} ${unit}` : v, v));
  if (selected && !values.includes(String(selected))) sel.appendChild(new Option(selected, selected));
  sel.value = selected || '';
}

async function oguSaveSettings() {
  const temp = $ogu('oguNozzleTemp').value.trim();
  await chrome.storage.sync.set({
    enabled: $ogu('oguEnabled').checked,
    printer: $ogu('oguPrinter').value,
    material: $ogu('oguMaterial').value,
    nozzle: $ogu('oguNozzle').value,
    nozzleTemp: temp && isFinite(parseFloat(temp)) ? temp : '',
  });
  oguSetStatus('oguStatus', 'Saved. Applies on next OGcode load.');
}

async function oguApplyNow() {
  const settings = await getSettings();
  const report = await applyDefaults(settings);
  const failed = Object.entries(report)
    .filter(([, r]) => r === 'not-found' || r === 'rejected' || r === 'unavailable')
    .map(([k, r]) => `${k}: ${r}`);
  oguSetStatus('oguStatus',
    failed.length ? `Applied with issues — ${failed.join(', ')}` : 'Applied.',
    failed.length > 0);
}

function oguExportProfile() {
  try {
    const profile = scrapeProfile('ogcode-print-profile');
    triggerDownload('ogcode-print-profile.json', profile);
    oguSetStatus('oguProfileStatus', 'Exported — check your downloads.');
  } catch (e) {
    oguSetStatus('oguProfileStatus', `Export failed: ${e.message || e}`, true);
  }
}

async function oguHandleFileChosen(file) {
  if (!file) return;
  const label = $ogu('oguImportLabel');
  label.classList.remove('has-file');
  $ogu('oguApplyProfile').disabled = true;
  oguImportedProfile = null;
  try {
    const parsed = JSON.parse(await file.text());
    const { profile, found } = extractProfile(parsed);
    oguImportedProfile = profile;
    label.textContent = file.name;
    label.classList.add('has-file');
    $ogu('oguApplyProfile').disabled = false;
    oguSetStatus('oguProfileStatus', `Loaded: ${found.join(', ')}`);
  } catch (e) {
    label.textContent = 'Import file…';
    oguSetStatus('oguProfileStatus', e.message || 'Could not read that file.', true);
  }
}

async function oguApplyImportedProfile() {
  if (!oguImportedProfile) return;
  const report = await applyProfile(oguImportedProfile);
  const lines = [`Applied ${report.appliedCount}/${report.totalCount} settings.`];
  if (report.versionMismatch) {
    lines.push(`Imported from ${report.importedAppVersion}, this app is ${report.currentAppVersion}.`);
  }
  if (report.failedFields.length) {
    lines.push(`Could not apply: ${report.failedFields.join(', ')}`);
  }
  if (report.skippedFields.length) {
    lines.push(`${report.skippedFields.length} custom-printer field(s) skipped (printer isn't Custom).`);
  }
  oguSetStatus('oguProfileStatus', lines.join('\n'), report.failedFields.length > 0);
}

// --------------------------------------------------------------------------
// Export bundle: a zip of preview images (angled automatically) plus the
// app's own real Save-project and Download-gcode actions.
//
// The project save and G-code are generated entirely inside the app's own
// module scope and downloaded immediately as a Blob with no DOM trace — an
// isolated-world content script cannot intercept another world's Blob/URL
// calls, so we cannot read those bytes back into our zip. Instead we
// trigger the app's own real buttons for those two (genuine, full-fidelity
// files) and zip only what we can actually produce ourselves: the images.
// See PLAN.md for the full reasoning and the OrbitControls math below.

// Matches controls.rotateSpeed as configured by the app (verified against
// the exact pinned three.js OrbitControls source for this app's version —
// see PLAN.md). Only affects the *precision* of the second drag step below;
// if the app ever changes this, the resulting tilt is merely less exact,
// never degenerate (see oguNormalizeCameraAngle).
const OGU_ROTATE_SPEED = 0.9;
// Target elevation: 60° from vertical (phi) = 30° above the horizon — the
// same angle the app's own STL-import thumbnail renderer already uses.
const OGU_TARGET_PHI = Math.PI / 3;

const OGU_VIEW_MODES = [
  { id: 'modeBtnSmooth', name: 'body' },
  { id: 'modeBtnDepth', name: 'toolpath' },
  { id: 'modeBtnVolume', name: 'preview' },
];

function oguNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

// Dispatches a synthetic drag gesture on the 3D viewport canvas. OrbitControls
// attaches all of its pointer listeners directly on the canvas element (not
// window/document — verified against the pinned source), so this reaches it
// with no ambiguity. Purely vertical (constant clientX) so azimuth (left/right
// rotation) is never touched — only elevation.
function oguDispatchVerticalDrag(canvas, deltaY) {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const pointerId = 90210; // arbitrary fixed id for this synthetic gesture
  const base = { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true };
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: cx, clientY: cy, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: cx, clientY: cy + deltaY, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: cx, clientY: cy + deltaY, button: 0, buttons: 0 }));
}

// Two-step, fully deterministic angle reset that needs zero knowledge of the
// camera's current position (which we can't read — camera/controls are
// private to the app's module):
//   1. A huge downward drag clamps the polar angle to its lower bound (0,
//      the library default, unmodified by the app) — "straight down from
//      above", regardless of where it started.
//   2. A small, precisely computed upward drag moves it from that known 0
//      to our target elevation.
// If this throws for any reason, the caller treats it as best-effort and
// continues capturing at whatever angle already exists.
async function oguNormalizeCameraAngle() {
  const canvas = document.getElementById('viewportCanvas');
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  if (!rect.height) return false;

  oguDispatchVerticalDrag(canvas, rect.height * 20); // huge drag down -> clamps to phi = 0
  await sleep(50);

  const deltaY = -(OGU_TARGET_PHI * rect.height) / (2 * Math.PI * OGU_ROTATE_SPEED); // drag up -> phi: 0 -> target
  oguDispatchVerticalDrag(canvas, deltaY);
  await sleep(1500); // let the app's damped orbit controls settle visually

  return true;
}

function oguCaptureCanvas() {
  const canvas = document.getElementById('viewportCanvas');
  if (!canvas) return Promise.resolve(null);
  // Deferred to our own rAF: the app's render loop runs continuously via its
  // own requestAnimationFrame, so our callback (queued after theirs in the
  // same tick) sees that frame's freshly drawn pixels before the browser can
  // clear the (non-preserved) WebGL buffer. See PLAN.md.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function oguModeButtonAvailable(btn) {
  return !!btn && !btn.disabled && !btn.classList.contains('disabled');
}

// Switches through Body / Toolpath / Preview (whichever are available),
// capturing each, then restores whatever view the user had before we
// started. Camera *elevation* is left as oguNormalizeCameraAngle set it —
// there is no way to read/restore the user's exact prior angle.
async function oguCaptureViewImages() {
  const images = [];
  const skipped = [];
  const originalBtn = document.querySelector('.mode-btn.active');

  for (const { id, name } of OGU_VIEW_MODES) {
    const btn = document.getElementById(id);
    if (!btn) {
      skipped.push({ name, reason: 'control not found' });
      continue;
    }
    if (!oguModeButtonAvailable(btn)) {
      skipped.push({ name, reason: 'not available in the current mode' });
      continue;
    }
    btn.click();
    await oguNextFrame();
    await oguNextFrame();
    const dataUrl = await oguCaptureCanvas();
    if (!dataUrl) {
      skipped.push({ name, reason: 'could not capture image' });
      continue;
    }
    images.push({ name, dataUrl });
  }

  if (originalBtn && oguModeButtonAvailable(originalBtn)) originalBtn.click();
  return { images, skipped };
}

// Replicates: click Save -> name the file -> ensure "Full project" is
// selected (it's the default, but a user may have left it on "Profile
// only") -> click "Download as file". The app's own modal self-closes
// ~700ms after that click; we don't need to close it ourselves.
async function oguTriggerSaveProject(namePrefix) {
  const saveBtn = document.getElementById('saveBtn');
  const saveToFileBtn = document.getElementById('saveToFileBtn');
  if (!saveBtn || !saveToFileBtn) return 'not-found';

  saveBtn.click();
  await sleep(80); // modal's own name-field focus is on a 50ms setTimeout

  const nameInput = document.getElementById('saveNameInput');
  if (nameInput) nameInput.value = namePrefix;

  const projectRadio = document.querySelector('input[name="saveType"][value="project"]');
  if (projectRadio && !projectRadio.checked) {
    projectRadio.checked = true;
    projectRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (saveToFileBtn.disabled) return 'unavailable';
  saveToFileBtn.click();
  return 'applied';
}

function oguTriggerGcodeDownload() {
  const btn = document.getElementById('downloadBtn');
  if (!btn) return 'not-found';
  if (btn.disabled) return 'unavailable';
  btn.click();
  return 'applied';
}

// Mirrors the app's own buildExportDateTime() format ("YYYY-MM-DD HH-MM-SS")
// so our files sort and group together with the app's own downloads.
function oguBuildTimestampPrefix() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function oguExportBundle() {
  const btn = $ogu('oguExportBundleBtn');
  btn.disabled = true;
  oguSetStatus('oguBundleStatus', 'Angling the view…');
  try {
    const prefix = oguBuildTimestampPrefix();
    await oguNormalizeCameraAngle();

    oguSetStatus('oguBundleStatus', 'Capturing images…');
    const { images, skipped } = await oguCaptureViewImages();

    const lines = [];
    if (images.length) {
      const entries = images.map((img) => ({
        name: `${img.name}.png`,
        data: dataUrlToUint8Array(img.dataUrl),
      }));
      triggerBlobDownload(`${prefix} images.zip`, buildZip(entries));
      lines.push(`Zipped ${images.length} image(s): ${images.map((i) => i.name).join(', ')}.`);
    } else {
      lines.push('No images could be captured.');
    }
    for (const s of skipped) lines.push(`Skipped ${s.name}: ${s.reason}.`);

    const saveResult = await oguTriggerSaveProject(prefix);
    lines.push(
      saveResult === 'applied' ? 'Project file saved (see Downloads).'
        : saveResult === 'unavailable' ? 'Project save is unavailable right now.'
        : 'Could not find the Save button.'
    );

    const gcodeResult = oguTriggerGcodeDownload();
    lines.push(
      gcodeResult === 'applied' ? 'G-code downloaded.'
        : gcodeResult === 'unavailable' ? 'G-code download is unavailable right now (check build volume / profile).'
        : 'Could not find the Download .gcode button.'
    );

    oguSetStatus('oguBundleStatus', lines.join('\n'), skipped.length > 0 || !images.length);
  } catch (e) {
    oguSetStatus('oguBundleStatus', `Export failed: ${e.message || e}`, true);
  } finally {
    btn.disabled = false;
  }
}

// --------------------------------------------------------------------------
// Modal open/close — mirrors the app's own initHelpModal() behavior.

function openUtilsModal() {
  const modal = $ogu('oguUtilsModal');
  if (!modal) return; // gate page or injection failed
  refreshModalForm();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeUtilsModal() {
  const modal = $ogu('oguUtilsModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Re-read settings + live app state each time the modal opens, so it always
// shows current reality (printer list, temp range, stored settings).
async function refreshModalForm() {
  const settings = await getSettings();
  const options = scrapeOptions();
  if (!options) return;
  oguFillPrinterSelect($ogu('oguPrinter'), options.printers, settings.printer);
  oguFillSimpleSelect($ogu('oguMaterial'), options.materials, settings.material);
  oguFillSimpleSelect($ogu('oguNozzle'), options.nozzles, settings.nozzle, 'mm');
  $ogu('oguNozzleTemp').value = settings.nozzleTemp || '';
  if (options.nozzleTempRange) {
    const r = options.nozzleTempRange;
    $ogu('oguTempHint').textContent =
      `app range ${r.min}–${r.max} °C (varies per combo; out-of-range values are clamped)`;
  }
  $ogu('oguEnabled').checked = settings.enabled;
  if (!settings.printer && !settings.material && !settings.nozzle && !settings.nozzleTemp) {
    oguSetStatus('oguStatus', 'Pick your printer to get started — it will be preselected on every OGcode load.');
  }

  // #downloadBtn reflects whether the app currently has a valid, exportable
  // model (build volume ok, profile drawn) — reuse that as our own signal.
  const downloadBtn = document.getElementById('downloadBtn');
  $ogu('oguExportBundleBtn').disabled = downloadBtn ? downloadBtn.disabled : true;
}

// --------------------------------------------------------------------------
// Injection

function injectUtilsUI() {
  if ($ogu('oguUtilsBtn')) return; // idempotent

  const style = document.createElement('style');
  style.id = 'oguStyle';
  style.textContent = OGU_STYLE;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost ogu-utils-btn';
  btn.id = 'oguUtilsBtn';
  btn.title = 'OGcode Utils — defaults & print profiles';
  btn.innerHTML = `${OGU_COG_SVG} Utils`;

  const actions = document.querySelector('.header-actions');
  const resetBtn = document.getElementById('resetAllBtn');
  if (resetBtn && resetBtn.parentElement === actions) {
    resetBtn.after(btn);
  } else if (actions) {
    actions.prepend(btn);
  } else {
    return; // no header — bail without the modal either
  }

  const modal = document.createElement('div');
  modal.className = 'help-modal';
  modal.id = 'oguUtilsModal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = OGU_MODAL_HTML;
  document.body.appendChild(modal);

  btn.addEventListener('click', openUtilsModal);
  $ogu('oguCloseBtn').addEventListener('click', closeUtilsModal);
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close === '1') closeUtilsModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeUtilsModal();
  });

  for (const id of ['oguEnabled', 'oguPrinter', 'oguMaterial', 'oguNozzle', 'oguNozzleTemp']) {
    $ogu(id).addEventListener('change', oguSaveSettings);
  }
  $ogu('oguApplyNow').addEventListener('click', oguApplyNow);
  $ogu('oguExport').addEventListener('click', oguExportProfile);
  $ogu('oguFile').addEventListener('change', (e) => oguHandleFileChosen(e.target.files[0]));
  $ogu('oguApplyProfile').addEventListener('click', oguApplyImportedProfile);
  $ogu('oguExportBundleBtn').addEventListener('click', oguExportBundle);
}

(async function initModal() {
  const appReady = await waitForElement('#printerSelect');
  if (!appReady) return; // license gate page
  const header = await waitForElement('.header-actions');
  if (!header) return;
  injectUtilsUI();
})();
