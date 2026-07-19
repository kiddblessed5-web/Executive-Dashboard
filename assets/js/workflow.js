/* ============================================================
   NEXUS OPERATIONS OS — Workflow module
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

const WF_MODELS = ['Y18','Y28','V30','Y36','X100','Y17s'];

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
          wfPersistBatches();
          NexusApp.toast(`${id} moved to ${newStage}`,'success');
          renderPipeline();
          renderBoard();
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
        wfPersistAssignments();
        renderPool();
        NexusApp.toast('Worker allocation updated','success');
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
      wfPersistAssignments();
      renderPool();
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

function wfTickTimers(){
  document.querySelectorAll('.wf-timer').forEach(el => {
    const since = new Date(el.dataset.since).getTime();
    const diff = Math.max(0, Date.now() - since);
    const mm = String(Math.floor(diff/60000)).padStart(2,'0');
    const ss = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
    el.textContent = mm+':'+ss;
    el.classList.toggle('slow', diff > 30*60000);
  });
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

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('workflow.html', session);
  wfSeed();
  renderAll();

  wfTimerHandle = setInterval(wfTickTimers, 1000);
  setInterval(wfSimulateLiveTick, 5500);
});
