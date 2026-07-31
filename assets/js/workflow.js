/* ============================================================
   SAGERO CREATIONS — Workflow module
   Visual pipeline, live production board, worker allocation,
   real-time timers
============================================================ */

const WF_STAGES = ['Received','Assigned','Unboxed','Software','Quality Check','Resealed','Packaging','Completed'];
const WF_STAGE_ICON = {
  'Received':'ri-inbox-archive-line', 'Assigned':'ri-user-follow-line', 'Unboxed':'ri-box-3-line',
  'Software':'ri-cpu-line', 'Quality Check':'ri-shield-check-line', 'Resealed':'ri-shield-star-line',
  'Packaging':'ri-archive-2-line', 'Completed':'ri-flag-2-line'
};

const WF_WORKER_POOL = [
  { name:'Grace Achieng', color:'#6D5DF6' }, { name:'Kevin Otieno', color:'#3B82F6' },
  { name:'Mercy Njoki', color:'#7C3AED' }, { name:'Samuel Kiprono', color:'#4F46E5' },
  { name:'Peter Mutua', color:'#5B5CF6' }, { name:'Joy Chebet', color:'#3B82F6' },
  { name:'Dennis Kamau', color:'#6D5DF6' }, { name:'Ruth Wanjiku', color:'#7C3AED' },
  { name:'Collins Odhiambo', color:'#4F46E5' }, { name:'Faith Auma', color:'#5B5CF6' },
];

const WF_MODELS = ['Y17s','Y18','Y18t','Y28','Y36','Y50t','Y100','Y200','Y300','Y300 Plus','V30','V40','V50','V50 Pro','V50 Lite','V70','V70 Elite','X100','X200','X200 Ultra','X300','X300 Pro','X300 Ultra','T3','T4'];

let wfBatches = [];
let wfAssignments = {};   // stage -> [workerNames]
let wfTimerHandle = null;
let wfShiftStart = null;
let wfUnitsToday = 0;

function wfSeed(){
  const savedBatches = localStorage.getItem('nexus_wf_batches');
  const savedAssign = localStorage.getItem('nexus_wf_assignments');
  const savedShift = localStorage.getItem('nexus_wf_shift_start');
  const savedUnits = localStorage.getItem('nexus_wf_units');

  if(savedBatches){ wfBatches = JSON.parse(savedBatches); }
  else{
    wfBatches = [];
    const dist = ['Received','Received','Assigned','Unboxed','Unboxed','Software','Software','Quality Check','Resealed','Packaging','Packaging','Completed','Completed'];
    dist.forEach((stage, i) => {
      wfBatches.push({
        id: 'BX-' + (1080 + i),
        model: WF_MODELS[i % WF_MODELS.length],
        qty: 120 + (i * 17) % 200,
        stage,
        enteredStageAt: new Date(Date.now() - Math.random()*1000*60*40).toISOString(),
      });
    });
    wfPersistBatches();
  }

  if(savedAssign){ wfAssignments = JSON.parse(savedAssign); }
  else{
    wfAssignments = {};
    WF_STAGES.forEach(s => wfAssignments[s] = []);
    wfAssignments['Unboxed'] = ['Grace Achieng','Samuel Kiprono'];
    wfAssignments['Software'] = ['Kevin Otieno'];
    wfAssignments['Quality Check'] = ['Mercy Njoki'];
    wfAssignments['Packaging'] = ['Joy Chebet','Ruth Wanjiku'];
    wfPersistAssignments();
  }

  wfShiftStart = savedShift || new Date().toISOString();
  if(!savedShift) localStorage.setItem('nexus_wf_shift_start', wfShiftStart);

  wfUnitsToday = savedUnits ? parseInt(savedUnits,10) : 4820;
}
function wfPersistBatches(){ localStorage.setItem('nexus_wf_batches', JSON.stringify(wfBatches)); }
function wfPersistAssignments(){ localStorage.setItem('nexus_wf_assignments', JSON.stringify(wfAssignments)); }

/* ============================================================
   BACKEND MODE — shares the SAME `batches` table as the Batches
   page (see backend_schema_phase2.sql), so a stage change here
   shows up there too, and vice versa. Worker allocation lives in
   `shift_assignments`. Falls back to the local demo dataset above
   when Supabase isn't configured.
============================================================ */
let wfBatchesChannel = null, wfAssignChannel = null;

function mapDbRowToWfBatch(row){
  return { id: row.id, model: row.model, qty: row.qty, stage: row.stage, enteredStageAt: row.updated_at };
}

async function loadWfBatchesFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('batches').select('*');
  if(error){ NexusApp.toast('Could not load batches: ' + error.message, 'error'); wfBatches = []; return; }
  wfBatches = (data || []).map(mapDbRowToWfBatch);
}
async function loadWfAssignmentsFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('shift_assignments').select('*');
  wfAssignments = {};
  WF_STAGES.forEach(s => wfAssignments[s] = []);
  if(error){ NexusApp.toast('Could not load worker allocation: ' + error.message, 'error'); return; }
  (data || []).forEach(row => { if(wfAssignments[row.stage]) wfAssignments[row.stage].push(row.worker_name); });
}
async function syncAssignmentsToBackend(){
  const sb = SagoBackend.getClient();
  await sb.from('shift_assignments').delete().neq('worker_name', '__none__'); // clear, then re-insert full state (mirrors local overwrite pattern)
  const rows = [];
  WF_STAGES.forEach(s => (wfAssignments[s]||[]).forEach(name => rows.push({ stage:s, worker_name:name })));
  if(rows.length){
    const { error } = await sb.from('shift_assignments').insert(rows);
    if(error) NexusApp.toast('Could not save worker allocation: ' + error.message, 'error');
  }
}
function subscribeWfRealtime(sb){
  if(wfBatchesChannel) sb.removeChannel(wfBatchesChannel);
  wfBatchesChannel = sb.channel('sagero-workflow-batches')
    .on('postgres_changes', { event:'*', schema:'public', table:'batches' }, async () => {
      await loadWfBatchesFromBackend();
      renderPipeline(); renderBoard(); renderStats();
    })
    .subscribe();
  if(wfAssignChannel) sb.removeChannel(wfAssignChannel);
  wfAssignChannel = sb.channel('sagero-workflow-assignments')
    .on('postgres_changes', { event:'*', schema:'public', table:'shift_assignments' }, async () => {
      await loadWfAssignmentsFromBackend();
      renderBoard(); renderPool();
    })
    .subscribe();
}

function wfAssignedWorkers(){
  return new Set(Object.values(wfAssignments).flat());
}
function wfUnassignedWorkers(){
  const assigned = wfAssignedWorkers();
  return WF_WORKER_POOL.filter(w => !assigned.has(w.name));
}
function wfWorkerColor(name){
  const w = WF_WORKER_POOL.find(x=>x.name===name);
  return w ? w.color : '#6D5DF6';
}
function wfInitials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

/* ---------------- PIPELINE STRIP ---------------- */
function renderPipeline(){
  const wrap = document.getElementById('pipelineStrip');
  wrap.innerHTML = WF_STAGES.map((stage, i) => {
    const count = wfBatches.filter(b => b.stage === stage).length;
    const isLast = i === WF_STAGES.length - 1;
    return `
    <div class="pipe-node ${count>0?'has-load':''}" onclick="wfScrollToStage('${stage}')">
      <div class="pipe-node-icon"><i class="${WF_STAGE_ICON[stage]}"></i></div>
      <div class="pipe-node-count">${count}</div>
      <div class="pipe-node-label">${stage}</div>
    </div>
    ${!isLast ? '<div class="pipe-connector"><i class="ri-arrow-right-s-line"></i></div>' : ''}`;
  }).join('');
}
function wfScrollToStage(stage){
  const col = document.querySelector(`.wf-col[data-stage="${stage}"]`);
  if(col && typeof col.scrollIntoView === 'function') col.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
  if(col && typeof col.animate === 'function'){
    col.animate([{ boxShadow:'0 0 0 3px rgba(109,93,246,0.5)' },{ boxShadow:'0 0 0 0 rgba(109,93,246,0)' }], { duration:900 });
  }
}

/* ---------------- LIVE PRODUCTION BOARD ---------------- */
function renderBoard(){
  const board = document.getElementById('wfBoard');
  board.innerHTML = WF_STAGES.map(stage => {
    const items = wfBatches.filter(b => b.stage === stage);
    const workers = wfAssignments[stage] || [];
    return `
    <div class="wf-col" data-stage="${stage}">
      <div class="wf-col-head">
        <div><i class="${WF_STAGE_ICON[stage]}"></i> ${stage}</div>
        <span class="kanban-count">${items.length}</span>
      </div>
      <div class="wf-worker-zone" data-stage="${stage}">
        ${workers.map(w => `<div class="worker-chip" data-worker="${w}" data-tip="${w}"><span style="background:${wfWorkerColor(w)}">${wfInitials(w)}</span></div>`).join('')}
        <div class="worker-zone-hint">${workers.length===0?'Drop worker here':''}</div>
      </div>
      <div class="wf-dropzone" data-stage="${stage}">
        ${items.map(b => `
          <div class="wf-batch-chip" data-id="${b.id}">
            <div class="wf-batch-chip-top"><b>${b.id}</b><span class="wf-timer" data-since="${b.enteredStageAt}">00:00</span></div>
            <div class="wf-batch-chip-model">${b.model} · ${b.qty} units</div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  WF_STAGES.forEach(stage => {
    const zone = board.querySelector(`.wf-dropzone[data-stage="${stage}"]`);
    new Sortable(zone, {
      group:'wf-batches', animation:180, ghostClass:'kanban-ghost',
      onEnd: (evt) => {
        const id = evt.item.dataset.id;
        const newStage = evt.to.dataset.stage;
        const b = wfBatches.find(x=>x.id===id);
        if(b && newStage !== b.stage){
          b.stage = newStage;
          b.enteredStageAt = new Date().toISOString();
          NexusApp.toast(`${id} moved to ${newStage}`,'success');
          renderPipeline();
          renderBoard();

          if(SagoBackend?.isConfigured()){
            SagoBackend.getClient().from('batches').update({ stage:newStage }).eq('id', id).then(({ error }) => {
              if(error) NexusApp.toast('Could not save stage change: ' + error.message, 'error');
            });
          } else {
            wfPersistBatches();
          }
        }
      }
    });
    const wzone = board.querySelector(`.wf-worker-zone[data-stage="${stage}"]`);
    new Sortable(wzone, {
      group:'wf-workers', animation:180, ghostClass:'kanban-ghost', draggable:'.worker-chip',
      onEnd: () => {
        const newAssignments = {};
        WF_STAGES.forEach(s => newAssignments[s] = []);
        document.querySelectorAll('.wf-worker-zone').forEach(z => {
          const s = z.dataset.stage;
          z.querySelectorAll('.worker-chip').forEach(chip => newAssignments[s].push(chip.dataset.worker));
        });
        wfAssignments = newAssignments;
        renderPool();
        NexusApp.toast('Worker allocation updated','success');

        if(SagoBackend?.isConfigured()) syncAssignmentsToBackend();
        else wfPersistAssignments();
      }
    });
  });
}

/* ---------------- WORKER POOL ---------------- */
function renderPool(){
  const pool = document.getElementById('wfPool');
  const unassigned = wfUnassignedWorkers();
  pool.innerHTML = unassigned.map(w => `
    <div class="worker-chip lg" data-worker="${w.name}">
      <span style="background:${w.color}">${wfInitials(w.name)}</span>
      <small>${w.name.split(' ')[0]}</small>
    </div>`).join('') || `<span style="font-size:12px;color:var(--ink-faint);">All workers are allocated to stages.</span>`;

  new Sortable(pool, {
    group:'wf-workers', animation:180, ghostClass:'kanban-ghost', draggable:'.worker-chip',
    onEnd: () => {
      const newAssignments = {};
      WF_STAGES.forEach(s => newAssignments[s] = []);
      document.querySelectorAll('.wf-worker-zone').forEach(z => {
        const s = z.dataset.stage;
        z.querySelectorAll('.worker-chip').forEach(chip => newAssignments[s].push(chip.dataset.worker));
      });
      wfAssignments = newAssignments;
      renderPool();

      if(SagoBackend?.isConfigured()) syncAssignmentsToBackend();
      else wfPersistAssignments();
    }
  });
}

/* ---------------- REAL-TIME STATS ---------------- */
function renderStats(){
  const inProgress = wfBatches.filter(b => b.stage !== 'Completed').reduce((s,b)=>s+b.qty,0);
  const completedToday = wfBatches.filter(b => b.stage === 'Completed').length;
  const bottleneck = WF_STAGES.slice(0,-1).reduce((max, s) => {
    const c = wfBatches.filter(b=>b.stage===s).length;
    return c > max.count ? { stage:s, count:c } : max;
  }, { stage:'—', count:0 });

  document.getElementById('statUnits').textContent = wfUnitsToday.toLocaleString();
  document.getElementById('statInProgress').textContent = inProgress.toLocaleString();
  document.getElementById('statCompleted').textContent = completedToday;
  document.getElementById('statBottleneck').textContent = bottleneck.count > 0 ? bottleneck.stage : '—';
}

let wfShiftRunning = true;

function applyShiftStatus(status){
  if(!status) return;
  wfShiftRunning = status.is_running;
  wfShiftStart = status.shift_started_at || wfShiftStart;
  document.getElementById('liveBanner')?.classList.toggle('stopped', !wfShiftRunning);
  document.getElementById('liveDot')?.classList.toggle('stopped', !wfShiftRunning);
  const bannerText = document.getElementById('liveBannerText');
  if(bannerText) bannerText.textContent = wfShiftRunning ? 'LIVE PRODUCTION' : 'SHIFT STOPPED';
  const label = document.getElementById('shiftTimerLabel');
  if(label) label.textContent = wfShiftRunning ? 'Shift running' : 'Stopped — resumes 8AM';
}

function subscribeShiftStatusRealtime(sb){
  sb.channel('sagero-shift-status')
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'shift_status' }, (payload) => {
      applyShiftStatus(payload.new);
    })
    .subscribe();
}

function wfTickTimers(){
  document.querySelectorAll('.wf-timer').forEach(el => {
    const since = new Date(el.dataset.since).getTime();
    const diff = Math.max(0, Date.now() - since);
    const mm = String(Math.floor(diff/60000)).padStart(2,'0');
    const ss = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
    el.textContent = mm+':'+ss;
    el.classList.toggle('slow', diff > 30*60000);
  });
  if(!wfShiftRunning) return; // freeze the shift clock while stopped, rather than counting down/up incorrectly
  const shiftDiff = Date.now() - new Date(wfShiftStart).getTime();
  const h = String(Math.floor(shiftDiff/3600000)).padStart(2,'0');
  const m = String(Math.floor((shiftDiff%3600000)/60000)).padStart(2,'0');
  const s = String(Math.floor((shiftDiff%60000)/1000)).padStart(2,'0');
  const shiftEl = document.getElementById('shiftTimer');
  if(shiftEl) shiftEl.textContent = `${h}:${m}:${s}`;
}

function wfSimulateLiveTick(){
  // occasionally bump units processed to feel live, purely cosmetic
  wfUnitsToday += Math.floor(Math.random()*4);
  localStorage.setItem('nexus_wf_units', wfUnitsToday);
  const el = document.getElementById('statUnits');
  if(el){
    el.textContent = wfUnitsToday.toLocaleString();
    el.classList.add('flash');
    setTimeout(()=>el.classList.remove('flash'), 500);
  }
}

/* ---------------- RESET DEMO DATA ---------------- */
function wfResetDemo(){
  if(SagoBackend?.isConfigured()){
    NexusApp.toast('Reset isn\u2019t available once connected to the real backend \u2014 that would erase everyone\u2019s live data', 'error');
    return;
  }
  localStorage.removeItem('nexus_wf_batches');
  localStorage.removeItem('nexus_wf_assignments');
  wfSeed();
  renderAll();
  NexusApp.toast('Workflow demo data reset','info');
}

function renderAll(){
  renderPipeline();
  renderBoard();
  renderPool();
  renderStats();
  wfTickTimers();
}

let wfDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(wfDidInit) return;
  wfDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('workflow.html', session);

  if(SagoBackend?.isConfigured()){
    await loadWfBatchesFromBackend();
    await loadWfAssignmentsFromBackend();
    wfShiftStart = new Date().toISOString();
    wfUnitsToday = 4820;
    subscribeWfRealtime(SagoBackend.getClient());

    const status = await ShiftStatus.checkAutoRestart();
    applyShiftStatus(status);
    subscribeShiftStatusRealtime(SagoBackend.getClient());
  } else {
    wfSeed();
  }

  renderAll();

  wfTimerHandle = setInterval(wfTickTimers, 1000);
  setInterval(wfSimulateLiveTick, 5500);
});
