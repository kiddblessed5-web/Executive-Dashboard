/* ============================================================
   SAGERO CREATIONS — Audit Logs module
============================================================ */

const AUDIT_USERS = ['SAGERO','Wei Zhang','Li Chen','HR Desk','Kevin Otieno','Grace Achieng','System'];
const AUDIT_CATEGORIES = ['Production','People','Payroll','Messages','Quality Control','Inventory','Settings','Security','Orders'];

const AUDIT_TEMPLATES = [
  { cat:'Production', icon:'ri-smartphone-line', text:u=>`${u} created batch BX-${1030+Math.floor(Math.random()*90)}` },
  { cat:'Production', icon:'ri-flow-chart', text:u=>`${u} moved a batch to Quality Check` },
  { cat:'People', icon:'ri-user-add-line', text:u=>`${u} added a new worker to the roster` },
  { cat:'People', icon:'ri-calendar-check-line', text:u=>`${u} marked attendance for the morning shift` },
  { cat:'Payroll', icon:'ri-money-dollar-circle-line', text:u=>`${u} processed weekly payroll` },
  { cat:'Payroll', icon:'ri-file-text-line', text:u=>`${u} downloaded a payslip` },
  { cat:'Messages', icon:'ri-chat-3-line', text:u=>`${u} started a new conversation` },
  { cat:'Quality Control', icon:'ri-shield-check-line', text:u=>`${u} marked an inspection as Failed` },
  { cat:'Quality Control', icon:'ri-checkbox-circle-line', text:u=>`${u} approved a rework decision` },
  { cat:'Inventory', icon:'ri-qr-scan-2-line', text:u=>`${u} scanned a batch of devices in` },
  { cat:'Inventory', icon:'ri-file-excel-2-line', text:u=>`${u} exported a device list to Excel` },
  { cat:'Settings', icon:'ri-settings-4-line', text:u=>`${u} updated notification preferences` },
  { cat:'Settings', icon:'ri-key-2-line', text:u=>`${u} generated a new API key` },
  { cat:'Security', icon:'ri-login-box-line', text:u=>`${u} signed in` },
  { cat:'Security', icon:'ri-shield-keyhole-line', text:u=>`${u} enabled two-factor authentication` },
  { cat:'Security', icon:'ri-logout-box-line', text:u=>`${u} revoked an active session` },
];

let AUDIT_LOG = [];

function seedAuditLog(){
  const saved = localStorage.getItem('nexus_audit_log');
  if(saved){ AUDIT_LOG = JSON.parse(saved); return; }
  AUDIT_LOG = [];
  const now = Date.now();
  for(let i=0;i<80;i++){
    const tmpl = AUDIT_TEMPLATES[Math.floor(Math.random()*AUDIT_TEMPLATES.length)];
    const user = tmpl.cat==='Security' && Math.random()>0.5 ? AUDIT_USERS[Math.floor(Math.random()*(AUDIT_USERS.length-1))] : AUDIT_USERS[Math.floor(Math.random()*AUDIT_USERS.length)];
    const minutesAgo = Math.floor(Math.random()*14*24*60);
    AUDIT_LOG.push({
      id:'A-'+(9000+i),
      user, category:tmpl.cat, icon:tmpl.icon,
      text: tmpl.text(user),
      time: new Date(now - minutesAgo*60000).toISOString(),
      ip: '10.0.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255),
    });
  }
  AUDIT_LOG.sort((a,b)=> new Date(b.time)-new Date(a.time));
  persistAuditLog();
}
function persistAuditLog(){ localStorage.setItem('nexus_audit_log', JSON.stringify(AUDIT_LOG)); }

/* ============================================================
   BACKEND MODE — real audit trail (see backend_schema_phase4.sql)
============================================================ */
async function loadAuditLogFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending:false }).limit(500);
  if(error){ NexusApp.toast('Could not load audit log: ' + error.message, 'error'); AUDIT_LOG = []; return; }
  AUDIT_LOG = (data || []).map(row => ({
    id: row.id, user: row.actor_name, category: row.category, icon: categoryIcon(row.category),
    text: row.event_text, time: row.created_at, ip: row.ip_address || '—',
  }));
}
function categoryIcon(cat){
  const map = { Production:'ri-smartphone-line', People:'ri-user-add-line', Payroll:'ri-money-dollar-circle-line',
    Messages:'ri-chat-3-line', 'Quality Control':'ri-shield-check-line', Inventory:'ri-qr-scan-2-line',
    Settings:'ri-settings-4-line', Security:'ri-login-box-line', Orders:'ri-shopping-bag-3-line' };
  return map[cat] || 'ri-information-line';
}

function fmtDateTime(iso){ return new Date(iso).toLocaleString('en-GB',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
function isToday(iso){ return new Date(iso).toDateString() === new Date().toDateString(); }

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const today = AUDIT_LOG.filter(a=>isToday(a.time));
  const counts = {};
  AUDIT_LOG.forEach(a => counts[a.user] = (counts[a.user]||0)+1);
  const mostActive = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  const securityEvents = AUDIT_LOG.filter(a=>a.category==='Security').length;

  document.getElementById('kpiTotal').textContent = AUDIT_LOG.length.toLocaleString();
  document.getElementById('kpiToday').textContent = today.length;
  document.getElementById('kpiMostActive').textContent = mostActive ? mostActive[0] : '—';
  document.getElementById('kpiSecurity').textContent = securityEvents;
}

/* ---------------- FILTERS + LIST ---------------- */
let filters = { search:'', category:'all', user:'all' };

function populateFilters(){
  const userSel = document.getElementById('filterUser');
  const users = SagoBackend?.isConfigured()
    ? [...new Set(AUDIT_LOG.map(a=>a.user))].sort()
    : AUDIT_USERS;
  userSel.innerHTML = '<option value="all">All users</option>' + users.map(u=>`<option>${u}</option>`).join('');
}

function getFiltered(){
  return AUDIT_LOG.filter(a => {
    if(filters.search && !a.text.toLowerCase().includes(filters.search)) return false;
    if(filters.category !== 'all' && a.category !== filters.category) return false;
    if(filters.user !== 'all' && a.user !== filters.user) return false;
    return true;
  });
}

function renderList(){
  const items = getFiltered();
  document.getElementById('logCount').textContent = items.length.toLocaleString() + ' event' + (items.length===1?'':'s');

  document.getElementById('logTableBody').innerHTML = items.slice(0,200).map(a => `
    <tr>
      <td><div class="log-cell"><div class="log-icon"><i class="${a.icon}"></i></div><span>${a.text}</span></div></td>
      <td><span class="badge badge-neutral">${a.category}</span></td>
      <td>${a.user}</td>
      <td>${fmtDateTime(a.time)}</td>
      <td><code class="ip-code">${a.ip}</code></td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:26px;">No events match your filters</td></tr>`;

  if(items.length > 200){
    document.getElementById('logTruncatedNote').style.display = 'block';
  } else {
    document.getElementById('logTruncatedNote').style.display = 'none';
  }
}

/* ---------------- CATEGORY CHIPS ---------------- */
function renderCategoryChips(){
  const wrap = document.getElementById('categoryChips');
  const chips = ['all', ...AUDIT_CATEGORIES];
  wrap.innerHTML = chips.map(c => `
    <div class="cat-chip ${filters.category===c?'active':''}" onclick="setCategory('${c}')">${c==='all'?'All categories':c}</div>
  `).join('');
}
function setCategory(cat){
  filters.category = cat;
  renderCategoryChips();
  renderList();
}

/* ---------------- EXPORT ---------------- */
function exportAuditCSV(){
  const items = getFiltered();
  const rows = [['ID','Event','Category','User','Timestamp','IP Address']];
  items.forEach(a => rows.push([a.id, a.text, a.category, a.user, fmtDateTime(a.time), a.ip]));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sagero-audit-log.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Audit log exported', 'success');
}
function exportAuditXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load — try CSV', 'error'); return; }
  const items = getFiltered();
  const rows = items.map(a => ({ 'Event':a.text, 'Category':a.category, 'User':a.user, 'Timestamp':fmtDateTime(a.time), 'IP Address':a.ip }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
  XLSX.writeFile(wb, 'sagero-audit-log.xlsx');
  NexusApp.toast('Audit log exported as Excel workbook', 'success');
}

/* ---------------- WIRES ---------------- */
function wireToolbar(){
  document.getElementById('logSearch').addEventListener('input', e => { filters.search = e.target.value.trim().toLowerCase(); renderList(); });
  document.getElementById('filterUser').addEventListener('change', e => { filters.user = e.target.value; renderList(); });
}

let auditDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(auditDidInit) return;
  auditDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('audit.html', session);

  if(SagoBackend?.isConfigured()){
    await loadAuditLogFromBackend();
  } else {
    seedAuditLog();
  }

  populateFilters();
  renderCategoryChips();
  wireToolbar();
  renderKPIs();
  renderList();
});
