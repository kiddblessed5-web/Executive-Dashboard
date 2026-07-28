/* ============================================================
   SAGERO CREATIONS — Quality Control module
============================================================ */

const QC_INSPECTORS = ['Kevin Otieno', 'Mercy Njoki', 'Ruth Wanjiku', 'Collins Odhiambo'];
const QC_MODELS = ['Vivo Y18','Vivo Y28','Vivo V30','Vivo Y36','Vivo X100','Vivo Y17s'];
const DEFECT_TYPES = ['Screen', 'Battery', 'Software', 'Casing', 'Camera', 'Other'];

const QC_STATUS_BADGE = { 'Pending':'warning', 'Passed':'success', 'Failed':'danger', 'Approved':'info', 'Rejected':'danger' };

let INSPECTIONS = [];

function seedInspections(){
  const saved = localStorage.getItem('nexus_qc_inspections');
  if(saved){ INSPECTIONS = JSON.parse(saved); return; }

  const scenarios = [
    { status:'Pending' }, { status:'Pending' }, { status:'Pending' }, { status:'Pending' },
    { status:'Passed' }, { status:'Passed' }, { status:'Passed' }, { status:'Passed' }, { status:'Passed' },
    { status:'Failed', approvalState:'pending' }, { status:'Failed', approvalState:'pending' },
    { status:'Failed', approvalState:'Approved' }, { status:'Failed', approvalState:'Rejected' },
  ];

  INSPECTIONS = scenarios.map((s, i) => {
    const qty = 40 + Math.round(Math.random()*160);
    const date = new Date(Date.now() - Math.round(Math.random()*6)*86400000 - i*3600000);
    const isFailed = s.status === 'Failed';
    const defects = isFailed ? seedDefects() : [];
    return {
      id: 'QC-' + (3001 + i),
      batchId: 'BX-' + (1030 + i),
      model: QC_MODELS[i % QC_MODELS.length],
      qty,
      inspector: QC_INSPECTORS[i % QC_INSPECTORS.length],
      date: date.toISOString(),
      status: s.status,
      approvalState: s.approvalState || null,
      severity: isFailed ? (defects.reduce((s,d)=>s+d.count,0) > 8 ? 'High' : defects.reduce((s,d)=>s+d.count,0) > 3 ? 'Medium' : 'Low') : null,
      defects,
      photos: isFailed ? [{ label:'defect-'+(i+1)+'-a.jpg' }, { label:'defect-'+(i+1)+'-b.jpg' }] : [],
      notes: isFailed ? 'Units flagged during standard QC sampling — see defect breakdown.' : '',
    };
  });
  persistInspections();
}
function seedDefects(){
  const count = 1 + Math.floor(Math.random()*3);
  const shuffled = [...DEFECT_TYPES].sort(()=>Math.random()-0.5).slice(0, count);
  return shuffled.map(type => ({ type, count: 1 + Math.floor(Math.random()*6) }));
}
function persistInspections(){ localStorage.setItem('nexus_qc_inspections', JSON.stringify(INSPECTIONS)); }

function fmtDate(iso){ return new Date(iso).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
function isToday(iso){ return new Date(iso).toDateString() === new Date().toDateString(); }

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const pending = INSPECTIONS.filter(i => i.status==='Pending').length;
  const passedToday = INSPECTIONS.filter(i => i.status==='Passed' && isToday(i.date)).length;
  const failedToday = INSPECTIONS.filter(i => i.status==='Failed' && isToday(i.date)).length;
  const totalDecided = INSPECTIONS.filter(i => i.status==='Passed' || i.status==='Failed').length;
  const totalPassed = INSPECTIONS.filter(i => i.status==='Passed').length;
  const passRate = totalDecided ? Math.round(totalPassed/totalDecided*100) : 0;

  document.getElementById('kpiPending').textContent = pending;
  document.getElementById('kpiPassedToday').textContent = passedToday;
  document.getElementById('kpiFailedToday').textContent = failedToday;
  document.getElementById('kpiPassRate').textContent = passRate + '%';
}

/* ---------------- CHARTS ---------------- */
let trendChartInstance = null, defectChartInstance = null;

function renderCharts(){
  const labels = [], passArr = [], failArr = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toDateString();
    labels.push(d.toLocaleDateString('en-GB',{weekday:'short'}));
    passArr.push(INSPECTIONS.filter(x=>x.status==='Passed' && new Date(x.date).toDateString()===key).length);
    failArr.push(INSPECTIONS.filter(x=>x.status==='Failed' && new Date(x.date).toDateString()===key).length);
  }
  const trendCtx = document.getElementById('qcTrendChart').getContext('2d');
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(trendCtx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Passed', data:passArr, backgroundColor:'#16A34A', borderRadius:6, stack:'s' },
      { label:'Failed', data:failArr, backgroundColor:'#EF4444', borderRadius:6, stack:'s' },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
      scales:{ x:{ stacked:true, grid:{display:false}, border:{display:false} }, y:{ stacked:true, grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false}, ticks:{ stepSize:1 } } }
    }
  });

  const totals = {};
  DEFECT_TYPES.forEach(t => totals[t] = 0);
  INSPECTIONS.forEach(i => i.defects.forEach(d => totals[d.type] += d.count));
  const dCtx = document.getElementById('qcDefectChart').getContext('2d');
  if(defectChartInstance) defectChartInstance.destroy();
  defectChartInstance = new Chart(dCtx, {
    type:'doughnut',
    data:{ labels:DEFECT_TYPES, datasets:[{ data:DEFECT_TYPES.map(t=>totals[t]), backgroundColor:['#EF4444','#F59E0B','#3B82F6','#6D5DF6','#7C3AED','#9CA3AF'], borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'70%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', padding:10, font:{size:10.5,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } } }
  });
}

/* ---------------- TABS + LIST ---------------- */
let activeTab = 'queue';
let qcFilters = { search:'' };

function setTab(tab){
  activeTab = tab;
  document.querySelectorAll('.qc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  renderList();
}

function getTabItems(){
  if(activeTab === 'queue') return INSPECTIONS.filter(i => i.status==='Pending');
  if(activeTab === 'passed') return INSPECTIONS.filter(i => i.status==='Passed');
  if(activeTab === 'failed') return INSPECTIONS.filter(i => i.status==='Failed');
  if(activeTab === 'approvals') return INSPECTIONS.filter(i => i.status==='Failed' && i.approvalState==='pending');
  return INSPECTIONS;
}

function renderList(){
  let items = getTabItems();
  if(qcFilters.search) items = items.filter(i => i.batchId.toLowerCase().includes(qcFilters.search) || i.model.toLowerCase().includes(qcFilters.search));

  document.getElementById('qcListCount').textContent = items.length + ' item' + (items.length===1?'':'s');

  const wrap = document.getElementById('qcList');
  if(activeTab === 'approvals'){
    wrap.innerHTML = items.map(i => `
      <div class="qc-approval-card">
        <div class="qc-approval-head">
          <div>
            <b>${i.batchId}</b> <span class="qc-approval-model">${i.model} · ${i.qty} units</span>
            <div class="qc-approval-sub">Inspected by ${i.inspector} on ${fmtDate(i.date)}</div>
          </div>
          <span class="badge badge-${i.severity==='High'?'danger':i.severity==='Medium'?'warning':'neutral'}">${i.severity} severity</span>
        </div>
        <div class="qc-defect-tags">${i.defects.map(d=>`<span class="defect-tag">${d.type} × ${d.count}</span>`).join('')}</div>
        <p class="qc-notes-preview">${i.notes}</p>
        <div class="qc-approval-actions">
          <button class="btn btn-secondary btn-sm" onclick="openInspectDrawer('${i.id}')"><i class="ri-file-text-line"></i>View report</button>
          <button class="btn btn-danger btn-sm" onclick="decideApproval('${i.id}','Rejected')"><i class="ri-close-circle-line"></i>Reject &amp; scrap</button>
          <button class="btn btn-primary btn-sm" onclick="decideApproval('${i.id}','Approved')"><i class="ri-check-line"></i>Approve rework</button>
        </div>
      </div>`).join('') || emptyState('Nothing awaiting approval', 'Failed inspections that need a supervisor decision will show up here.');
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Batch</th><th>Model</th><th>Qty</th><th>Inspector</th><th>Date</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${items.map(i => `
        <tr>
          <td><b>${i.batchId}</b></td>
          <td>${i.model}</td>
          <td>${i.qty}</td>
          <td>${i.inspector}</td>
          <td>${fmtDate(i.date)}</td>
          <td><span class="badge badge-${QC_STATUS_BADGE[i.status]}"><span class="badge-dot"></span>${i.status==='Failed' && i.approvalState ? i.approvalState : i.status}</span></td>
          <td>${i.status==='Pending'
              ? `<button class="btn btn-primary btn-sm" onclick="openInspectDrawer('${i.id}')"><i class="ri-search-eye-line"></i>Inspect</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="openInspectDrawer('${i.id}')"><i class="ri-file-text-line"></i>View</button>`}</td>
        </tr>`).join('') || `<tr><td colspan="7">${emptyState('No items here', 'This list is empty for now.')}</td></tr>`}
    </tbody>
  </table>`;
}
function emptyState(title, sub){
  return `<div class="empty-state"><i class="ri-shield-check-line"></i><b>${title}</b><span>${sub}</span></div>`;
}

/* ---------------- INSPECTION DRAWER ---------------- */
let draftDefects = {};
let draftPhotos = [];

function openInspectDrawer(id){
  const item = INSPECTIONS.find(x=>x.id===id);
  if(!item) return;
  window.currentInspection = id;

  document.getElementById('drawerQcId').textContent = item.id;
  document.getElementById('drawerBatchId').textContent = item.batchId + ' · ' + item.model + ' · ' + item.qty + ' units';
  document.getElementById('drawerInspector').textContent = item.inspector;
  document.getElementById('drawerDate').textContent = fmtDate(item.date);
  document.getElementById('drawerStatus').className = 'badge badge-' + QC_STATUS_BADGE[item.status];
  document.getElementById('drawerStatus').innerHTML = `<span class="badge-dot"></span>${item.status==='Failed' && item.approvalState ? item.approvalState : item.status}`;

  draftDefects = {};
  item.defects.forEach(d => draftDefects[d.type] = d.count);
  draftPhotos = item.photos.map(p=>p.label);

  renderDefectChecklist();
  renderPhotoGallery();
  document.getElementById('drawerNotes').value = item.notes || '';

  const readOnly = item.status !== 'Pending';
  document.getElementById('decisionRow').style.display = readOnly ? 'none' : 'flex';
  document.getElementById('drawerNotes').disabled = readOnly;
  document.getElementById('attachPhotoBtn').style.display = readOnly ? 'none' : 'inline-flex';
  document.querySelectorAll('.defect-stepper button').forEach(b => b.disabled = readOnly);

  NexusApp.openDrawer('qcDrawer');
}

function renderDefectChecklist(){
  document.getElementById('defectChecklist').innerHTML = DEFECT_TYPES.map(type => {
    const count = draftDefects[type] || 0;
    return `
    <div class="defect-row">
      <span class="defect-label">${type}</span>
      <div class="defect-stepper">
        <button onclick="stepDefect('${type}',-1)"><i class="ri-subtract-line"></i></button>
        <span>${count}</span>
        <button onclick="stepDefect('${type}',1)"><i class="ri-add-line"></i></button>
      </div>
    </div>`;
  }).join('');
}
function stepDefect(type, delta){
  const next = Math.max(0, (draftDefects[type]||0) + delta);
  draftDefects[type] = next;
  renderDefectChecklist();
}

function renderPhotoGallery(){
  document.getElementById('photoGallery').innerHTML = draftPhotos.map((label,i) => `
    <div class="photo-thumb"><i class="ri-image-2-line"></i><span>${label}</span><i class="ri-close-circle-fill photo-remove" onclick="removePhoto(${i})"></i></div>
  `).join('') || `<span class="muted-note">No photos attached yet.</span>`;
}
function attachMockPhoto(){
  draftPhotos.push('inspection-photo-' + (draftPhotos.length+1) + '.jpg');
  renderPhotoGallery();
  NexusApp.toast('Photo attached', 'success');
}
function removePhoto(i){
  draftPhotos.splice(i,1);
  renderPhotoGallery();
}

function submitInspection(decision){
  const item = INSPECTIONS.find(x=>x.id===window.currentInspection);
  if(!item) return;

  const defects = Object.entries(draftDefects).filter(([,c])=>c>0).map(([type,count])=>({type,count}));
  if(decision === 'Failed' && defects.length === 0){
    NexusApp.toast('Add at least one defect before marking as failed', 'error');
    return;
  }

  item.status = decision;
  item.defects = decision === 'Failed' ? defects : [];
  item.photos = decision === 'Failed' ? draftPhotos.map(label=>({label})) : [];
  item.notes = document.getElementById('drawerNotes').value;
  item.severity = decision === 'Failed' ? (defects.reduce((s,d)=>s+d.count,0) > 8 ? 'High' : defects.reduce((s,d)=>s+d.count,0) > 3 ? 'Medium' : 'Low') : null;
  item.approvalState = decision === 'Failed' ? 'pending' : null;

  persistInspections();
  NexusApp.closeDrawer('qcDrawer');
  NexusApp.toast(`${item.batchId} marked as ${decision}`, decision==='Passed'?'success':'error');
  renderAll();
}

function decideApproval(id, decision){
  const item = INSPECTIONS.find(x=>x.id===id);
  if(!item) return;
  item.approvalState = decision;
  persistInspections();
  NexusApp.toast(`${item.batchId} ${decision.toLowerCase()}`, decision==='Approved'?'success':'error');
  renderAll();
}

/* ---------------- EXPORT ---------------- */
function exportQCReportCSV(){
  const items = getTabItems();
  const rows = [['Inspection ID','Batch','Model','Qty','Inspector','Date','Status','Severity','Defects']];
  items.forEach(i => rows.push([i.id, i.batchId, i.model, i.qty, i.inspector, fmtDate(i.date), i.approvalState||i.status, i.severity||'', i.defects.map(d=>d.type+':'+d.count).join('; ')]));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `quality-control-${activeTab}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Report exported', 'success');
}

/* ---------------- WIRES ---------------- */
function wireToolbar(){
  document.getElementById('qcSearch').addEventListener('input', e => { qcFilters.search = e.target.value.trim().toLowerCase(); renderList(); });
  document.querySelectorAll('.qc-tab').forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
}

function renderAll(){
  renderKPIs();
  renderCharts();
  renderList();
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('quality.html', session);
  seedInspections();
  wireToolbar();
  renderAll();
});
