import { escapeHtml as esc } from './equipment-controls.js';
import { venuePhotoPanel, venueScanPanel } from './venue-photo.js';
export function sitePanel(state,tent){
 const pole=tent.type==='pole';
 return `<h3>Where is your event?</h3><p class="equipment-note">Choose the actual setup surface. Your equipment stays in place.</p>${venuePhotoPanel(state.backgroundPhoto,state.venuePhotoStatus)}${venueScanPanel(state.venueScan)}<div class="site-options">${[
  ['grass','Backyard / grass','Grass setting with staked tent anchors.'],
  ['concrete','Concrete / pavement',pole?'Choose a frame tent for concrete ballast.':'Paved driveway with concrete tent blocks.'],
  ['asphalt','Asphalt driveway',pole?'Choose a frame tent for concrete ballast.':'Paved driveway with concrete tent blocks.'],
  ['notSure','I’m not sure yet','Keep planning; confirm the surface with your rental company.']
 ].map(([id,name,note])=>`<button type="button" class="site-option" data-role="site-surface" data-surface="${id}" aria-pressed="${state.surfaceType===id}"${pole&&['concrete','asphalt'].includes(id)?' disabled':''}><strong>${name}</strong><span>${tent.isSite&&id!=='notSure'?id==='grass'?'Grass outdoor setting.':'Paved outdoor setting.':note}</span></button>`).join('')}</div>${pole?'<p class="equipment-note">Pole tents need a suitable staking surface. For pavement, choose a frame tent first.</p><button type="button" class="btn-secondary" data-role="site-frame">Choose a frame tent</button>':!tent.isSite?'<p class="equipment-note">Concrete blocks are an installation preview. Your rental company confirms the required weights, quantities and ballast charge for this site.</p>':''}`;
}
