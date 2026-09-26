// RentSketch visual-model resolver.
// Pure and tenant-neutral: never intercepts fetch and never mutates API responses.
import { TENTS } from './tents.js';

function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function tentVisual(name) {
  var n=String(name||'').toLowerCase(),m=n.match(/\b(\d+)\s*[x×-]\s*(\d+)\b/);
  if(!m)return null;
  var size=m[1]+'x'+m[2],type=/frame/.test(n)?'frame':(/pop|canopy/.test(n)?'canopy':(/pole/.test(n)?'pole':null));
  if(!type)return null;
  var id=type+'-'+size;
  return TENTS.some(function(x){return x.id===id;})?id:null;
}
function tableVisual(name) { var n=String(name||'').toLowerCase();if(/fill|chill/.test(n))return'fill-chill-4ft';if(/cocktail|highboy|high boy/.test(n))return'cocktail';if(/round/.test(n)&&/(5\s*(?:ft|foot|feet|')|60\s*(?:in|inch|"))/.test(n))return'round-5ft';if(/8\s*(ft|foot|')/.test(n))return'banquet-8ft';if(/6\s*(ft|foot|')/.test(n))return'banquet-6ft';return null; }
function chairVisual(name) { var n=String(name||'').toLowerCase();if(/queen|tiffany/.test(n)&&/throne/.test(n))return'throne-queen-tiffany';if(/king.*throne|throne.*king/.test(n))return'throne-king';if(/mahogany.*chiavari|chiavari.*mahogany/.test(n))return'chiavari-mahogany';if(/white.*chiavari|chiavari.*white/.test(n))return'chiavari-white';if(/gold.*chiavari|chiavari.*gold/.test(n))return'chiavari-gold';if(/white.*resin|resin.*white/.test(n))return'resin-white';if(/white.*plastic|plastic.*white/.test(n))return'plastic-white';return null; }
export function inferVisualModel(product) {
  if(!product||product.active===false||product.visual_model_id)return product&&product.visual_model_id||null;
  var c=norm(product.category);
  if(c==='tent')return tentVisual(product.name);
  if(c==='table')return tableVisual(product.name);
  if(c==='chair')return chairVisual(product.name);
  return null;
}
export function resolveVisualModel(product) { return product&&product.visual_model_id ? {id:product.visual_model_id,fallback:false} : (function(id){return id?{id:id,fallback:true}:null;})(inferVisualModel(product)); }
