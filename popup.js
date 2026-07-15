// OGcode Utils — popup. Settings live in chrome.storage.sync; the printer
// list is scraped live from an open OGcode tab when possible (cached in
// chrome.storage.local by the content script), with a snapshot from
// 2026-07-14 as last-resort fallback.

const SETTINGS_DEFAULTS = {
  enabled: true,
  printer: '',
  material: '',
  nozzle: '',
  nozzleTemp: '',
};

const FALLBACK_OPTIONS = {
  printers: [
    { group: 'Bambu Lab', value: 'A1', label: 'Bambu Lab A1' },
    { group: 'Bambu Lab', value: 'A1MINI', label: 'Bambu Lab A1 mini' },
    { group: 'Bambu Lab', value: 'P1S', label: 'Bambu Lab P1S' },
    { group: 'Bambu Lab', value: 'BAMBU_P2S', label: 'Bambu Lab P2S' },
    { group: 'Bambu Lab', value: 'H2S', label: 'Bambu Lab H2S' },
    { group: 'Bambu Lab', value: 'BAMBU_X1C', label: 'Bambu Lab X1C' },
    { group: 'Bambu Lab', value: 'BAMBU_X2D', label: 'Bambu Lab X2D' },
    { group: 'Bambu Lab', value: 'BAMBU_A2L', label: 'Bambu Lab A2L' },
    { group: 'Bambu Lab', value: 'BAMBU_H2C', label: 'Bambu Lab H2C' },
    { group: 'Bambu Lab', value: 'BAMBU_H2D', label: 'Bambu Lab H2D' },
    { group: 'Prusa', value: 'PRUSA_MK3S', label: 'Prusa MK3S' },
    { group: 'Prusa', value: 'PRUSA_MK4', label: 'Prusa MK4' },
    { group: 'Prusa', value: 'PRUSA_COREONE', label: 'Prusa CORE One' },
    { group: 'Prusa', value: 'PRUSA_COREONEL', label: 'Prusa CORE One L' },
    { group: 'Snapmaker', value: 'SNAPMAKER_U1', label: 'Snapmaker U1' },
    { group: 'Creality', value: 'CREALITY_K1', label: 'Creality K1' },
    { group: 'Creality', value: 'CREALITY_K1MAX', label: 'Creality K1 Max' },
    { group: 'Creality', value: 'CREALITY_K1C', label: 'Creality K1C' },
    { group: 'Creality', value: 'CREALITY_K2', label: 'Creality K2' },
    { group: 'Creality', value: 'CREALITY_K2PLUS', label: 'Creality K2 Plus' },
    { group: 'Creality', value: 'CREALITY_K2PRO', label: 'Creality K2 Pro' },
    { group: 'Elegoo', value: 'ELEGOO_CC', label: 'Elegoo Centauri Carbon' },
    { group: 'Elegoo', value: 'ELEGOO_CC2', label: 'Elegoo Centauri Carbon 2' },
    { group: 'Elegoo', value: 'ELEGOO_N4PRO', label: 'Elegoo Neptune 4 Pro' },
    { group: 'Elegoo', value: 'ELEGOO_N4PLUS', label: 'Elegoo Neptune 4 Plus' },
    { group: 'Elegoo', value: 'ELEGOO_N4MAX', label: 'Elegoo Neptune 4 Max' },
    { group: 'Other', value: 'CUSTOM', label: 'Custom code' },
  ],
  materials: ['PLA', 'PETG'],
  nozzles: ['0.4', '0.8', '1.4'],
};

const $ = (id) => document.getElementById(id);

function findOgcodeTab() {
  return chrome.tabs
    .query({ url: 'https://ogcode.dabi.design/*' })
    .then((tabs) => tabs[0] || null)
    .catch(() => null);
}

async function loadOptions() {
  // Prefer a live scrape from an open tab; fall back to cache, then snapshot.
  const tab = await findOgcodeTab();
  if (tab) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'get-options' });
      if (res && res.ok && res.options && res.options.printers.length) {
        return { options: res.options, source: 'live' };
      }
    } catch (e) {
      // No content script in that tab (e.g. license gate) — fall through.
    }
  }
  const { cachedOptions } = await chrome.storage.local.get('cachedOptions');
  if (cachedOptions && cachedOptions.printers && cachedOptions.printers.length) {
    return { options: cachedOptions, source: 'cache' };
  }
  return { options: FALLBACK_OPTIONS, source: 'fallback' };
}

function fillPrinterSelect(sel, printers, selected) {
  sel.textContent = '';
  const unchanged = new Option('— leave app default —', '');
  sel.appendChild(unchanged);
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
    // Saved printer no longer offered by the app — keep it visible but flagged.
    sel.appendChild(new Option(`${selected} (no longer in app?)`, selected));
  }
  sel.value = selected || '';
}

function fillSimpleSelect(sel, values, selected, unit) {
  sel.textContent = '';
  sel.appendChild(new Option('— leave app default —', ''));
  for (const v of values) sel.appendChild(new Option(unit ? `${v} ${unit}` : v, v));
  if (selected && !values.includes(selected)) sel.appendChild(new Option(selected, selected));
  sel.value = selected || '';
}

function setStatus(text, isError) {
  const el = $('status');
  el.textContent = text || '';
  el.className = isError ? 'err' : '';
}

async function saveSettings() {
  const temp = $('nozzleTemp').value.trim();
  await chrome.storage.sync.set({
    enabled: $('enabled').checked,
    printer: $('printer').value,
    material: $('material').value,
    nozzle: $('nozzle').value,
    nozzleTemp: temp && isFinite(parseFloat(temp)) ? temp : '',
  });
  setStatus('Saved. Applies on next OGcode load.');
}

async function applyNow() {
  const tab = await findOgcodeTab();
  if (!tab) {
    setStatus('No OGcode tab open.', true);
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'apply-now' });
    const report = (res && res.report) || {};
    const failed = Object.entries(report)
      .filter(([, r]) => r === 'not-found' || r === 'rejected' || r === 'unavailable')
      .map(([k, r]) => `${k}: ${r}`);
    setStatus(failed.length ? `Applied with issues — ${failed.join(', ')}` : 'Applied.',
      failed.length > 0);
  } catch (e) {
    setStatus('OGcode tab not ready (license screen?). Reload it and retry.', true);
  }
}

(async function init() {
  const settings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  const { options, source } = await loadOptions();

  fillPrinterSelect($('printer'), options.printers, settings.printer);
  fillSimpleSelect($('material'), options.materials, settings.material);
  fillSimpleSelect($('nozzle'), options.nozzles, settings.nozzle, 'mm');
  $('nozzleTemp').value = settings.nozzleTemp || '';
  if (options.nozzleTempRange) {
    const r = options.nozzleTempRange;
    $('tempHint').textContent = `app range ${r.min}–${r.max} °C (varies per combo; out-of-range values are clamped)`;
  }
  $('enabled').checked = settings.enabled;

  if (!settings.printer && !settings.material && !settings.nozzle && !settings.nozzleTemp) {
    setStatus('Pick your printer to get started — it will be preselected on every OGcode load.');
  } else if (source === 'fallback') {
    setStatus('Printer list is a built-in snapshot — open OGcode once to refresh it.');
  }

  for (const id of ['enabled', 'printer', 'material', 'nozzle', 'nozzleTemp']) {
    $(id).addEventListener('change', saveSettings);
  }
  $('applyNow').addEventListener('click', applyNow);
})();
