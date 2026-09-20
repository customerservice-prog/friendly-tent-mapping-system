import { escapeHtml } from './equipment-controls.js';
import { dancePositions } from '../core/suggested-layout.js';

export function setupPanel(state, tent, hasObjects) {
  if(tent.isSite)return `<div class="quick-setup"><h3>Your outdoor space</h3><p class="equipment-note">Set your planning area. Inflatable model dimensions are illustrative unless confirmed by your rental company.</p><div class="outdoor-size"><label class="equipment-field">Width (ft)<input id="siteWidth" type="number" min="20" max="200" value="${state.siteWidthFt}"></label><label class="equipment-field">Length (ft)<input id="siteLength" type="number" min="20" max="200" value="${state.siteLengthFt}"></label></div><form id="quickSetupForm"><label class="equipment-field">How many seats?<input name="guests" type="number" min="1" max="1000" value="${state.guestCount||16}" required></label><input type="hidden" name="dance" value="0"><p class="equipment-note">Your inflatables stay in place. Suggested seating replaces the other items; Undo brings them back.</p><button class="btn-primary">Suggest Seating Around My Inflatables</button></form></div>`;
  const floors = [6,9,12,15,18,21,24].filter(ft => dancePositions(tent, ft).length);
  return `<form id="quickSetupForm" class="quick-setup">
    <p class="setup-tent">${escapeHtml(tent.name)} stays selected.</p>
    <div class="setup-fields"><label class="equipment-field" for="setupGuests">How many guests?
      <input id="setupGuests" name="guests" type="number" inputmode="numeric" min="1" max="1000" required value="${state.guestCount || 32}">
    </label>
    <label class="equipment-field" for="setupDance">Dance floor
      <select id="setupDance" name="dance"><option value="0">No dance floor</option>${floors.map(ft => `<option value="${ft}">${ft} × ${ft} ft</option>`).join('')}</select>
    </label>
    </div><p class="equipment-note setup-explanation">We’ll arrange tables with chairs around the tent poles and leave space for your dance floor. You can edit everything afterward.</p>
    ${hasObjects ? '<label class="setup-replace"><input type="checkbox" required> Replace the items in my current layout</label><p class="equipment-note">Undo restores your previous arrangement.</p>' : ''}
    <button class="btn-primary" type="submit">Build Suggested Layout</button>
    <button class="btn-tertiary" type="button" data-role="setup-manual">I’ll Design It Myself</button>
    <p class="equipment-note">If all guests won’t fit, we’ll tell you. Your tent won’t change automatically.</p>
  </form>`;
}

export const railIcons = {
  inflatables: '<path d="M3 21V8h18v13M3 8V3l3 3M21 8V3l-3 3M7 21v-9h10v9M1 21h22"/>',
  tent: '<path d="M3 19V10l9-7 9 7v9M3 10h18M12 3v16M1 21h22"/>',
  tables: '<ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M5 12v8m14-8v8M12 13v8"/>',
  chairs: '<path d="M6 13V4h12v9M4 13h16v4H4zM6 17v4m12-4v4"/>',
  dance: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  lighting: '<path d="M2 4q10 8 20 0M6 6v4m6-2v5m6-7v4"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="18" cy="12" r="2"/>',
  setup: '<path d="m4 20 12-12M14 3v3m5 1h3M4 5v4M2 7h4M17 16v5m-2-2h5"/>'
};
