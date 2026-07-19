/* ============================================================
   NEXUS OPERATIONS OS — Settings module
============================================================ */

/* ---------------- TAB NAV ---------------- */
function setSettingsTab(tab){
  document.querySelectorAll('.settings-nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.dataset.panel===tab));
}

/* ---------------- COMPANY ---------------- */
function loadCompany(){
  const saved = localStorage.getItem('nexus_settings_company');
  const c = saved ? JSON.parse(saved) : {
    name:'Nexus Technologies', industry:'Electronics Processing & Refurbishment',
    address:'Industrial Area, Nairobi, Kenya', timezone:'Africa/Nairobi (GMT+3)',
    currency:'KES', dailyWage:600
  };
  document.getElementById('cmp-name').value = c.name;
  document.getElementById('cmp-industry').value = c.industry;
  document.getElementById('cmp-address').value = c.address;
  document.getElementById('cmp-timezone').value = c.timezone;
  document.getElementById('cmp-currency').value = c.currency;
  document.getElementById('cmp-wage').value = c.dailyWage;
}
function saveCompany(){
  const c = {
    name: document.getElementById('cmp-name').value,
    industry: document.getElementById('cmp-industry').value,
    address: document.getElementById('cmp-address').value,
    timezone: document.getElementById('cmp-timezone').value,
    currency: document.getElementById('cmp-currency').value,
    dailyWage: document.getElementById('cmp-wage').value,
  };
  localStorage.setItem('nexus_settings_company', JSON.stringify(c));
  NexusApp.toast('Company details saved', 'success');
}

/* ---------------- APPEARANCE ---------------- */
function loadAppearance(){
  const density = localStorage.getItem('nexus_density') || 'comfortable';
  document.querySelectorAll('.density-pill').forEach(p => p.classList.toggle('active', p.dataset.density===density));
  document.body.classList.toggle('density-compact', density==='compact');

  const collapsedDefault = localStorage.getItem('nexus_sidebar_default') || 'expanded';
  document.querySelectorAll('.sidebar-default-pill').forEach(p => p.classList.toggle('active', p.dataset.state===collapsedDefault));

  updateAppearanceThemeUI();
}
function updateAppearanceThemeUI(){
  const isDark = document.body.classList.contains('dark');
  document.getElementById('appearanceThemeLabel').textContent = isDark ? 'Dark' : 'Light';
  document.getElementById('appearanceThemeSwitch').classList.toggle('on', isDark);
}
function toggleAppearanceTheme(){
  NexusApp.toggleTheme();
  updateAppearanceThemeUI();
}
function setDensity(density){
  localStorage.setItem('nexus_density', density);
  document.body.classList.toggle('density-compact', density==='compact');
  document.querySelectorAll('.density-pill').forEach(p => p.classList.toggle('active', p.dataset.density===density));
  NexusApp.toast('Layout density updated', 'success');
}
function setSidebarDefault(state){
  localStorage.setItem('nexus_sidebar_default', state);
  document.querySelectorAll('.sidebar-default-pill').forEach(p => p.classList.toggle('active', p.dataset.state===state));
  if(state === 'collapsed'){ localStorage.setItem('nexus_sidebar_collapsed','1'); }
  else { localStorage.setItem('nexus_sidebar_collapsed','0'); }
  document.querySelector('.sidebar')?.classList.toggle('collapsed', state==='collapsed');
  NexusApp.toast('Default sidebar state updated', 'success');
}

/* ---------------- NOTIFICATIONS ---------------- */
const NOTIF_DEFAULTS = { email:true, push:false, sms:false, digest:true, batchDelay:true, attendance:true, payroll:true, quality:false };
let notifSettings = {};
function loadNotifications(){
  const saved = localStorage.getItem('nexus_settings_notifications');
  notifSettings = saved ? JSON.parse(saved) : { ...NOTIF_DEFAULTS };
  document.querySelectorAll('.notif-switch').forEach(sw => sw.classList.toggle('on', !!notifSettings[sw.dataset.key]));
}
function toggleNotif(key, el){
  notifSettings[key] = !notifSettings[key];
  el.classList.toggle('on', notifSettings[key]);
  localStorage.setItem('nexus_settings_notifications', JSON.stringify(notifSettings));
}

/* ---------------- ROLES ---------------- */
const ROLES = [
  { id:'superadmin', name:'Super Admin', desc:'Full system access across every module.', users:1, color:'#EF4444' },
  { id:'production', name:'Production Manager', desc:'Manages batches, workflow and production targets.', users:2, color:'#6D5DF6' },
  { id:'chinese', name:'Chinese Manager', desc:'Oversees assigned batches on the floor.', users:4, color:'#3B82F6' },
  { id:'supervisor', name:'Supervisor', desc:'Day-to-day floor supervision and worker allocation.', users:3, color:'#7C3AED' },
  { id:'worker', name:'Worker', desc:'Production floor staff — limited to their own records.', users:12, color:'#4F46E5' },
  { id:'hr', name:'HR', desc:'Manages worker records, attendance and onboarding.', users:2, color:'#5B5CF6' },
  { id:'payroll', name:'Payroll Officer', desc:'Runs payroll and manages compensation records.', users:1, color:'#16A34A' },
  { id:'viewer', name:'Viewer', desc:'Read-only access to dashboards and reports.', users:3, color:'#9CA3AF' },
];
function renderRoles(){
  document.getElementById('rolesGrid').innerHTML = ROLES.map(r => `
    <div class="role-card">
      <div class="role-card-top">
        <span class="role-dot" style="background:${r.color};"></span>
        <b>${r.name}</b>
      </div>
      <p>${r.desc}</p>
      <div class="role-card-foot">
        <span>${r.users} user${r.users===1?'':'s'}</span>
        <button class="btn btn-ghost btn-sm" onclick="viewRolePermissions('${r.id}')">View permissions<i class="ri-arrow-right-s-line"></i></button>
      </div>
    </div>`).join('');
}
function viewRolePermissions(roleId){
  setSettingsTab('permissions');
  document.querySelectorAll('.settings-nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab==='permissions'));
  document.querySelectorAll('.perm-col-highlight').forEach(el=>el.classList.remove('perm-col-highlight'));
  document.querySelectorAll(`[data-role-col="${roleId}"]`).forEach(el=>el.classList.add('perm-col-highlight'));
  const role = ROLES.find(r=>r.id===roleId);
  NexusApp.toast('Showing permissions for ' + role.name, 'info');
}

/* ---------------- PERMISSIONS MATRIX ---------------- */
const PERMISSIONS = [
  'View Dashboard','Manage Batches','Manage Workflow','Manage Workers','Manage Attendance',
  'Approve Payroll','Send Messages','View Reports','Manage Inventory','Manage Quality Control','Manage Settings & Users'
];
let permMatrix = {};
function loadPermissions(){
  const saved = localStorage.getItem('nexus_settings_permissions');
  if(saved){ permMatrix = JSON.parse(saved); return renderPermissionsMatrix(); }
  permMatrix = {};
  ROLES.forEach(r => {
    permMatrix[r.id] = {};
    PERMISSIONS.forEach((p,i) => {
      if(r.id==='superadmin') permMatrix[r.id][p] = true;
      else if(r.id==='viewer') permMatrix[r.id][p] = p==='View Dashboard' || p==='View Reports';
      else if(r.id==='worker') permMatrix[r.id][p] = p==='View Dashboard';
      else permMatrix[r.id][p] = i % (ROLES.indexOf(r)+2) === 0 || p==='View Dashboard';
    });
  });
  persistPermissions();
  renderPermissionsMatrix();
}
function persistPermissions(){ localStorage.setItem('nexus_settings_permissions', JSON.stringify(permMatrix)); }

function renderPermissionsMatrix(){
  const head = `<tr><th style="min-width:180px;">Permission</th>${ROLES.map(r=>`<th data-role-col="${r.id}" style="text-align:center;">${r.name}</th>`).join('')}</tr>`;
  const rows = PERMISSIONS.map(p => `
    <tr>
      <td style="font-weight:700;">${p}</td>
      ${ROLES.map(r => `
        <td data-role-col="${r.id}" style="text-align:center;">
          <input type="checkbox" class="perm-checkbox" ${permMatrix[r.id][p]?'checked':''} ${r.id==='superadmin'?'disabled':''}
            onchange="togglePermission('${r.id}','${p.replace(/'/g,"")}',this.checked)">
        </td>`).join('')}
    </tr>`).join('');
  document.getElementById('permMatrixHead').innerHTML = head;
  document.getElementById('permMatrixBody').innerHTML = rows;
}
function togglePermission(roleId, perm, checked){
  permMatrix[roleId][perm] = checked;
  persistPermissions();
}

/* ---------------- SECURITY ---------------- */
function submitPasswordChange(e){
  e.preventDefault();
  const current = document.getElementById('sec-current').value;
  const next = document.getElementById('sec-new').value;
  const confirm = document.getElementById('sec-confirm').value;
  if(!current || next.length < 6){ NexusApp.toast('New password must be at least 6 characters', 'error'); return; }
  if(next !== confirm){ NexusApp.toast('Passwords do not match', 'error'); return; }
  NexusApp.toast('Password updated', 'success');
  e.target.reset();
}
function toggle2FA(el){
  el.classList.toggle('on');
  localStorage.setItem('nexus_2fa', el.classList.contains('on') ? '1' : '0');
  NexusApp.toast(el.classList.contains('on') ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled', 'info');
}
function load2FA(){
  const on = localStorage.getItem('nexus_2fa') === '1';
  document.getElementById('twoFaSwitch').classList.toggle('on', on);
}

let SESSIONS = [];
function loadSessions(){
  const saved = localStorage.getItem('nexus_sessions_list');
  SESSIONS = saved ? JSON.parse(saved) : [
    { id:'s1', device:'Chrome on macOS', location:'Nairobi, Kenya', lastActive:'Active now', current:true },
    { id:'s2', device:'Nexus mobile app · iPhone', location:'Nairobi, Kenya', lastActive:'2 hours ago', current:false },
    { id:'s3', device:'Chrome on Windows', location:'Mombasa, Kenya', lastActive:'3 days ago', current:false },
  ];
  renderSessions();
}
function persistSessions(){ localStorage.setItem('nexus_sessions_list', JSON.stringify(SESSIONS)); }
function renderSessions(){
  document.getElementById('sessionsList').innerHTML = SESSIONS.map(s => `
    <div class="session-row">
      <div class="session-icon"><i class="${s.device.includes('mobile')?'ri-smartphone-line':'ri-computer-line'}"></i></div>
      <div class="session-meta"><b>${s.device} ${s.current?'<span class=\"badge badge-success\" style=\"margin-left:6px;\">This device</span>':''}</b><small>${s.location} · ${s.lastActive}</small></div>
      ${!s.current ? `<button class="btn btn-danger btn-sm" onclick="revokeSession('${s.id}')"><i class="ri-close-line"></i>Revoke</button>` : ''}
    </div>`).join('');
}
function revokeSession(id){
  SESSIONS = SESSIONS.filter(s => s.id !== id);
  persistSessions();
  renderSessions();
  NexusApp.toast('Session revoked', 'success');
}

/* ---------------- INTEGRATIONS ---------------- */
const INTEGRATIONS = [
  { id:'slack', name:'Slack', desc:'Mirror #production-floor alerts to Slack.', icon:'ri-slack-line', color:'#611f69' },
  { id:'gcal', name:'Google Calendar', desc:'Sync shift schedules and deadlines.', icon:'ri-calendar-2-line', color:'#4285F4' },
  { id:'quickbooks', name:'QuickBooks', desc:'Export payroll runs to accounting.', icon:'ri-file-chart-line', color:'#2CA01C' },
  { id:'zapier', name:'Zapier', desc:'Automate workflows across 5,000+ apps.', icon:'ri-flashlight-line', color:'#FF4A00' },
  { id:'whatsapp', name:'WhatsApp Business', desc:'Send batch and payroll alerts via WhatsApp.', icon:'ri-whatsapp-line', color:'#25D366' },
  { id:'gdrive', name:'Google Drive', desc:'Back up reports and documents automatically.', icon:'ri-drive-line', color:'#0F9D58' },
];
let integrationState = {};
function loadIntegrations(){
  const saved = localStorage.getItem('nexus_settings_integrations');
  integrationState = saved ? JSON.parse(saved) : { slack:true, gcal:true, quickbooks:false, zapier:false, whatsapp:false, gdrive:true };
  renderIntegrations();
}
function persistIntegrations(){ localStorage.setItem('nexus_settings_integrations', JSON.stringify(integrationState)); }
function renderIntegrations(){
  document.getElementById('integrationsGrid').innerHTML = INTEGRATIONS.map(i => {
    const connected = integrationState[i.id];
    return `
    <div class="integration-card">
      <div class="integration-icon" style="background:${i.color}1a; color:${i.color};"><i class="${i.icon}"></i></div>
      <div class="integration-meta"><b>${i.name}</b><span>${i.desc}</span></div>
      <button class="btn ${connected?'btn-secondary':'btn-primary'} btn-sm" onclick="toggleIntegration('${i.id}')">
        ${connected ? '<i class="ri-check-line"></i> Connected' : 'Connect'}
      </button>
    </div>`;
  }).join('');
}
function toggleIntegration(id){
  integrationState[id] = !integrationState[id];
  persistIntegrations();
  renderIntegrations();
  const item = INTEGRATIONS.find(i=>i.id===id);
  NexusApp.toast(integrationState[id] ? `Connected to ${item.name}` : `Disconnected from ${item.name}`, integrationState[id]?'success':'info');
}

/* ---------------- API KEYS ---------------- */
let API_KEYS = [];
function loadApiKeys(){
  const saved = localStorage.getItem('nexus_settings_apikeys');
  API_KEYS = saved ? JSON.parse(saved) : [
    { id:'k1', name:'Reporting integration', masked:'sk_live_••••••••ab12', created:'2026-05-02', lastUsed:'2 days ago', active:true },
    { id:'k2', name:'Mobile app (legacy)', masked:'sk_live_••••••••9f3c', created:'2026-02-14', lastUsed:'34 days ago', active:false },
  ];
  renderApiKeys();
}
function persistApiKeys(){ localStorage.setItem('nexus_settings_apikeys', JSON.stringify(API_KEYS)); }
function renderApiKeys(){
  document.getElementById('apiKeysBody').innerHTML = API_KEYS.map(k => `
    <tr>
      <td style="font-weight:700;">${k.name}</td>
      <td><code class="api-key-code">${k.masked}</code></td>
      <td>${k.created}</td>
      <td>${k.lastUsed}</td>
      <td><span class="badge badge-${k.active?'success':'neutral'}">${k.active?'Active':'Revoked'}</span></td>
      <td>${k.active ? `<button class="btn btn-danger btn-sm" onclick="revokeApiKey('${k.id}')"><i class="ri-close-line"></i>Revoke</button>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:20px;">No API keys yet</td></tr>`;
}
function revokeApiKey(id){
  const k = API_KEYS.find(x=>x.id===id);
  if(!k) return;
  k.active = false;
  persistApiKeys();
  renderApiKeys();
  NexusApp.toast('API key revoked', 'error');
}
function genRandomKey(){
  const chars = 'abcdef0123456789';
  let s = '';
  for(let i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function submitNewApiKey(e){
  e.preventDefault();
  const name = document.getElementById('nk-name').value.trim();
  if(!name){ NexusApp.toast('Name your API key first', 'error'); return; }
  const suffix = genRandomKey();
  const key = { id:'k'+Date.now(), name, masked:'sk_live_••••••••'+suffix, created:new Date().toISOString().slice(0,10), lastUsed:'Never', active:true };
  API_KEYS.unshift(key);
  persistApiKeys();
  renderApiKeys();
  NexusApp.closeModal('modal-newkey');
  e.target.reset();
  showKeyRevealModal('sk_live_' + genRandomKey() + genRandomKey() + suffix);
}
function showKeyRevealModal(fullKey){
  document.getElementById('revealedKey').textContent = fullKey;
  NexusApp.openModal('modal-keyreveal');
}
function copyRevealedKey(){
  const text = document.getElementById('revealedKey').textContent;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>NexusApp.toast('Copied to clipboard', 'success')).catch(()=>NexusApp.toast('Copied to clipboard', 'success'));
  } else {
    NexusApp.toast('Copied to clipboard', 'success');
  }
}

/* ---------------- AUDIT LOG PREVIEW ---------------- */
const AUDIT_ENTRIES = [
  { icon:'ri-money-dollar-circle-line', text:'Alex Kimani approved payroll for Week of Jul 7 – 12', time:'2 hours ago' },
  { icon:'ri-smartphone-line', text:'Wei Zhang created batch BX-1092', time:'5 hours ago' },
  { icon:'ri-user-line', text:'HR Desk updated worker record for Grace Achieng', time:'Yesterday' },
  { icon:'ri-shield-check-line', text:'Kevin Otieno marked batch BX-1039 as Failed inspection', time:'Yesterday' },
  { icon:'ri-settings-4-line', text:'Alex Kimani updated notification preferences', time:'2 days ago' },
  { icon:'ri-lock-2-line', text:'System: new API key "Reporting integration" generated', time:'3 days ago' },
  { icon:'ri-team-line', text:'HR Desk added worker James Mwangi', time:'4 days ago' },
];
let auditSearch = '';
function renderAuditPreview(){
  const filtered = AUDIT_ENTRIES.filter(a => !auditSearch || a.text.toLowerCase().includes(auditSearch));
  document.getElementById('auditList').innerHTML = filtered.map(a => `
    <div class="activity-row">
      <div class="activity-icon" style="background:var(--grad-soft); color:var(--primary-3);"><i class="${a.icon}"></i></div>
      <div class="activity-text"><span>${a.text}</span><small>${a.time}</small></div>
    </div>`).join('') || `<span class="muted-note">No matching audit entries.</span>`;
}

/* ---------------- WIRES ---------------- */
function wireSettings(){
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => setSettingsTab(item.dataset.tab));
  });
  document.getElementById('auditSearch').addEventListener('input', e => { auditSearch = e.target.value.trim().toLowerCase(); renderAuditPreview(); });
}

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('settings.html', session);
  wireSettings();
  loadCompany();
  loadAppearance();
  loadNotifications();
  renderRoles();
  loadPermissions();
  load2FA();
  loadSessions();
  loadIntegrations();
  loadApiKeys();
  renderAuditPreview();
});
