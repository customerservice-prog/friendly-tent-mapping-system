// Start with a visible tent. Optional guest/seating setup lives in the designer,
// so customers never have to finish a questionnaire to reach their layout.
export function startIntake() {
  const bridge = window.FriendlyBridge;
  if (!bridge) return false;
  if (document.getElementById('step-designer')?.classList.contains('active')) return true;
  const tent = bridge.TENTS.find(t => t.type === 'pole' && t.widthFt === 20 && t.lengthFt === 20) || bridge.TENTS[0];
  if (!tent) {const inflatable=bridge.INFLATABLES?.[0];if(!inflatable)return false;bridge.openInflatablePreview(inflatable);window.dispatchEvent(new CustomEvent('rentsketch:designStarted',{detail:{productId:inflatable.productId}}));return true;}
  bridge.state.tentId = tent.id;
  bridge.state.guestCount = 0;
  bridge.customizeFromScratch();
  if (new URLSearchParams(location.search).get('demo') === '1' && window.RentSketchEventPass?.canEdit() === true && !bridge.getScene().objects.length) bridge.buildPartyScene();
  window.dispatchEvent(new CustomEvent('rentsketch:designStarted', { detail: { tentId: tent.id, productId: tent.productId } }));
  return true;
}
let attempts = 0;
(function start() {
  if (!startIntake() && ++attempts < 100) setTimeout(start, 50);
})();
