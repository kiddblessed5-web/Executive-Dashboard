/* ============================================================
   SAGERO CREATIONS — Shared shift-status helper
   Used by Dashboard (Clock Off button) and Workflow (live shift
   timer / worker allocation), so both pages agree on whether the
   shift is currently running. Requires backend_schema_phase3.sql.
============================================================ */

const ShiftStatus = (() => {
  async function get(){
    if(!SagoBackend?.isConfigured()) return null;
    const sb = SagoBackend.getClient();
    const { data, error } = await sb.from('shift_status').select('*').eq('id', 1).single();
    if(error){ console.error('[shift-status] could not load:', error.message); return null; }
    return data;
  }

  async function clockOff(){
    if(!SagoBackend?.isConfigured()) return { error:'Backend not configured' };
    const sb = SagoBackend.getClient();
    const session = await SagoBackend.getSession();
    const { error } = await sb.from('shift_status').update({
      is_running: false, stopped_at: new Date().toISOString(), stopped_by: session?.user?.id || null,
    }).eq('id', 1);
    return { error };
  }

  async function clockOn(){
    if(!SagoBackend?.isConfigured()) return { error:'Backend not configured' };
    const sb = SagoBackend.getClient();
    const { error } = await sb.from('shift_status').update({
      is_running: true, shift_started_at: new Date().toISOString(), stopped_at: null, stopped_by: null,
    }).eq('id', 1);
    return { error };
  }

  // If the shift was stopped and it's now 8:00 AM or later on a day
  // AFTER it was stopped, restart it automatically. Safe to call from
  // multiple pages — it only acts if the shift is actually still off.
  async function checkAutoRestart(){
    const status = await get();
    if(!status || status.is_running) return status;

    const stoppedAt = status.stopped_at ? new Date(status.stopped_at) : null;
    const now = new Date();
    const todayEightAM = new Date(now); todayEightAM.setHours(8,0,0,0);

    const stoppedBeforeToday = stoppedAt && stoppedAt.toDateString() !== now.toDateString();
    const pastEightAM = now >= todayEightAM;

    if(stoppedBeforeToday && pastEightAM){
      const { error } = await clockOn();
      if(!error){ NexusApp?.toast?.('Shift auto-resumed for the new day', 'success'); return await get(); }
    }
    return status;
  }

  return { get, clockOff, clockOn, checkAutoRestart };
})();
