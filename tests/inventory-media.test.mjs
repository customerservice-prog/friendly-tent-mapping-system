import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {bindInventoryMedia,equipmentPhoto,inventoryBrowser} from '../js/ui/inventory-browser.js';
import {TABLES} from '../js/data/tables.js';
import {CHAIRS} from '../js/data/chairs.js';
import {TENTS} from '../js/data/tents.js';
import {INFLATABLE_PROFILES} from '../js/data/inflatables.js';
import {genericEquipment} from '../js/data/equipment.js';

function fixture(html){const dom=new JSDOM('<main>'+html+'</main>');bindInventoryMedia(dom.window.document);return dom;}
test('the unified picker uses existing furniture previews and distinct planning symbols',()=>{
 const catalog={tents:TENTS,tables:TABLES,chairs:CHAIRS,inflatables:[{...INFLATABLE_PROFILES[0],id:'castle',name:'Bounce house'}],equipment:genericEquipment()};
 const dom=fixture(inventoryBrowser(catalog)),doc=dom.window.document;
 const card=id=>doc.querySelector('[data-id="'+id+'"]');
 assert.match(card('resin-white').querySelector('.inventory-preview-image').getAttribute('src'),/resin-white\.png/);
 assert.match(card('banquet-6ft').querySelector('.inventory-preview-image').getAttribute('src'),/banquet-6ft\.png/);
 assert.match(card('pole-20x20').textContent,/Planning illustration/);
 assert.ok(card('pole-20x20').querySelector('svg'));
 assert.ok(card('castle').querySelector('svg rect'));
 assert.notEqual(card('preview-foam-machine').querySelector('svg').outerHTML,card('preview-fan').querySelector('svg').outerHTML);
 assert.equal(doc.querySelectorAll('.inventory-placeholder').length,0,'generic rentals no longer share a cube placeholder');
 assert.equal(card('fill-chill-4ft').querySelector('.inventory-preview-image'),null,'the older white-basin render is not shown for the revised black-basin model');
 assert.match(card('fill-chill-4ft').querySelector('svg').outerHTML,/#131e1a/);
 assert.equal(doc.querySelectorAll('.inventory-photo-layer').length,0,'illustrations are never labeled product photos');
 dom.window.close();
});
test('real SKU photos are preferred; broken photos and model files fail over independently',()=>{
 const dom=fixture(equipmentPhoto({...CHAIRS.find(p=>p.id==='resin-white'),id:'resin-white--sku-2',photoUrl:'https://example.com/exact-sku.png',name:'Rental chair'}, {category:'chair'})+equipmentPhoto({id:'other',type:'fan',name:'Other rental',photoUrl:'/actual-fan.jpg'}));
 const doc=dom.window.document,media=doc.querySelector('.inventory-media'),photo=media.querySelector('.inventory-photo');
 assert.equal(photo.getAttribute('src'),'https://example.com/exact-sku.png');
 assert.equal(photo.getAttribute('onerror'),null,'fallback does not require inline script permission');
 assert.equal(media.querySelector('.inventory-illustration').hidden,true);
 photo.dispatchEvent(new dom.window.Event('error'));
 assert.equal(media.querySelector('.inventory-photo-layer').hidden,true);
 assert.equal(media.querySelector('.inventory-illustration').hidden,false);
 const model=media.querySelector('.inventory-preview-image');
 assert.ok(model,'SKU suffix still resolves the renderer model');
 model.dispatchEvent(new dom.window.Event('error'));
 assert.equal(model.parentElement.hidden,true);
 assert.equal(model.parentElement.nextElementSibling.hidden,false);
 assert.ok(model.parentElement.nextElementSibling.querySelector('svg'));
 assert.equal(doc.querySelectorAll('.inventory-photo-layer')[1].hidden,false,'other cards are unaffected');
 doc.querySelector('main').insertAdjacentHTML('beforeend',equipmentPhoto({name:'Later card',type:'fan',photoUrl:'/later.jpg'}));
 const late=[...doc.querySelectorAll('.inventory-media')].at(-1);late.querySelector('img').dispatchEvent(new dom.window.Event('error'));
 assert.equal(late.querySelector('.inventory-illustration').hidden,false,'delegation handles later drawer renders');
 dom.window.close();
});
test('unsafe image URLs stay out of the DOM and unknown models remain explicit',()=>{
 const dom=fixture(equipmentPhoto({name:'Unknown rental',type:'generic',photoUrl:'javascript:alert(1)'}));
 assert.equal(dom.window.document.querySelector('img'),null);
 assert.match(dom.window.document.body.textContent,/No preview available/);
 assert.doesNotMatch(dom.window.document.body.innerHTML,/javascript:/);
 dom.window.close();
});
