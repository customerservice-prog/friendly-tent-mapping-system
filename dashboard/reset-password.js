(function(){
  var API='https://rentsketch-api-production.up.railway.app';
  var token=(location.hash.match(/(?:^#|&)token=([^&]+)/)||[])[1]||'';
  try{token=decodeURIComponent(token);}catch(_){}
  var form=document.getElementById('form'),msg=document.getElementById('msg'),btn=document.getElementById('submit');
  function show(text,ok){msg.hidden=false;msg.className='msg '+(ok?'ok':'err');msg.textContent=text;}
  if(!token){show('This reset link is missing its one-time token.',false);btn.disabled=true;}
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var a=document.getElementById('pw1').value,b=document.getElementById('pw2').value;
    if(a!==b)return show('Passwords do not match.',false);
    if(a.length<12)return show('Password must be at least 12 characters.',false);
    btn.disabled=true;btn.textContent='Saving…';msg.hidden=true;
    try{
      var r=await fetch(API+'/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({token:token,newPassword:a})});
      var d=await r.json().catch(function(){return{};});
      if(!r.ok)throw new Error(d.error||'Password reset failed');
      window.RentSketchDashboardSession.clear('password-changed',false);
      history.replaceState(null,'',location.pathname);
      show('Password updated. Redirecting to login…',true);
      setTimeout(function(){location.href='/dashboard/#/login';},1200);
    }catch(err){show(err.message||'Password reset failed',false);btn.disabled=false;btn.textContent='Set new password';}
  });
})();
