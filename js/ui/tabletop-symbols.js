import { tabletopPlacements } from '../data/tabletop.js';
import { linenColorHex } from '../data/linens.js';
export function tabletopSymbol(p,color='White'){
 const gold=/gold/i.test(p.name),metal=gold?'#bf954e':'#9aafb5',stroke='#73868a';
 if(['plate','charger','bowl'].includes(p.type)){const r=p.type==='charger'?.53:/salad|bread/i.test(p.name)?.30:.43;return `<circle r="${r}" fill="${p.type==='charger'&&gold?'#c6a76a':'#fffefa'}" stroke="${p.type==='charger'?metal:'#c4cdce'}" stroke-width=".025"/><circle r="${r*.76}" fill="${p.type==='bowl'?'#e9edef':'none'}" stroke="#b6c4c6" stroke-width=".014"/>${p.type==='charger'?Array.from({length:24},(_,i)=>`<circle cx="${Math.cos(i*Math.PI/12)*r*.92}" cy="${Math.sin(i*Math.PI/12)*r*.92}" r=".015" fill="${metal}"/>`).join(''):''}`;}
 if(p.type==='glass')return '<circle r=".145" fill="#c8e1e666" stroke="#779ca8" stroke-width=".022"/><circle r=".11" fill="none" stroke="#fff" stroke-width=".018"/><path d="M-.07 -.07L.04 -.09" stroke="#fff" stroke-width=".025"/>';
 if(['fork','knife','spoon','utensil'].includes(p.type)){const head=p.type==='fork'?'<path d="M-.08 -.17V-.32M0 -.17V-.32M.08 -.17V-.32M-.08 -.17Q0 -.08 .08 -.17"/>':p.type==='knife'?'<path d="M-.04 -.03V-.34Q.14 -.28 .06 -.03Z"/>':'<ellipse cx="0" cy="-.23" rx=".10" ry=".14"/>';return `<g transform="rotate(90)" fill="${metal}" stroke="${stroke}" stroke-width=".018"><rect x="-.032" y="-.11" width=".064" height=".47" rx=".03"/>${head}</g>`;}
 if(p.type==='napkin')return `<path d="M-.24 -.30H.24V.30H-.24Z" fill="${linenColorHex(color)}" stroke="#697c7855" stroke-width=".018"/><path d="M-.2 -.27L.12 .27M.12 -.27L.18 .27" fill="none" stroke="#ffffff88" stroke-width=".018"/>`;
 if(p.type==='centerpiece'&&/lantern/i.test(p.name))return '<rect x="-.24" y="-.24" width=".48" height=".48" fill="#bd985c" stroke="#7d754f" stroke-width=".025"/><rect x="-.18" y="-.18" width=".36" height=".36" fill="#f2ecdb"/><circle r=".1" fill="#fff9e7"/>';
 if(p.type==='centerpiece')return '<circle r=".22" fill="#9eb2a5"/>'+Array.from({length:9},(_,i)=>{const a=i*2.4,r=.13+((i%3)*.09);return `<ellipse cx="${Math.cos(a)*r}" cy="${Math.sin(a)*r}" rx=".18" ry=".09" transform="rotate(${a*180/Math.PI})" fill="${i%2?'#6e906d':'#8da383'}"/><circle cx="${Math.cos(a)*r*.7}" cy="${Math.sin(a)*r*.7}" r=".12" fill="${i%2?'#f3e3d8':'#fffcf2'}"/>`;}).join('');
 if(p.type==='candle')return '<circle r=".23" fill="#bf9953"/><circle r=".12" fill="#fff4d7"/><circle r=".025" fill="#d58d31"/>';
 if(p.type==='number')return '<circle r=".15" fill="#bb9758"/><rect x="-.24" y="-.035" width=".48" height=".07" rx=".02" fill="#fffdf6" stroke="#ad955e" stroke-width=".02"/>';
 if(p.type==='pitcher')return '<circle r=".24" fill="#d9e7e788" stroke="#8da2a7" stroke-width=".025"/><path d="M.23 -.12Q.5 0 .23 .12" fill="none" stroke="#8da2a7" stroke-width=".04"/>';
 if(p.type==='stand'||p.type==='fountain')return `<circle r=".48" fill="${metal}" stroke="#8a7a65" stroke-width=".025"/><circle r=".29" fill="${p.type==='fountain'?'#784d33':'#ead8b8'}"/><circle r=".12" fill="${p.type==='fountain'?'#a47b58':'#f1e3c9'}"/>`;
 if(p.type==='dispenser')return '<circle r=".40" fill="#dce4e2" stroke="#7d959b" stroke-width=".035"/><rect x="-.08" y=".36" width=".16" height=".18" rx=".04" fill="#525e61"/>';
 if(p.type==='condiment')return '<circle cx="-.12" r=".1" fill="#f6f2e7" stroke="#9daba8" stroke-width=".02"/><circle cx=".12" r=".1" fill="#eee8db" stroke="#9daba8" stroke-width=".02"/>';
 return `<rect x="-.64" y="-.4" width="1.28" height=".8" rx=".12" fill="#d6deda" stroke="#879a9c" stroke-width=".035"/><rect x="-.55" y="-.31" width="1.1" height=".62" rx=".08" fill="${p.type==='chafer'?'#b6c3c3':'#f1efdf'}"/>`;
}
export function tabletopSvg(item,catalog,swapped=false){
 const w=swapped?item.depthFt:item.widthFt,d=swapped?item.widthFt:item.depthFt;
 const contents=tabletopPlacements(item,catalog).sort((a,b)=>(a.product.type==='runner'?-1:a.layer)-(b.product.type==='runner'?-1:b.layer)).map(p=>p.product.type==='runner'?`<rect x="${item.widthFt>=item.depthFt?-item.widthFt/2:-.48}" y="${item.widthFt>=item.depthFt?-.48:-item.depthFt/2}" width="${item.widthFt>=item.depthFt?item.widthFt:.96}" height="${item.widthFt>=item.depthFt?.96:item.depthFt}" fill="${linenColorHex(p.color)}" opacity=".95"/>`:`<g transform="translate(${p.x} ${p.z}) rotate(${p.angle*180/Math.PI})">${tabletopSymbol(p.product,p.color)}</g>`).join('');
 return `<svg class="tabletop-overlay" viewBox="${-w/2} ${-d/2} ${w} ${d}" aria-hidden="true"><g${swapped?' transform="matrix(0 1 1 0 0 0)"':''}>${contents}</g></svg>`;
}
