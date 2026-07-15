// OGcode Utils — in-page UI. Runs after content.js in the same isolated
// world, so it calls its helpers (applyDefaults, scrapeProfile,
// applyProfile, scrapeOptions, getSettings, triggerDownload, showToast,
// waitForElement, ...) directly.
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
}

(async function initModal() {
  const appReady = await waitForElement('#printerSelect');
  if (!appReady) return; // license gate page
  const header = await waitForElement('.header-actions');
  if (!header) return;
  injectUtilsUI();
})();
