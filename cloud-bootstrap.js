(() => {
  'use strict';

  const cfg = window.STUDYFORGE_SUPABASE;
  const ACTIVE = 'studyforge_local_active_user';
  const client = window.supabase?.createClient(cfg?.url || '', cfg?.anonKey || '');

  const stateKey = username => `studyforge_v2_state_${username}`;
  const profileKey = username => `studyforge_profile_${username}`;
  const validState = value => value && typeof value === 'object' &&
    Array.isArray(value.subjects) && Array.isArray(value.topics) && Array.isArray(value.tasks);

  const fail = message => {
    document.body.innerHTML = `<main style="font:16px system-ui;background:#090d20;color:#fff;min-height:100vh;display:grid;place-content:center;padding:24px"><h2>SAMORAQ couldn't load your cloud account</h2><p>${String(message).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p><a style="color:#f4b740" href="auth.html">Return to sign in</a></main>`;
  };

  if (!client) { fail('The Supabase client could not be initialized. Check the configuration and refresh.'); return; }
  window.studyforgeSupabase = client;

  (async () => {
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw new Error(`Could not verify your sign-in: ${sessionError.message}`);
      if (!session?.user) { location.replace('auth.html'); return; }

      // Verify the active user against Supabase Auth instead of trusting a cached/local ID.
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user || user.id !== session.user.id) {
        await client.auth.signOut();
        localStorage.removeItem(ACTIVE);
        location.replace('auth.html');
        return;
      }

      const username = String(user.user_metadata?.username || '').trim().toLowerCase();
      if (!username) { fail('This account is missing its SAMORAQ username. Please sign in with the account used to create your profile.'); return; }

      const [{ data: profileRow, error: profileError }, { data: stateRow, error: stateError }] = await Promise.all([
        client.from('student_profiles').select('profile,username,display_name').eq('user_id', user.id).maybeSingle(),
        client.from('student_app_state').select('app_state').eq('user_id', user.id).maybeSingle()
      ]);
      if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
      if (stateError) throw new Error(`Could not load your study data: ${stateError.message}`);

      // Only a genuinely missing profile requires onboarding. A missing app-state row
      // must never send an established profile back through account creation.
      if (!profileRow?.profile) { location.replace('auth.html?setup=1'); return; }

      let profile = profileRow.profile;
      let appState = stateRow?.app_state;
      const localProfileRaw = localStorage.getItem(profileKey(username));
      if (localProfileRaw) {
        try {
          const localProfile = JSON.parse(localProfileRaw);
          if (localProfile && typeof localProfile === 'object') profile = { ...profile, ...localProfile };
        } catch { /* Keep the cloud profile if local cache is malformed. */ }
      }

      if (!validState(appState)) {
        // Recover a browser backup first. If none exists, create a safe empty planner
        // state without deleting the cloud profile or sending a returning user to setup.
        try {
          const localState = JSON.parse(localStorage.getItem(stateKey(username)) || 'null');
          if (validState(localState)) appState = localState;
        } catch { /* Continue with an empty compatible state. */ }
      }
      if (!validState(appState)) {
        appState = {
          subjects: [], topics: [], tasks: [], dailyPlans: {}, dailyTopicSelections: {},
          dailyTopicText: {}, dailyTopicDismissed: {}, priorityOrder: [], xp: 0,
          completed: [], dailyStudyMinutes: Number(profile.dailyStudyMinutes) || 120,
          theme: 'dark', createdAt: Date.now(), recoveredFromMissingCloudState: true
        };
      }

      // Cache only after both records have been resolved, so app.js never boots with
      // a half-authenticated or half-initialized account.
      localStorage.setItem(ACTIVE, username);
      localStorage.setItem(profileKey(username), JSON.stringify(profile));
      localStorage.setItem(stateKey(username), JSON.stringify(appState));
      localStorage.setItem('studyforge_local_demo_users', JSON.stringify({
        [username]: { displayName: profileRow.display_name || profile.displayName || username, cloud: true }
      }));

      // Repair a missing app-state row, or persist a recoverable local backup.
      if (!stateRow?.app_state || !validState(stateRow.app_state)) {
        const { error } = await client.from('student_app_state').upsert({
          user_id: user.id, app_state: appState, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) console.error('SAMORAQ state recovery could not be synced:', error);
      }

      // Debounce cloud writes independently per key, avoiding the old shared-timer race.
      const originalSet = Storage.prototype.setItem;
      const timers = new Map();
      Storage.prototype.setItem = function (key, value) {
        originalSet.call(this, key, value);
        if (key !== stateKey(username) && key !== profileKey(username)) return;
        const previous = timers.get(key);
        if (previous) clearTimeout(previous);
        const timer = setTimeout(async () => {
          timers.delete(key);
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (key === stateKey(username)) {
              if (!validState(parsed)) return;
              const { error } = await client.from('student_app_state').upsert({
                user_id: user.id, app_state: parsed, updated_at: new Date().toISOString()
              }, { onConflict: 'user_id' });
              if (error) console.error('SAMORAQ cloud state save failed:', error);
            } else {
              const { error } = await client.from('student_profiles').upsert({
                user_id: user.id,
                username,
                display_name: parsed.displayName || profileRow.display_name || username,
                profile: parsed,
                updated_at: new Date().toISOString()
              }, { onConflict: 'user_id' });
              if (error) console.error('SAMORAQ cloud profile save failed:', error);
            }
          } catch (error) { console.error('SAMORAQ cloud sync failed:', error); }
        }, 650);
        timers.set(key, timer);
      };

      window.studyforgeCloudSignOut = async () => {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        localStorage.removeItem(ACTIVE);
      };

      const app = document.createElement('script');
      app.src = 'app.js';
      app.onerror = () => fail('The study planner could not be loaded. Refresh the page.');
      document.body.appendChild(app);
    } catch (error) {
      console.error('SAMORAQ bootstrap error:', error);
      fail(error?.message || 'A network or database error occurred. Check your connection and Supabase setup.');
    }
  })();
})();
