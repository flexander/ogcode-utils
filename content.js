// OGcode Utils — content script.
// Applies the user's saved printer/material/nozzle once per page load by
// driving the app's own UI controls (real change/click events), then verifies
// the app accepted them. Never re-applies afterwards, so loading a saved
// project or changing things by hand is never overridden.

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

// ---------------------------------------------------------------------------
// Applying defaults

function applyPrinter(value) {
  if (!value) return 'unchanged';
  const sel = document.getElementById('printerSelect');
  if (!sel) return 'not-found';
  const opt = Array.from(sel.options).find((o) => o.value === value);
  if (!opt) return 'not-found';
  if (sel.value === value) return 'already-set';
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  // The app's handler can veto the switch (custom-G-code confirm) by
  // resetting the value, so read it back.
  return sel.value === value ? 'applied' : 'rejected';
}

function escapeAttr(value) {
  return String(value).replace(/[\\"]/g, '\\$&');
}

function applyGroupButton(groupId, attr, value) {
  if (!value) return 'unchanged';
  const btn = document.querySelector(
    `#${groupId} .nozzle-btn[${attr}="${escapeAttr(value)}"]`
  );
  if (!btn) return 'not-found';
  if (btn.classList.contains('active')) return 'already-set';
  if (btn.disabled) return 'unavailable';
  btn.click();
  return btn.classList.contains('active') ? 'applied' : 'rejected';
}

// Range sliders (nozzle temp) are bound to the 'input' event by the app.
// The browser clamps the assignment to the slider's current min/max, which
// the app adjusts per printer/material combo — so an out-of-range default
// lands on the nearest allowed value.
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
// Option scraping — keeps the popup's printer list in sync with the app
// without hardcoding it, so new printers show up automatically.

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

function cacheOptions() {
  const options = scrapeOptions();
  if (options) chrome.storage.local.set({ cachedOptions: options });
}

// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'apply-now') {
    (async () => {
      const settings = await getSettings();
      const report = await applyDefaults(settings);
      showToast(toastText(report, settings));
      sendResponse({ ok: true, report });
    })();
    return true; // async response
  }
  if (msg && msg.type === 'get-options') {
    sendResponse({ ok: true, options: scrapeOptions() });
  }
});

(async function init() {
  const sel = await waitForElement('#printerSelect');
  if (!sel) return; // license gate page, or the app changed its markup
  cacheOptions();
  const settings = await getSettings();
  if (!settings.enabled) return;
  const report = await applyDefaults(settings);
  const failed = Object.values(report).some((r) =>
    r === 'not-found' || r === 'rejected' || r === 'unavailable');
  showToast(toastText(report, settings), failed);
})();
