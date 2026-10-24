// background.js — keeps the toolbar button in sync with Settings → Links ("Links menu in the Firefox toolbar").
// Firefox cannot hide a toolbar button from code, so "off" means the button is inactive (greyed out).
const api = typeof browser !== 'undefined' ? browser : chrome;

function applyMenuState(enabled) {
  try { if (enabled) api.browserAction.enable(); else api.browserAction.disable(); } catch (e) {}
}

// browser start / extension (re)load: read the saved setting (default: on)
api.storage.sync.get('gd_menu').then(r => applyMenuState(r.gd_menu !== false)).catch(() => {});

// the dashboard writes gd_menu when the switch is toggled (also arrives from other devices through Sync)
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.gd_menu) applyMenuState(changes.gd_menu.newValue !== false);
});
