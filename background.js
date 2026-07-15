// OGcode Utils — service worker. The toolbar icon no longer opens a popup;
// it focuses (or opens) OGcode and pops the in-page Utils modal instead.

const OGCODE_URL = 'https://ogcode.dabi.design/';

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: `${OGCODE_URL}*` });
  if (tabs.length) {
    const tab = tabs[0];
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'open-utils-modal' });
    } catch (e) {
      // No content script in that tab (license gate) — focusing it is enough.
    }
  } else {
    await chrome.tabs.create({ url: OGCODE_URL });
  }
});
