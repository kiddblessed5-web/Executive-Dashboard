/* ============================================================
   SAGERO CREATIONS — Workers module
============================================================ */

const ROLES = ['Unboxing','Software Install','Quality Check','Resealing','Packaging'];
const SKILLS_POOL = ['Unboxing','Software Flashing','QC Inspection','Resealing','Packaging','Barcode Scanning','Inventory Count','Customer Devices'];
const STATUS_BADGE = { 'Active':'success', 'Warning':'warning', 'Inactive':'danger' };

let WORKERS = [];

function seedWorkers(){
  const saved = localStorage.getItem('nexus_workers');
  if(saved){ WORKERS = JSON.parse(saved); return; }

  const names = ['Grace Achieng','Kevin Otieno','Mercy Njoki','Samuel Kiprono','Peter Mutua','Joy Chebet',
    'Dennis Kamau','Ruth Wanjiku','Collins Odhiambo','Faith Auma','Brian Ochieng','Esther Nyambura'];
  const colors = ['#6D5DF6','#3B82F6','#7C3AED','#4F46E5','#5B5CF6'];

  WORKERS = names.map((name, i) => {
    const role = ROLES[i % ROLES.length];
    const output = 180 + Math.round(Math.random()*140);
    const attendance = 82 + Math.round(Math.random()*17);
    const status = attendance < 85 ? 'Warning' : (i === 11 ? 'Inactive' : 'Active');
    const skillCount = 2 + (i % 3);
    const skills = [...SKILLS_POOL].sort(()=>Math.random()-0.5).slice(0, skillCount);
    const history = Array.from({length:7}, () => 140 + Math.round(Math.random()*160));
    return {
      id: 'W-' + (2001 + i),
      name, role, department:'Production',
      color: colors[i % colors.length],
      dailyOutput: output,
      attendanceRate: attendance,
      status,
      skills,
      joined: new Date(Date.now() - (200 + i*17)*86400000).toISOString().slice(0,10),
      warnings: status === 'Warning' ? [{ text:'Late check-in 3 times this week', date:'2 days ago' }] : [],
      achievements: output > 260 ? [{ text:'Top performer — 3 weeks running', icon:'ri-medal-line' }] : (attendance >= 96 ? [{ text:'Perfect attendance streak', icon:'ri-calendar-check-line' }] : []),
      productionHistory: history,
      attendanceLog: Array.from({length:30}, () => attendance/100 > Math.random() ? (Math.random()>0.15?'present':'late') : 'absent'),
      documents: [
        { name:'National ID (copy)', type:'PDF', size:'420 KB' },
        { name:'Employment contract', type:'PDF', size:'180 KB' },
        { name:'Safety training certificate', type:'PDF', size:'96 KB' },
      ],
      payslips: [
        { period:'Week of Jul 7 – 12', days:6, gross: 6*600, status:'Paid' },
        { period:'Week of Jun 30 – Jul 5', days:5, gross: 5*600, status:'Paid' },
        { period:'Week of Jun 23 – 28', days:6, gross: 6*600, status:'Paid' },
      ],
    };
  });
  persistWorkers();
}
function persistWorkers(){ localStorage.setItem('nexus_workers', JSON.stringify(WORKERS)); }
function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

let wFilters = { search:'', role:'all', status:'all' };
let wSort = 'output-desc';

function getFilteredSortedWorkers(){
  let list = WORKERS.filter(w => {
    if(wFilters.search && !w.name.toLowerCase().includes(wFilters.search)) return false;
    if(wFilters.role !== 'all' && w.role !== wFilters.role) return false;
    if(wFilters.status !== 'all' && w.status !== wFilters.status) return false;
    return true;
  });
  switch(wSort){
    case 'output-desc': list.sort((a,b)=>b.dailyOutput-a.dailyOutput); break;
    case 'attendance-desc': list.sort((a,b)=>b.attendanceRate-a.attendanceRate); break;
    case 'name-asc': list.sort((a,b)=>a.name.localeCompare(b.name)); break;
  }
  return list;
}

const RANK_MEDAL = ['ri-medal-fill','ri-medal-2-fill','ri-medal-2-line'];
const RANK_COLOR = ['#F59E0B','#9CA3AF','#B45309'];

function renderWorkerGrid(){
  const rankedByOutput = [...WORKERS].sort((a,b)=>b.dailyOutput-a.dailyOutput).map(w=>w.id);
  const list = getFilteredSortedWorkers();
  const grid = document.getElementById('workerGrid');
  document.getElementById('workerCount').textContent = list.length + ' workers';

  grid.innerHTML = list.map(w => {
    const rank = rankedByOutput.indexOf(w.id);
    const isTop3 = rank < 3;
    return `
    <div class="worker-card" onclick="openWorkerDrawer('${w.id}')">
      ${isTop3 ? `<div class="worker-rank-badge" style="color:${RANK_COLOR[rank]}"><i class="${RANK_MEDAL[rank]}"></i></div>` : ''}
      <button class="worker-card-remove" data-tip="Remove worker" onclick="event.stopPropagation(); confirmRemoveWorker('${w.id}')"><i class="ri-close-line"></i></button>
      <div class="worker-card-top">
        <div class="avatar" style="width:52px;height:52px;font-size:16px;background:${w.color};">${initials(w.name)}</div>
        <div>
          <div class="worker-card-name">${w.name}</div>
          <div class="worker-card-role">${w.role}</div>
        </div>
      </div>
      <div class="worker-card-stats">
        <div><small>Daily output</small><b>${w.dailyOutput} units</b></div>
        <div><small>Attendance</small><b>${w.attendanceRate}%</b></div>
      </div>
      <div class="worker-skills">
        ${w.skills.slice(0,3).map(s=>`<span class="skill-chip">${s}</span>`).join('')}
        ${w.skills.length>3 ? `<span class="skill-chip more">+${w.skills.length-3}</span>` : ''}
      </div>
      <div class="worker-card-foot">
        <span class="badge badge-${STATUS_BADGE[w.status]}"><span class="badge-dot"></span>${w.status}</span>
        ${w.achievements.length ? `<span data-tip="${w.achievements[0].text}"><i class="${w.achievements[0].icon}" style="color:var(--warning);"></i></span>` : ''}
      </div>
    </div>`;
  }).join('') || `<div class="empty-state"><i class="ri-team-line"></i><b>No workers match your filters</b><span>Try adjusting search, role or status.</span></div>`;
}

function wireWorkerToolbar(){
  document.getElementById('workerSearch').addEventListener('input', e => { wFilters.search = e.target.value.trim().toLowerCase(); renderWorkerGrid(); });
  document.getElementById('workerRoleFilter').addEventListener('change', e => { wFilters.role = e.target.value; renderWorkerGrid(); });
  document.getElementById('workerStatusFilter').addEventListener('change', e => { wFilters.status = e.target.value; renderWorkerGrid(); });
  document.getElementById('workerSort').addEventListener('change', e => { wSort = e.target.value; renderWorkerGrid(); });
}

/* ---------------- WORKER DRAWER ---------------- */
let perfChartInstance = null;

function openWorkerDrawer(id){
  const w = WORKERS.find(x=>x.id===id);
  if(!w) return;
  window.currentDrawerWorker = id;

  document.getElementById('wdAvatar').style.background = w.color;
  document.getElementById('wdAvatar').textContent = initials(w.name);
  document.getElementById('wdName').textContent = w.name;
  document.getElementById('wdRole').textContent = w.role + ' · ' + w.department;
  document.getElementById('wdStatus').className = 'badge badge-' + STATUS_BADGE[w.status];
  document.getElementById('wdStatus').innerHTML = `<span class="badge-dot"></span>${w.status}`;

  document.getElementById('wdMeta').innerHTML = `
    <div><small>Worker ID</small><b>${w.id}</b></div>
    <div><small>Joined</small><b>${new Date(w.joined).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</b></div>
    <div><small>Daily output</small><b>${w.dailyOutput} units</b></div>
    <div><small>Attendance rate</small><b>${w.attendanceRate}%</b></div>`;

  document.getElementById('wdSkills').innerHTML = w.skills.map(s=>`<span class="skill-chip">${s}</span>`).join('');

  document.getElementById('wdAchievements').innerHTML = w.achievements.length
    ? w.achievements.map(a=>`<div class="achieve-row"><i class="${a.icon}"></i>${a.text}</div>`).join('')
    : `<span class="muted-note">No achievements yet.</span>`;

  document.getElementById('wdWarnings').innerHTML = w.warnings.length
    ? w.warnings.map(a=>`<div class="warning-row"><i class="ri-alert-line"></i><div><b>${a.text}</b><small>${a.date}</small></div></div>`).join('')
    : `<span class="muted-note">No warnings on record.</span>`;

  // performance chart
  const ctx = document.getElementById('wdPerfChart').getContext('2d');
  if(perfChartInstance) perfChartInstance.destroy();
  perfChartInstance = new Chart(ctx, {
    type:'bar',
    data:{ labels:['D-6','D-5','D-4','D-3','D-2','D-1','Today'], datasets:[{ data:w.productionHistory, backgroundColor:w.color, borderRadius:8, maxBarThickness:26 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#14162B', padding:8, cornerRadius:8 } },
      scales:{ x:{ grid:{display:false}, border:{display:false} }, y:{ grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false} } } }
  });

  // attendance heat strip (last 30 days)
  document.getElementById('wdAttendanceStrip').innerHTML = w.attendanceLog.map(status => {
    const cls = status === 'present' ? 'att-present' : status === 'late' ? 'att-late' : 'att-absent';
    return `<span class="att-cell ${cls}" data-tip="${status}"></span>`;
  }).join('');
  const present = w.attendanceLog.filter(s=>s==='present').length;
  const late = w.attendanceLog.filter(s=>s==='late').length;
  const absent = w.attendanceLog.filter(s=>s==='absent').length;
  document.getElementById('wdAttendanceSummary').innerHTML = `
    <div><span class="att-dot att-present"></span>Present <b>${present}</b></div>
    <div><span class="att-dot att-late"></span>Late <b>${late}</b></div>
    <div><span class="att-dot att-absent"></span>Absent <b>${absent}</b></div>`;

  // payroll
  document.getElementById('wdPayslips').innerHTML = w.payslips.map(p => `
    <div class="payslip-row">
      <div><b>${p.period}</b><small>${p.days} days worked</small></div>
      <div class="payslip-amt">KES ${p.gross.toLocaleString()}</div>
      <span class="badge badge-success">${p.status}</span>
    </div>`).join('');

  // documents
  document.getElementById('wdDocuments').innerHTML = w.documents.map(d => `
    <div class="doc-row">
      <div class="doc-icon"><i class="ri-file-text-line"></i></div>
      <div><b>${d.name}</b><small>${d.type} · ${d.size}</small></div>
      <button class="icon-btn" style="width:32px;height:32px;" onclick="downloadWorkerDoc('${w.name.replace(/'/g,"")}','${d.name.replace(/'/g,"")}')"><i class="ri-download-2-line"></i></button>
    </div>`).join('');

  document.querySelectorAll('.wd-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.wd-tab[data-tab="overview"]').classList.add('active');
  document.querySelectorAll('.wd-tabpanel').forEach(p=>p.classList.remove('active'));
  document.querySelector('.wd-tabpanel[data-panel="overview"]').classList.add('active');

  NexusApp.openDrawer('workerDrawer');
}

function downloadWorkerDoc(workerName, docName){
  const blob = new Blob([`Sagero Creations\n\nWorker: ${workerName}\nDocument: ${docName}\nGenerated: ${new Date().toLocaleString()}\n\nThis is a demo export.`], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = docName.replace(/\s+/g,'_') + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Downloaded ' + docName, 'success');
}

function issueWarning(){
  const w = WORKERS.find(x=>x.id===window.currentDrawerWorker);
  if(!w) return;
  w.warnings.unshift({ text:'Manual warning issued by supervisor', date:'Just now' });
  w.status = 'Warning';
  persistWorkers();
  NexusApp.toast('Warning issued to ' + w.name, 'warning');
  openWorkerDrawer(w.id);
  renderWorkerGrid();
}

/* ---------------- REMOVE WORKER ---------------- */
let pendingRemoveId = null;
function confirmRemoveWorker(id){
  const w = WORKERS.find(x=>x.id===id);
  if(!w) return;
  pendingRemoveId = id;
  document.getElementById('removeWorkerName').textContent = w.name;
  NexusApp.openModal('modal-removeworker');
}
function removeWorker(){
  if(!pendingRemoveId) return;
  const w = WORKERS.find(x=>x.id===pendingRemoveId);
  if(!w) return;
  WORKERS = WORKERS.filter(x=>x.id!==pendingRemoveId);
  persistWorkers();
  NexusApp.closeModal('modal-removeworker');
  NexusApp.closeDrawer('workerDrawer');
  renderWorkerGrid();
  NexusApp.toast(w.name + ' removed from the roster', 'info');
  pendingRemoveId = null;
}

/* ---------------- NEW WORKER MODAL ---------------- */
function openNewWorkerModal(){ NexusApp.openModal('modal-newworker'); }
function submitNewWorker(e){
  e.preventDefault();
  const name = document.getElementById('nw-name').value.trim();
  const role = document.getElementById('nw-role').value;
  if(!name){ NexusApp.toast('Please enter a worker name','error'); return; }

  const colors = ['#6D5DF6','#3B82F6','#7C3AED','#4F46E5','#5B5CF6'];
  WORKERS.unshift({
    id: 'W-' + (2001 + WORKERS.length + Math.floor(Math.random()*90)),
    name, role, department:'Production', color: colors[Math.floor(Math.random()*colors.length)],
    dailyOutput: 0, attendanceRate: 100, status:'Active',
    skills:[role], joined: new Date().toISOString().slice(0,10),
    warnings:[], achievements:[], productionHistory:[0,0,0,0,0,0,0],
    attendanceLog: Array(30).fill('present'),
    documents:[], payslips:[]
  });
  persistWorkers();
  NexusApp.closeModal('modal-newworker');
  NexusApp.toast(name + ' added to the team','success');
  renderWorkerGrid();
  e.target.reset();
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('workers.html', session);
  seedWorkers();
  wireWorkerToolbar();
  renderWorkerGrid();

  document.querySelectorAll('.wd-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.wd-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.wd-tabpanel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.wd-tabpanel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
});
