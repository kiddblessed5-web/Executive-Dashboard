/* ============================================================
   SAGERO CREATIONS — Supabase client (Phase 1: auth + messages)
   ============================================================
   SETUP:
   1. Run backend_schema_phase1.sql in your Supabase project's
      SQL Editor (see the top of that file for full steps).
   2. Paste your Project URL and anon public key below.
   3. That's it — the login page and Messages automatically
      switch from local demo mode to the real shared backend.

   Until you fill these in, the app keeps working exactly as
   it does today (local demo login, per-device Messages) — 
   nothing breaks by leaving this unconfigured.
============================================================ */

const SUPABASE_URL = 'https://ejqtclcsambsouxoxagk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_usxYs0k8w2V3PROye2cw7A__S43Dfoz';

const SagoBackend = (() => {
  const configured = SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL'
    && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
    && SUPABASE_URL.startsWith('http');

  let client = null;
  function getClient(){
    if(!configured) return null;
    if(!client){
      if(typeof supabase === 'undefined' || !supabase.createClient){
        console.error('Supabase JS library failed to load — check your network/CDN.');
        return null;
      }
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
  }

  function isConfigured(){ return configured; }

  const LOAD_FAIL_ERROR = { message:'Could not connect to the server — check your internet connection and try again' };

  /* ---------------- AUTH ---------------- */
  async function signUp(email, password, fullName){
    const sb = getClient();
    if(!sb) return { data:null, error: LOAD_FAIL_ERROR };
    return sb.auth.signUp({ email, password, options:{ data:{ full_name: fullName } } });
  }
  async function signInWithPassword(email, password){
    const sb = getClient();
    if(!sb) return { data:null, error: LOAD_FAIL_ERROR };
    return sb.auth.signInWithPassword({ email, password });
  }
  async function signInWithOAuth(provider){
    const sb = getClient();
    if(!sb) return { data:null, error: LOAD_FAIL_ERROR };
    return sb.auth.signInWithOAuth({ provider, options:{ redirectTo: window.location.origin + '/index.html' } });
  }
  async function signOut(){
    const sb = getClient();
    if(sb) await sb.auth.signOut();
  }
  async function getSession(){
    const sb = getClient();
    if(!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }
  async function getProfile(userId){
    const sb = getClient();
    if(!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if(error){ console.error('getProfile error', error); return null; }
    return data;
  }

  return { isConfigured, getClient, signUp, signInWithPassword, signInWithOAuth, signOut, getSession, getProfile };
})();
