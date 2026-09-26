// Versioned visual evidence for procedural assets. A reviewed catalog photograph
// informs appearance; it does not verify dimensions, engineering or availability.
export const ASSET_SCHEMA_VERSION=1;
export const EQUIPMENT_ASSET_VERSION='2026.09.26.1';
export const HERO_EQUIPMENT_TYPES=['foam-machine','fan','cooler','fill-chill','stanchion','podium','cotton-candy','popcorn','snow-cone'];
const references={
  'foam-machine':['fpr:foam-party-machine','foam-party-machine','Yellow tapered cannon, black tripod, handle and supply hose.'],
  fan:['fpr:20-inch-fan','20-inch-fan','Three metal blades, wire cage, black pedestal and round base.'],
  cooler:['fpr:120-quart-hard-ice-chest-cooler','120-quart-hard-ice-chest-cooler','Navy insulated chest, light lid, side handles and drain.'],
  'fill-chill':['fpr:4ft-fill-and-chill-table','4ft-fill-and-chill-table','Black open basin, drain and folding tubular legs.'],
  stanchion:['fpr:crowd-control-stanchion','crowd-control-stanchion','Single black post with a retractable belt head; no invented second post or rope.'],
  podium:['fpr:podium-and-microphone','podium-and-microphone','Black lectern with tapered base, angled reading surface and gooseneck microphone.'],
  'cotton-candy':['fpr:cotton-candy-machinefloss-maker','cotton-candy-machinefloss-maker','Pink countertop base, stainless open bowl, control panel and central spinner.'],
  popcorn:['fpr:popcorn-machine','popcorn-machine','Red header, clear enclosure, suspended kettle, serving flap and rubber feet.'],
  'snow-cone':['fpr:snow-cone-machine','snow-cone-machine','Blue housing, metal ice hopper, pressing handle, clear bin and drain.'],
};
const operational={
  'foam-machine':'foam-emission',fan:'fan-rotation','bubble-machine':'bubble-emission','fog-machine':'fog-emission','confetti-machine':'confetti-emission',
  'cotton-candy':'spinner-rotation',popcorn:'kettle-agitation','snow-cone':'ice-shaving','chocolate-fountain':'liquid-flow',fountain:'liquid-flow',generator:'engine-idle',heater:'heat-glow',speaker:'speaker-playback',karaoke:'screen-playback',screen:'screen-playback',photobooth:'photo-preview',
};
export function canonicalEquipmentType(type){return {'photo-booth':'photobooth','tumbling-blocks':'tumbling-timbers','service-table':'fill-chill'}[type]||type||'generic';}
export function equipmentOperationProfile(type){
  const key=canonicalEquipmentType(type),id=operational[key]||'static';
  return {id,supported:id!=='static',defaultState:id==='static'?'off':'running',description:id==='static'?'Static rental equipment':'Visual operating preview; power, water and installation are not verified'};
}
export function equipmentAssetDescriptor(product={},type){
  type=canonicalEquipmentType(type||product.type||product.accessoryType);
  const source=references[type],externalId=product.externalId||product.external_id||null;
  const matching=!!source&&externalId===source[0],width=Number(product.width_ft),depth=Number(product.length_ft);
  const supplied=product.dimensionsConfirmed===true||(width>0&&depth>0);
  return {
    schemaVersion:ASSET_SCHEMA_VERSION,assetId:'procedural/'+type,version:EQUIPMENT_ASSET_VERSION,units:'feet',origin:'ground-center',forwardAxis:'+Z',
    fidelity:type==='generic'?'footprint':matching?'photo-referenced-procedural':HERO_EQUIPMENT_TYPES.includes(type)?'detailed-procedural':'illustrative-procedural',
    source:{kind:matching?'catalog-photo':'procedural-profile',productId:product.isPreview?null:product.productId||product.id||null,externalId,referenceUrl:matching?'https://www.friendlypartyrental.com/api/item-image/'+source[1]:null,referenceReviewedAt:matching?'2026-09-26':null,notes:matching?source[2]:'Representative model; not a verified reproduction of this SKU.'},
    dimensions:{status:supplied?'catalog-supplied':'unverified',source:supplied?'tenant-catalog':'illustrative-profile',independentlyVerified:false},
    operatingClearance:{status:'unverified'},operation:equipmentOperationProfile(type),
  };
}
