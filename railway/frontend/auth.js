/**
 * RailWay SA — Auth Guard
 * Each page sets: <script>var PAGE_ROLES=['admin'];</script> before this file
 * Immediate redirect — no flash of wrong content
 */
(function(){
  'use strict';
  var user=null;
  try{user=JSON.parse(localStorage.getItem('rw-user')||'null');}catch(e){}

  if(!user||!user.role){
    document.documentElement.style.visibility='hidden';
    location.replace('login.html');
    return;
  }

  var allowed=window.PAGE_ROLES||[];
  if(allowed.length>0 && allowed.indexOf(user.role)===-1){
    document.documentElement.style.visibility='hidden';
    var homes={admin:'home-admin.html',staff:'home-staff.html',passenger:'home-passenger.html'};
    location.replace(homes[user.role]||'login.html');
    return;
  }

  // Make available globally
  window.RW_USER=user;
  window.RW_HOMES={admin:'home-admin.html',staff:'home-staff.html',passenger:'home-passenger.html'};
  window.rwLogout=function(){localStorage.removeItem('rw-user');location.replace('login.html');};

  // Fix home links dynamically once DOM ready
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('[data-home-link]').forEach(function(el){
      el.href=window.RW_HOMES[user.role]||'login.html';
    });
    // Fill user info placeholders
    var av=document.getElementById('sb-av');
    if(av)av.textContent=user.email[0].toUpperCase();
    var nm=document.getElementById('sb-name');
    if(nm)nm.textContent=user.email.split('@')[0];
    var rl=document.getElementById('sb-role');
    var roleLabel={admin:'Administrator',staff:'Station Staff',passenger:'Passenger'};
    if(rl)rl.textContent=roleLabel[user.role]||user.role;
  });
})();
