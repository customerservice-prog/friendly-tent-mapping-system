import { accessoryCategoryGroups } from '../data/accessories.js';

const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const ICONS={
  'foam-machine':'<path d="M5 13h8v6H5zM7 10h4v3H7zM13 14l6-3v8l-6-3z"/><circle cx="20" cy="7" r="2"/><circle cx="17" cy="5" r="1.2"/><circle cx="21" cy="3" r="1"/>',
  'photo-booth':'<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M8 17h8M12 14v5"/>',
  speaker:'<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="9" r="3"/><circle cx="12" cy="16" r="2"/>',
  generator:'<rect x="4" y="7" width="16" height="11" rx="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M8 7V4h8v3M9 11h6"/>',
  fan:'<path d="M12 12v9M8 21h8"/><circle cx="12" cy="9" r="6"/><path d="M12 9c-5-1-5-4-2-5 2 1 3 3 2 5zm0 0c1-5 4-5 5-2-1 2-3 3-5 2zm0 0c5 1 5 4 2 5-2-1-3-3-2-5zm0 0c-1 5-4 5-5 2 1-2 3-3 5-2z"/>',
  cooler:'<rect x="4" y="8" width="16" height="10" rx="2"/><path d="M6 8V5h12v3M9 12h6"/>',
  'trash-can':'<path d="M6 7h12l-1 14H7zM5 7h14M9 4h6l1 3H8z"/>',
  stanchion:'<path d="M5 20h5M14 20h5M8 20V7M17 20V7M7 7h2M16 7h2M9 8c3 1 5 1 7 0"/>',
  'red-carpet':'<path d="M8 3h8l3 18H5zM8 8h8M7 13h10M6 18h12"/>',
  cornhole:'<path d="M3 16l6-9h6l6 9z"/><circle cx="12" cy="11" r="1.5"/><path d="M5 18h14"/>',
  'connect-four':'<rect x="4" y="4" width="16" height="14" rx="2"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><path d="M7 18v3M17 18v3"/>',
  'tumbling-blocks':'<path d="M6 18h12v3H6zM4 15h12v3H4zM8 12h12v3H8zM6 9h12v3H6zM4 6h12v3H4zM8 3h12v3H8z"/>',
  'cotton-candy':'<path d="M5 9h14l-2 7H7zM9 16v4h6v-4"/><path d="M8 7c0-3 2-5 4-3 2-2 4 0 4 3 2 0 3 2 1 3H7c-2-1-1-3 1-3z"/>',
  popcorn:'<rect x="6" y="4" width="12" height="14" rx="1"/><path d="M8 8h8v7H8zM9 3c0-2 2-2 3-1 1-1 3-1 3 1M8 18v3M16 18v3"/>',
  'snow-cone':'<path d="M6 7h12l-3 11H9zM8 7c0-4 8-4 8 0z"/><path d="M9 18h6"/>',
  'chocolate-fountain':'<path d="M12 3v18M8 7h8l-1 3H9zM6 11h12l-2 4H8zM4 16h16l-2 5H6z"/>',
  podium:'<path d="M7 4h10l-2 5H9zM10 9h4v10h-4zM7 19h10"/>',
  'microphone':'<circle cx="12" cy="6" r="3"/><path d="M12 9v9M8 18h8"/>',
  bar:'<path d="M3 8h18v10H3zM5 10h14M7 18v3M17 18v3"/>',
  stage:'<rect x="3" y="10" width="18" height="7"/><path d="M5 17v4M19 17v4"/>',
  backdrop:'<path d="M4 20V5M20 20V5M4 5h16M7 8h10v9H7z"/>',
  generic:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/>'
};

export function accessoryIcon(type){
  const path=ICONS[type]||ICONS.generic;
  return '<svg class="accessory-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}

export function accessoryCard(item,quantity=0){
  const price=item.pricePerDay==null?'Confirm pricing':'$'+Number(item.pricePerDay).toFixed(2)+'/day';
  const visual=item.photoUrl
    ? '<img class="equipment-model accessory-photo" src="'+esc(item.photoUrl)+'" alt="" loading="lazy" decoding="async">'
    : '<span class="accessory-model accessory-model--'+esc(item.accessoryType)+'">'+accessoryIcon(item.accessoryType)+'</span>';
  return '<button type="button" class="item-card equipment-card accessory-card" data-role="accessory-card" data-id="'+esc(item.id)+'">'+
    visual+
    '<span class="item-card-name">'+esc(item.name)+'</span>'+
    '<span class="item-card-desc">'+(item.dimensionsConfirmed?'Measured ':'Illustrative ')+esc(item.widthFt)+' × '+esc(item.depthFt)+' ft'+(item.animated?' · animated 3D':'')+(quantity?' · '+quantity+' in layout':'')+'</span>'+
    '<span class="item-card-price">'+price+'</span>'+
    '<span class="equipment-add">+ Place item</span></button>';
}

export function accessoryDrawer(items,objects){
  if(!items.length)return '<div class="catalog-empty"><strong>No additional mapped rentals yet.</strong><p>When the live catalog includes games, concessions, effects, cooling, power or event accessories, they will appear here automatically.</p></div>';
  const counts=new Map();
  for(const object of objects||[])if(object.kind==='accessory')counts.set(object.accessoryId,(counts.get(object.accessoryId)||0)+1);
  return '<div class="all-rentals-intro"><strong>All placeable rentals</strong><p>These items come from the live rental catalog. Animated items move in 3D when Scene → Animate scene is on.</p></div>'+
    accessoryCategoryGroups(items).map(([category,list])=>
      '<section class="rental-category"><div class="drawer-section-title">'+esc(category)+'</div><div class="item-card-grid">'+
      list.map(item=>accessoryCard(item,counts.get(item.id)||0)).join('')+
      '</div></section>'
    ).join('');
}

export function accessoryInspector(item,product){
  if(!product)return '';
  const price=product.pricePerDay==null?'Confirm pricing':'$'+Number(product.pricePerDay).toFixed(2)+'/day';
  return '<button class="btn-tertiary inspector-close" data-role="inspector-close">Close</button>'+
    '<h3>'+esc(product.name)+'</h3>'+
    (product.photoUrl?'<img class="equipment-model inspector-accessory-photo" src="'+esc(product.photoUrl)+'" alt="" loading="lazy">':'<div class="inspector-accessory-icon">'+accessoryIcon(product.accessoryType)+'</div>')+
    '<p>'+esc(product.visualCategory)+' · '+(product.dimensionsConfirmed?'Measured ':'Illustrative ')+esc(product.widthFt)+' × '+esc(product.depthFt)+' ft footprint</p>'+
    '<p><strong>'+price+'</strong>'+(product.animated?' · Animated in 3D':'')+'</p>'+
    '<div class="inspector-actions">'+
      '<button type="button" class="btn-secondary" data-role="insp-rotate" data-id="'+esc(item.id)+'">Rotate 90°</button>'+
      '<button type="button" class="btn-secondary" data-role="insp-duplicate" data-id="'+esc(item.id)+'">Duplicate</button>'+
      '<button type="button" class="btn-danger" data-role="insp-delete" data-id="'+esc(item.id)+'">Delete</button>'+
    '</div><p class="equipment-note">Drag this item in 2D or 3D to reposition it.</p>';
}
