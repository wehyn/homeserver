import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const settingsSource = await readFile(new URL("../app/launcher/settings-panel.tsx", import.meta.url), "utf8");
const systemSource = await readFile(new URL("../app/system-details-modal.tsx", import.meta.url), "utf8");

test("application fields use explicit labels and stable control ids", () => {
  assert.match(settingsSource, /<label htmlFor=\{titleId\}>Title<input id=\{titleId\}/);
  assert.match(settingsSource, /<label htmlFor=\{descriptionId\}>Description<input id=\{descriptionId\}/);
  assert.match(settingsSource, /aria-describedby=\{`\$\{tlsId\}-description`\}/);
  assert.match(settingsSource, /aria-describedby=\{`\$\{favoriteId\}-description`\}/);
  assert.doesNotMatch(settingsSource, /<label className="toggle-row">/);
});

test("modal implementations guard focus from stray positions", () => {
  assert.match(settingsSource, /getFocusableElements\(panelRef\.current\)/);
  assert.match(systemSource, /getFocusableElements\(panelRef\.current\)/);
  assert.match(settingsSource, /document\.activeElement !== first && document\.activeElement !== last/);
  assert.match(systemSource, /document\.activeElement !== first && document\.activeElement !== last/);
});
