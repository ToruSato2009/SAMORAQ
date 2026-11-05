(() => {
  'use strict';
  const cfg = window.STUDYFORGE_SUPABASE;
  const ACTIVE='studyforge_local_active_user';
  const client = window.supabase?.createClient(cfg?.url || '', cfg?.anonKey || '');
  if (!client) { location.replace('auth.html'); return; }
  window.studyforgeSupabase = client;
  const stateKey = u => `studyforge_v2_state_${u}`;
  const profileKey = u => `studyforge_profile_${u}`;
  const fail = msg => { document.body.innerHTML = `<main style="font:16px system-ui;background:#090d20;color:#fff;min-height:100vh;display:grid;place-content:center;padding:24px"><h2>SAMORAQ couldn't load your cloud account</h2><p>${msg}</p><a style="color:#f4b740" href="auth.html">Return to sign in</a></main>`; };
  (async()=>{
    try {
      const {data:{session},error}=await client.auth.getSession();
      if(error||!session){location.replace('auth.html');return;}
      const user=session.user, username=String(user.user_metadata?.username||'').trim().toLowerCase();
      if(!username){fail('Your account is missing its SAMORAQ username. Please contact support.');return;}
      const [{data:profile,error:pe},{data:record,error:se}]=await Promise.all([
        client.from('student_profiles').select('profile,username,display_name').eq('user_id',user.id).maybeSingle(),
        client.from('student_app_state').select('app_state').eq('user_id',user.id).maybeSingle()
      ]);
      if(pe||se){fail('The cloud database is not configured yet. Apply the included supabase-setup.sql and try again.');return;}
      if(!profile?.profile || !record?.app_state){location.replace('auth.html?setup=1');return;}
      localStorage.setItem(ACTIVE,username);
      localStorage.setItem(`studyforge_profile_${username}`,JSON.stringify(profile.profile));
      localStorage.setItem(stateKey(username),JSON.stringify(record.app_state));
      // Compatibility shim for the existing app.js guard; no password is stored here.
      localStorage.setItem('studyforge_local_demo_users',JSON.stringify({[username]:{displayName:profile.display_name||username,cloud:true}}));
      const originalSet=Storage.prototype.setItem;
      let syncTimer;
      Storage.prototype.setItem=function(k,v){ originalSet.call(this,k,v); if(k===stateKey(username)||k===profileKey(username)){ clearTimeout(syncTimer); syncTimer=setTimeout(async()=>{
        try {
          if(k===stateKey(username)){const payload=JSON.parse(localStorage.getItem(stateKey(username))||'{}');const {error}=await client.from('student_app_state').upsert({user_id:user.id,app_state:payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)console.error('SAMORAQ cloud save failed',error);}
          const raw=localStorage.getItem(profileKey(username));if(raw){const pr=JSON.parse(raw);const {error}=await client.from('student_profiles').upsert({user_id:user.id,username,display_name:pr.displayName||profile.display_name||username,profile:pr,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)console.error('SAMORAQ profile sync failed',error);}
        }catch(e){console.error('SAMORAQ cloud sync failed',e);}
      },700); }};
      window.studyforgeCloudSignOut=async()=>{const {error}=await client.auth.signOut();if(error)throw error;localStorage.removeItem(ACTIVE);};
      const app=document.createElement('script');app.src='app.js';app.onerror=()=>fail('The planner could not be loaded. Refresh the page.');document.body.appendChild(app);
    } catch(e){console.error(e);fail('A network or database error occurred. Check your connection and Supabase setup.');}
  })();
})();
