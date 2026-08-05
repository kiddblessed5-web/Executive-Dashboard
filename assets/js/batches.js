/* ============================================================
   SAGERO CREATIONS — Phone Batches module
============================================================ */

const PIPELINE_STAGES = ['Received','Assigned','Unboxed','Software','Quality Check','Resealed','Packaging','Completed'];
const KANBAN_STAGES = ['Waiting','Assigned','Software','Quality Check','Packaging','Completed'];

const MANAGERS = ['Wei Zhang','Li Chen','Feng Yun','Chao Liu'];
const SALESMEN = ['Brian Mwangi','Faith Kerubo','Dennis Otieno','Ann Wambui'];
const BRANDS = ['Vivo'];
const MODELS = ['Y17s','Y18','Y18t','Y28','Y36','Y50t','Y100','Y200','Y300','Y300 Plus','V30','V40','V50','V50 Pro','V50 Lite','V70','V70 Elite','X100','X200','X200 Ultra','X300','X300 Pro','X300 Ultra','T3','T4'];
const STATUS_COLOR = { 'On Track':'success', 'At Risk':'warning', 'Delayed':'danger', 'Completed':'info' };

// The backend's single source-of-truth `stage` uses the full 8-step pipeline
// (shared with Workflow). Batches' own Kanban view intentionally keeps a
// simpler 6-column layout — these map between the two without changing
// either page's UI.
const STAGE_TO_KANBAN = {
  'Received':'Waiting', 'Assigned':'Assigned', 'Unboxed':'Software', 'Software':'Software',
  'Quality Check':'Quality Check', 'Resealed':'Packaging', 'Packaging':'Packaging', 'Completed':'Completed',
};
const KANBAN_TO_STAGE = { 'Waiting':'Received', 'Assigned':'Assigned', 'Software':'Software', 'Quality Check':'Quality Check', 'Packaging':'Packaging', 'Completed':'Completed' };

let BATCHES = [];

function seedBatches(){
  const saved = localStorage.getItem('nexus_batches');
  if(saved){ BATCHES = JSON.parse(saved); return; }
  const statuses = ['On Track','On Track','On Track','At Risk','Delayed','Completed','On Track','Completed','At Risk','On Track','Delayed','On Track'];
  BATCHES = statuses.map((status, i) => {
    const qty = [200,150,320,280,180,240,300,220,190,260,140,310][i];
    const progress = status==='Completed' ? 100 : status==='Delayed' ? Math.round(20+Math.random()*20) : Math.round(35+Math.random()*55);
    const kanban = status==='Completed' ? 'Completed' : KANBAN_STAGES[Math.min(KANBAN_STAGES.length-2, Math.floor(progress/18))];
    const received = new Date(Date.now() - (i+2)*86400000);
    const finish = new Date(Date.now() + (6-i%6)*86400000);
    return {
      id: 'BX-' + (1030 + i),
      model: MODELS[i % MODELS.length],
      brand: 'Vivo',
      qty,
      salesman: SALESMEN[i % SALESMEN.length],
      manager: MANAGERS[i % MANAGERS.length],
      progress,
      workers: 2 + (i % 4),
      received: received.toISOString().slice(0,10),
      finish: finish.toISOString().slice(0,10),
      status,
      kanban,
      workerContrib: [
        { name:'Grace Achieng', units: Math.round(qty*0.3) },
        { name:'Kevin Otieno', units: Math.round(qty*0.26) },
        { name:'Mercy Njoki', units: Math.round(qty*0.24) },
        { name:'Samuel Kiprono', units: Math.round(qty*0.2) },
      ],
      activity: [
        { text:'Batch received at warehouse', time:received.toLocaleDateString() },
        { text:'Assigned to ' + MANAGERS[i % MANAGERS.length], time:received.toLocaleDateString() },
        { text:'Workers allocated to unboxing', time:'2 days ago' },
        { text:'Software installation in progress', time:'1 day ago' },
      ],
      notes: 'Handle with care — customer requested original packaging retained for resale.',
    };
  });
  persistBatches();
}
function persistBatches(){ localStorage.setItem('nexus_batches', JSON.stringify(BATCHES)); }

/* ============================================================
   BACKEND MODE — real, shared batches (see backend_schema_phase2.sql)
   Populates the exact same BATCHES shape the rest of this file
   already renders, so every render function below is unchanged.
============================================================ */
let batchesRealtimeChannel = null;

function mapDbBatchToLocal(row){
  return {
    id: row.id, model: row.model, brand: row.brand, qty: row.qty,
    salesman: row.salesman, manager: row.manager, progress: row.progress,
    workers: row.workers, received: row.received_date, finish: row.finish_date,
    status: row.status, kanban: STAGE_TO_KANBAN[row.stage] || 'Waiting', dbStage: row.stage,
    workerContrib: row.worker_contributions || [],
    activity: row.activity_log || [],
    notes: row.notes || '',
  };
}

async function loadBatchesFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('batches').select('*').order('created_at', { ascending:false });
  if(error){ NexusApp.toast('Could not load batches: ' + error.message, 'error'); BATCHES = []; return; }
  BATCHES = (data || []).map(mapDbBatchToLocal);
}

const renderViewsDebounced = NexusApp.debounce(() => renderViews(), 300);

function subscribeBatchesRealtime(sb){
  if(batchesRealtimeChannel) sb.removeChannel(batchesRealtimeChannel);
  batchesRealtimeChannel = sb.channel('sagero-batches')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'batches' }, (payload) => {
      if(BATCHES.some(b=>b.id===payload.new.id)) return; // already added optimistically by this tab
      BATCHES.unshift(mapDbBatchToLocal(payload.new));
      renderViewsDebounced();
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'batches' }, (payload) => {
      const idx = BATCHES.findIndex(b=>b.id===payload.new.id);
      if(idx === -1) return;
      BATCHES[idx] = mapDbBatchToLocal(payload.new);
      renderViewsDebounced();
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'batches' }, (payload) => {
      BATCHES = BATCHES.filter(b=>b.id!==payload.old.id);
      renderViewsDebounced();
    })
    .subscribe();
}

let currentView = localStorage.getItem('nexus_batch_view') || 'grid';
let filters = { search:'', brand:'all', manager:'all', status:'all' };
let sortKey = 'received-desc';
let currentPage = 1;
const PAGE_SIZE = 9;

function applyFilters(list){
  return list.filter(b => {
    if(filters.search && !(b.id.toLowerCase().includes(filters.search) || b.model.toLowerCase().includes(filters.search))) return false;
    if(filters.brand !== 'all' && b.brand !== filters.brand) return false;
    if(filters.manager !== 'all' && b.manager !== filters.manager) return false;
    if(filters.status !== 'all' && b.status !== filters.status) return false;
    return true;
  });
}
function applySort(list){
  const sorted = [...list];
  switch(sortKey){
    case 'received-desc': sorted.sort((a,b)=> new Date(b.received)-new Date(a.received)); break;
    case 'received-asc': sorted.sort((a,b)=> new Date(a.received)-new Date(b.received)); break;
    case 'progress-desc': sorted.sort((a,b)=> b.progress-a.progress); break;
    case 'qty-desc': sorted.sort((a,b)=> b.qty-a.qty); break;
  }
  return sorted;
}

function getFilteredSorted(){ return applySort(applyFilters(BATCHES)); }

function renderToolbarCounts(){
  document.getElementById('batchCount').textContent = getFilteredSorted().length + ' batches';
}

function renderViews(){
  document.querySelectorAll('.view-panel').forEach(v => v.style.display='none');
  document.getElementById('view-' + currentView).style.display = currentView === 'kanban' ? 'flex' : 'block';
  document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === currentView));
  if(currentView === 'grid') renderGrid();
  if(currentView === 'list') renderList();
  if(currentView === 'kanban') renderKanban();
  renderToolbarCounts();
  renderPagination();
}

function paginate(list){
  const start = (currentPage-1)*PAGE_SIZE;
  return list.slice(start, start+PAGE_SIZE);
}

function batchCardHTML(b){
  const color = STATUS_COLOR[b.status];
  return `
  <div class="batch-card" onclick="openBatchDrawer('${b.id}')">
    <button class="batch-card-remove" data-tip="Remove batch" onclick="event.stopPropagation(); confirmRemoveBatch('${b.id}')"><i class="ri-close-line"></i></button>
    <div class="batch-card-top">
      <div>
        <div class="batch-id">${b.id}</div>
        <div class="batch-model">${b.brand} ${b.model}</div>
      </div>
      <span class="badge badge-${color}"><span class="badge-dot"></span>${b.status}</span>
    </div>
    <div class="batch-meta-grid">
      <div><small>Quantity</small><b>${b.qty} units</b></div>
      <div><small>Workers</small><b>${b.workers} assigned</b></div>
      <div><small>Salesman</small><b>${b.salesman}</b></div>
      <div><small>Manager</small><b>${b.manager}</b></div>
    </div>
    <div class="batch-progress-wrap">
      <div class="batch-progress-label"><span>Progress</span><span>${b.progress}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:0%; background:${progressColor(b.progress)};" data-w="${b.progress}"></div></div>
    </div>
    <div class="batch-card-foot">
      <span><i class="ri-calendar-line"></i> Due ${formatDate(b.finish)}</span>
      <span class="batch-card-arrow"><i class="ri-arrow-right-up-line"></i></span>
    </div>
  </div>`;
}
function progressColor(p){ return p >= 90 ? '#16A34A' : p >= 50 ? '#6D5DF6' : '#F59E0B'; }
function formatDate(d){ return new Date(d).toLocaleDateString('en-GB',{ day:'2-digit', month:'short' }); }

function renderGrid(){
  const list = paginate(getFilteredSorted());
  const wrap = document.getElementById('view-grid');
  wrap.innerHTML = list.map(batchCardHTML).join('') || emptyState('No batches match your filters', 'Try adjusting search, brand or status filters.');
  animateBars();
}

function renderList(){
  const list = paginate(getFilteredSorted());
  const tbody = document.getElementById('batchListBody');
  tbody.innerHTML = list.map(b => `
    <tr onclick="openBatchDrawer('${b.id}')" style="cursor:pointer;">
      <td><input type="checkbox" onclick="event.stopPropagation()"></td>
      <td><b>${b.id}</b></td>
      <td>${b.brand} ${b.model}</td>
      <td>${b.qty}</td>
      <td>${b.salesman}</td>
      <td>${b.manager}</td>
      <td style="width:140px;"><div class="progress-track" style="height:7px;"><div class="progress-fill" style="width:${b.progress}%; background:${progressColor(b.progress)};"></div></div></td>
      <td><span class="badge badge-${STATUS_COLOR[b.status]}">${b.status}</span></td>
      <td>${formatDate(b.finish)}</td>
    </tr>`).join('') || `<tr><td colspan="9">${emptyState('No batches match your filters','Try adjusting your filters.')}</td></tr>`;
}

function renderKanban(){
  const board = document.getElementById('view-kanban');
  const list = getFilteredSorted();
  board.innerHTML = KANBAN_STAGES.map(stage => {
    const items = list.filter(b => b.kanban === stage);
    return `
    <div class="kanban-col">
      <div class="kanban-col-head"><span>${stage}</span><span class="kanban-count">${items.length}</span></div>
      <div class="kanban-dropzone" data-stage="${stage}">
        ${items.map(b => `
          <div class="kanban-card" data-id="${b.id}" onclick="openBatchDrawer('${b.id}')">
            <div class="kanban-card-top"><b>${b.id}</b><span class="badge badge-${STATUS_COLOR[b.status]}" style="font-size:9.5px;padding:3px 7px;">${b.status}</span></div>
            <div class="kanban-card-model">${b.brand} ${b.model}</div>
            <div class="progress-track" style="height:6px;margin-top:8px;"><div class="progress-fill" style="width:${b.progress}%; background:${progressColor(b.progress)};"></div></div>
            <div class="kanban-card-foot"><span><i class="ri-user-line"></i> ${b.workers}</span><span>${b.qty} units</span></div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  KANBAN_STAGES.forEach(stage => {
    const zone = board.querySelector(`.kanban-dropzone[data-stage="${stage}"]`);
    new Sortable(zone, {
      group:'kanban', animation:180, ghostClass:'kanban-ghost',
      onEnd: (evt) => {
        const id = evt.item.dataset.id;
        const newStage = evt.to.dataset.stage;
        const b = BATCHES.find(x=>x.id===id);
        if(!b) return;
        b.kanban = newStage;
        if(newStage === 'Completed'){ b.status = 'Completed'; b.progress = 100; }

        if(SagoBackend?.isConfigured()){
          const dbStage = KANBAN_TO_STAGE[newStage] || 'Received';
          b.dbStage = dbStage;
          const updates = { stage: dbStage };
          if(newStage === 'Completed'){ updates.status = 'Completed'; updates.progress = 100; }
          SagoBackend.getClient().from('batches').update(updates).eq('id', id).then(({ error }) => {
            if(error) NexusApp.toast('Could not save stage change: ' + error.message, 'error');
          });
          NexusApp.toast(`${id} moved to ${newStage}`,'success');
          renderKanban();
          return;
        }

        persistBatches();
        NexusApp.toast(`${id} moved to ${newStage}`,'success');
        renderKanban();
      }
    });
  });
}

function emptyState(title, sub){
  return `<div class="empty-state"><i class="ri-inbox-line"></i><b>${title}</b><span>${sub}</span></div>`;
}

function animateBars(){
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      document.querySelectorAll('.progress-fill[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
    }, 80);
  });
}

function renderPagination(){
  const total = getFilteredSorted().length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(currentPage > pages) currentPage = pages;
  const wrap = document.getElementById('pagination');
  if(currentView === 'kanban'){ wrap.style.display='none'; return; }
  wrap.style.display = 'flex';
  let html = `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="gotoPage(${currentPage-1})"><i class="ri-arrow-left-s-line"></i></button>`;
  for(let p=1; p<=pages; p++){
    html += `<button class="page-btn ${p===currentPage?'active':''}" onclick="gotoPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" ${currentPage===pages?'disabled':''} onclick="gotoPage(${currentPage+1})"><i class="ri-arrow-right-s-line"></i></button>`;
  wrap.innerHTML = html;
}
function gotoPage(p){ currentPage = p; renderViews(); }

/* ---------------- FILTER / SEARCH / SORT WIRES ---------------- */
function wireToolbar(){
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filters.search = e.target.value.trim().toLowerCase(); currentPage=1; renderViews();
  });
  document.getElementById('filterManager').addEventListener('change', (e) => { filters.manager = e.target.value; currentPage=1; renderViews(); });
  document.getElementById('filterStatus').addEventListener('change', (e) => { filters.status = e.target.value; currentPage=1; renderViews(); });
  document.getElementById('sortSelect').addEventListener('change', (e) => { sortKey = e.target.value; renderViews(); });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      localStorage.setItem('nexus_batch_view', currentView);
      currentPage = 1;
      renderViews();
    });
  });
}

/* ---------------- NEW BATCH MODAL ---------------- */
function openNewBatchModal(){ NexusApp.openModal('modal-newbatch'); }
async function submitNewBatch(e){
  e.preventDefault();
  const model = document.getElementById('nb-model').value;
  const qty = parseInt(document.getElementById('nb-qty').value, 10);
  const salesman = document.getElementById('nb-salesman').value;
  const manager = document.getElementById('nb-manager').value;
  if(!model || !qty || qty < 1){ NexusApp.toast('Please fill in all required fields','error'); return; }

  const id = 'BX-' + (1030 + BATCHES.length + Math.floor(Math.random()*90));
  const receivedDate = new Date().toISOString().slice(0,10);
  const finishDate = new Date(Date.now()+7*86400000).toISOString().slice(0,10);

  if(SagoBackend?.isConfigured()){
    const { data, error } = await SagoBackend.getClient().from('batches').insert({
      id, model, brand:'Vivo', qty, salesman, manager, progress:5, workers:2,
      received_date: receivedDate, finish_date: finishDate, status:'On Track', stage:'Received',
      worker_contributions: [], activity_log:[{ text:'Batch received at warehouse', time:'Just now' }], notes:'',
    }).select().single();
    if(error){ NexusApp.toast('Could not create batch: ' + error.message, 'error'); return; }
    BATCHES.unshift(mapDbBatchToLocal(data));
    NexusApp.closeModal('modal-newbatch');
    NexusApp.toast('Batch ' + id + ' created','success');
    NexusApp.logAudit('Production', `Batch ${id} created — ${qty} × ${model}`);
    currentPage = 1;
    renderViews();
    e.target.reset();
    return;
  }

  BATCHES.unshift({
    id, model, brand:'Vivo', qty, salesman, manager, progress:5, workers:2,
    received: receivedDate,
    finish: finishDate,
    status:'On Track', kanban:'Waiting',
    workerContrib: [], activity:[{ text:'Batch received at warehouse', time:'Just now' }],
    notes:''
  });
  persistBatches();
  NexusApp.closeModal('modal-newbatch');
  NexusApp.toast('Batch ' + id + ' created','success');
    NexusApp.logAudit('Production', `Batch ${id} created — ${qty} × ${model}`);
  currentPage = 1;
  renderViews();
  e.target.reset();
}

/* ---------------- DRAWER ---------------- */
/* ---------------- REMOVE BATCH ---------------- */
let pendingRemoveBatchId = null;
function confirmRemoveBatch(id){
  const b = BATCHES.find(x=>x.id===id);
  if(!b) return;
  pendingRemoveBatchId = id;
  document.getElementById('removeBatchName').textContent = id;
  NexusApp.openModal('modal-removebatch');
}
async function removeBatch(){
  if(!pendingRemoveBatchId) return;
  const id = pendingRemoveBatchId;
  BATCHES = BATCHES.filter(x=>x.id!==id);
  NexusApp.closeModal('modal-removebatch');
  NexusApp.closeDrawer('batchDrawer');
  renderViews();
  NexusApp.toast(id + ' removed', 'info');
  NexusApp.logAudit('Production', `Batch ${id} was removed`);

  if(SagoBackend?.isConfigured()){
    const { error } = await SagoBackend.getClient().from('batches').delete().eq('id', id);
    if(error) NexusApp.toast('Could not delete on server: ' + error.message, 'error');
  } else {
    persistBatches();
  }
  pendingRemoveBatchId = null;
}

function openBatchDrawer(id){
  const b = BATCHES.find(x => x.id === id);
  if(!b) return;
  document.getElementById('drawerBatchId').textContent = b.id;
  document.getElementById('drawerBatchModel').textContent = b.brand + ' ' + b.model;
  document.getElementById('drawerBatchStatus').className = 'badge badge-' + STATUS_COLOR[b.status];
  document.getElementById('drawerBatchStatus').innerHTML = `<span class="badge-dot"></span>${b.status}`;

  document.getElementById('drawerPipeline').innerHTML = PIPELINE_STAGES.map((stage, i) => {
    const stepProgress = (i+1) / PIPELINE_STAGES.length * 100;
    const done = b.progress >= stepProgress - 5;
    return `<div class="pipe-step ${done?'done':''}"><div class="pipe-dot">${done?'<i class="ri-check-line"></i>':i+1}</div><span>${stage}</span></div>`;
  }).join('');

  const maxUnits = Math.max(1, ...b.workerContrib.map(w=>w.units));
  document.getElementById('drawerContrib').innerHTML = (b.workerContrib.length ? b.workerContrib : []).map(w => `
    <div class="contrib-row">
      <span class="contrib-name">${w.name}</span>
      <div class="progress-track" style="flex:1;height:8px;"><div class="progress-fill" style="width:${(w.units/maxUnits*100)}%; background:var(--grad);"></div></div>
      <span class="contrib-val">${w.units}</span>
    </div>`).join('') || '<span style="font-size:12.5px;color:var(--ink-faint);">No worker data yet.</span>';

  document.getElementById('drawerActivity').innerHTML = b.activity.map(a => `
    <div class="activity-row"><div class="activity-icon" style="background:var(--info-soft);color:var(--info);"><i class="ri-time-line"></i></div>
    <div class="activity-text"><span>${a.text}</span><small>${a.time}</small></div></div>`).join('');

  document.getElementById('drawerNotes').value = b.notes || '';
  document.getElementById('drawerMeta').innerHTML = `
    <div><small>Quantity</small><b>${b.qty} units</b></div>
    <div><small>Salesman</small><b>${b.salesman}</b></div>
    <div><small>Manager</small><b>${b.manager}</b></div>
    <div><small>Workers</small><b>${b.workers} assigned</b></div>
    <div><small>Received</small><b>${formatDate(b.received)}</b></div>
    <div><small>Expected finish</small><b>${formatDate(b.finish)}</b></div>`;

  drawDonut(b.progress);

  document.getElementById('drawerCompleteBtn').onclick = () => completeBatch(b.id);
  window.currentDrawerBatch = b.id;
  NexusApp.openDrawer('batchDrawer');
}

function drawDonut(progress){
  const canvas = document.getElementById('drawerDonut');
  if(window.drawerChart) window.drawerChart.destroy();
  window.drawerChart = new Chart(canvas.getContext('2d'), {
    type:'doughnut',
    data:{ labels:['Completed','Remaining'], datasets:[{ data:[progress, 100-progress], backgroundColor:['#6D5DF6', 'rgba(109,93,246,0.12)'], borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', plugins:{ legend:{ display:false }, tooltip:{ enabled:false } } }
  });
  document.getElementById('drawerDonutLabel').textContent = progress + '%';
}

function completeBatch(id){
  const b = BATCHES.find(x=>x.id===id);
  if(!b) return;
  b.status = 'Completed'; b.progress = 100; b.kanban = 'Completed';
  b.activity.unshift({ text:'Batch marked as completed', time:'Just now' });
  NexusApp.toast(id + ' marked as completed', 'success');
  openBatchDrawer(id);
  renderViews();

  if(SagoBackend?.isConfigured()){
    b.dbStage = 'Completed';
    SagoBackend.getClient().from('batches').update({
      status:'Completed', progress:100, stage:'Completed', activity_log: b.activity,
    }).eq('id', id).then(({ error }) => {
      if(error) NexusApp.toast('Could not save completion: ' + error.message, 'error');
    });
    return;
  }
  persistBatches();
}

function saveDrawerNotes(){
  const b = BATCHES.find(x=>x.id===window.currentDrawerBatch);
  if(!b) return;
  b.notes = document.getElementById('drawerNotes').value;
  NexusApp.toast('Notes saved','success');

  if(SagoBackend?.isConfigured()){
    SagoBackend.getClient().from('batches').update({ notes: b.notes }).eq('id', b.id).then(({ error }) => {
      if(error) NexusApp.toast('Could not save notes: ' + error.message, 'error');
    });
    return;
  }
  persistBatches();
}

function exportBatchesCSV(){
  const rows = [['Batch ID','Model','Qty','Salesman','Manager','Progress','Status','Received','Finish']];
  getFilteredSorted().forEach(b => rows.push([b.id, b.brand+' '+b.model, b.qty, b.salesman, b.manager, b.progress+'%', b.status, b.received, b.finish]));
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sagero-phone-batches.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Exported ' + getFilteredSorted().length + ' batches to CSV','success');
}

let batchesDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(batchesDidInit) return;
  batchesDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('batches.html', session);

  if(SagoBackend?.isConfigured()){
    await loadBatchesFromBackend();
    subscribeBatchesRealtime(SagoBackend.getClient());
  } else {
    seedBatches();
  }

  wireToolbar();
  renderViews();
});
