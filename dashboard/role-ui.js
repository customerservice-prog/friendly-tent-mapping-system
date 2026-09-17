(function(){
'use strict';
var API=window.RENTSKETCH_API_URL||'https://rentsketch-api-production.up.railway.app';
var TOKEN='rentsketch_dashboard_token',TENANT='rentsketch_dashboard_tenant';
var LEVEL={viewer:10,staff:20,admin:30,owner:40,platform_admin:100};
var ctx={role:null,slug:null};
function token(){return localStorage.getItem(TOKEN)}
function active(){return localStorage.getItem(TENANT)}
function rank(r){return LEVEL[r]||0}
function roleLabel(r){return r==='platform_admin'?'Super Admin':r? r.charAt(0).toUpperCase()+r.slice(1):''}
async function refresh(){
 var t=token(),slug=active(); if(!t||!slug){ctx={role:null,slug:null};return;}
 try{var r=await fetch(API+'/api/auth/me',{headers:{Authorization:'Bearer '+t,Accept:'application/json'}});if(!r.ok)return;var d=await r.json();var m=(d.tenants||[]).find(function(x){return x.slug===slug});ctx={role:(m&&m.role)||null,slug:slug};}catch(e){}
}
function banner(){
 if(!ctx.role)return;
 var main=document.getElementById('dashMain'); if(!main||main.querySelector('.role-banner'))return;
 var b=document.createElement('div');b.className='role-banner';
 b.innerHTML='<strong>'+roleLabel(ctx.role)+'</strong><span>'+(
 ctx.role==='platform_admin'?'Platform access — you can manage this tenant and all other tenants.':
 ctx.role==='owner'?'Full company access.':ctx.role==='admin'?'Administrative access.':ctx.role==='staff'?'Operational access.':'Read-only access.')+'</span>';
 main.insertBefore(b,main.firstChild);
}
function hide(el){if(el)el.style.display='none'}
function disable(el,title){if(!el)return;el.disabled=true;el.title=title||'Your role does not allow this action';}
function apply(){
 if(!token())return; var route=(location.hash||'').replace(/^#\/?/,'').split('?')[0];banner();
 var r=rank(ctx.role);
 if(route==='requests'&&r<20){document.querySelectorAll('.status-select').forEach(function(x){disable(x,'Staff access or higher is required')});}
 if(route==='products'&&r<20){hide(document.getElementById('productForm'));document.querySelectorAll('.visual-select,[data-action="toggle-active"],[data-action="delete"]').forEach(function(x){disable(x,'Staff access or higher is required')});var h=[].slice.call(document.querySelectorAll('.dash-section-title')).find(function(x){return /add a product/i.test(x.textContent)});hide(h);}
 if(route==='branding'&&r<30){var f=document.getElementById('brandingForm');if(f){f.querySelectorAll('input,select,textarea,button').forEach(function(x){disable(x,'Admin access or higher is required')});}hide(document.getElementById('connectStripeBtn'));}
 if(route==='install'&&r<30){document.querySelectorAll('button,input,textarea,select').forEach(function(x){disable(x,'Admin access or higher is required')});}
 var account=document.querySelector('.dash-account');if(account&&!account.querySelector('.role-pill')){var p=document.createElement('span');p.className='role-pill';p.textContent=roleLabel(ctx.role);account.insertBefore(p,account.firstChild);}
}
var timer=null;var obs=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(apply,20)});
async function boot(){await refresh();obs.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});apply();}
window.addEventListener('hashchange',async function(){await refresh();setTimeout(apply,30)});
window.addEventListener('storage',async function(e){if(e.key===TENANT||e.key===TOKEN){await refresh();apply();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();