/* ============================================================
   SAGERO CREATIONS — User Roles module
   User-to-role assignment directory. Complements Settings →
   Permissions, which defines what each role can do.
============================================================ */

const ROLE_OPTIONS = ['Super Admin','Production Manager','Chinese Manager','Supervisor','Worker','HR','Payroll Officer','Viewer'];
const ROLE_COLORS = {
  'Super Admin':'#EF4444', 'Production Manager':'#6D5DF6', 'Chinese Manager':'#3B82F6',
  'Supervisor':'#7C3AED', 'Worker':'#4F46E5', 'HR':'#5B5CF6', 'Payroll Officer':'#16A34A', 'Viewer':'#9CA3AF',
};

let USERS = [];

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

function seedUsers(){
  const saved = localStorage.getItem('nexus_user_roles');
  if(saved){ USERS = JSON.parse(saved); return; }

  const base = [
    { name:'Alex Kimani', role:'Super Admin', email:'alex.kimani@sagerocreations.com', status:'Active', lastActive:'Active now' },
    { name:'Wei Zhang', role:'Chinese Manager', email:'wei.zhang@sagerocreations.com', status:'Active', lastActive:'2 hours ago' },
    { name:'Li Chen', role:'Chinese Manager', email:'li.chen@sagerocreations.com', status:'Active', lastActive:'1 day ago' },
    { name:'Feng Yun', role:'Chinese Manager', email:'feng.yun@sagerocreations.com', status:'Active', lastActive:'3 hours ago' },
    { name:'Chao Liu', role:'Chinese Manager', email:'chao.liu@sagerocreations.com', status:'Active', lastActive:'5 hours ago' },
    { name:'Grace Achieng', role:'Supervisor', email:'grace.achieng@sagerocreations.com', status:'Active', lastActive:'30 min ago' },
    { name:'Kevin Otieno', role:'Worker', email:'kevin.otieno@sagerocreations.com', status:'Active', lastActive:'1 hour ago' },
    { name:'Mercy Njoki', role:'Worker', email:'mercy.njoki@sagerocreations.com', status:'Active', lastActive:'45 min ago' },
    { name:'HR Desk', role:'HR', email:'hr@sagerocreations.com', status:'Active', lastActive:'20 min ago' },
    { name:'Ruth Wanjiku', role:'Payroll Officer', email:'ruth.wanjiku@sagerocreations.com', status:'Active', lastActive:'2 days ago' },
    { name:'Brian Mwangi', role:'Viewer', email:'brian.mwangi@sagerocreations.com', status:'Active', lastActive:'4 days ago' },
    { name:'Faith Kerubo', role:'Viewer', email:'faith.kerubo@sagerocreations.com', status:'Invited', lastActive:'Never signed in' },
    { name:'Dennis Otieno', role:'Worker', email:'dennis.otieno@sagerocreations.com', status:'Invited', lastActive:'Never signed in' },
    { name:'Samuel Kiprono', role:'Worker', email:'samuel.kiprono@sagerocreations.com', status:'Suspended', lastActive:'12 days ago' },
  ];
  USERS = base.map((u,i) => ({ id:'U-'+(4001+i), ...u }));
  persistUsers();
}
function persistUsers(){ localStorage.setItem('nexus_user_roles', JSON.stringify(USERS)); }

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const active = USERS.filter(u=>u.status==='Active').length;
  const invited = USERS.filter(u=>u.status==='Invited').length;
  const rolesInUse = new Set(USERS.map(u=>u.role)).size;

  document.getElementById('kpiTotal').textContent = USERS.length;
  document.getElementById('kpiActive').textContent = active;
  document.getElementById('kpiInvited').textContent = invited;
  document.getElementById('kpiRoles').textContent = rolesInUse;
}

/* ---------------- TABLE ---------------- */
let filters = { search:'', role:'all', status:'all' };

function getFiltered(){
  return USERS.filter(u => {
    if(filters.search && !(u.name.toLowerCase().includes(filters.search) || u.email.toLowerCase().includes(filters.search))) return false;
    if(filters.role !== 'all' && u.role !== filters.role) return false;
    if(filters.status !== 'all' && u.status !== filters.status) return false;
    return true;
  });
}

const STATUS_BADGE = { 'Active':'success', 'Invited':'warning', 'Suspended':'danger' };

function renderTable(){
  const items = getFiltered();
  document.getElementById('userCount').textContent = items.length + ' user' + (items.length===1?'':'s');

  document.getElementById('usersTableBody').innerHTML = items.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar" style="width:34px;height:34px;font-size:11px;background:${ROLE_COLORS[u.role]};">${initials(u.name)}</div>
          <div><b>${u.name}</b><small>${u.email}</small></div>
        </div>
      </td>
      <td>
        <select class="role-select" onchange="changeRole('${u.id}', this.value)">
          ${ROLE_OPTIONS.map(r => `<option ${r===u.role?'selected':''}>${r}</option>`).join('')}
        </select>
      </td>
      <td><span class="badge badge-${STATUS_BADGE[u.status]}"><span class="badge-dot"></span>${u.status}</span></td>
      <td>${u.lastActive}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${u.status==='Suspended'
            ? `<button class="btn btn-secondary btn-sm" onclick="reactivateUser('${u.id}')"><i class="ri-play-circle-line"></i>Reactivate</button>`
            : u.status==='Active'
              ? `<button class="btn btn-secondary btn-sm" onclick="suspendUser('${u.id}')"><i class="ri-pause-circle-line"></i>Suspend</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="resendInvite('${u.id}')"><i class="ri-mail-send-line"></i>Resend</button>`}
          <button class="icon-btn" style="width:32px;height:32px;" data-tip="Remove user" onclick="removeUser('${u.id}')"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:26px;">No users match your filters</td></tr>`;
}

function changeRole(id, role){
  const u = USERS.find(x=>x.id===id);
  if(!u) return;
  u.role = role;
  persistUsers();
  renderKPIs();
  renderTable();
  NexusApp.toast(`${u.name}\u2019s role changed to ${role}`, 'success');
}
function suspendUser(id){
  const u = USERS.find(x=>x.id===id);
  if(!u) return;
  u.status = 'Suspended';
  persistUsers();
  renderKPIs();
  renderTable();
  NexusApp.toast(`${u.name} suspended`, 'error');
}
function reactivateUser(id){
  const u = USERS.find(x=>x.id===id);
  if(!u) return;
  u.status = 'Active';
  u.lastActive = 'Active now';
  persistUsers();
  renderKPIs();
  renderTable();
  NexusApp.toast(`${u.name} reactivated`, 'success');
}
function resendInvite(id){
  const u = USERS.find(x=>x.id===id);
  if(!u) return;
  NexusApp.toast(`Invite resent to ${u.email}`, 'info');
}
function removeUser(id){
  const u = USERS.find(x=>x.id===id);
  if(!u) return;
  USERS = USERS.filter(x=>x.id!==id);
  persistUsers();
  renderKPIs();
  renderTable();
  NexusApp.toast(`${u.name} removed from workspace`, 'info');
}

/* ---------------- INVITE MODAL ---------------- */
function openInviteModal(){ NexusApp.openModal('modal-invite'); }
function submitInvite(e){
  e.preventDefault();
  const name = document.getElementById('inv-name').value.trim();
  const email = document.getElementById('inv-email').value.trim();
  const role = document.getElementById('inv-role').value;
  if(!name || !email){ NexusApp.toast('Enter a name and email', 'error'); return; }

  USERS.unshift({ id:'U-'+(4001+USERS.length+Math.floor(Math.random()*90)), name, email, role, status:'Invited', lastActive:'Never signed in' });
  persistUsers();
  NexusApp.closeModal('modal-invite');
  renderKPIs();
  renderTable();
  e.target.reset();
  NexusApp.toast('Invite sent to ' + email, 'success');
}

/* ---------------- WIRES ---------------- */
function populateFilters(){
  document.getElementById('filterRole').innerHTML = '<option value="all">All roles</option>' + ROLE_OPTIONS.map(r=>`<option>${r}</option>`).join('');
}
function wireToolbar(){
  document.getElementById('userSearch').addEventListener('input', e => { filters.search = e.target.value.trim().toLowerCase(); renderTable(); });
  document.getElementById('filterRole').addEventListener('change', e => { filters.role = e.target.value; renderTable(); });
  document.getElementById('filterStatus').addEventListener('change', e => { filters.status = e.target.value; renderTable(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('roles.html', session);
  seedUsers();
  populateFilters();
  wireToolbar();
  renderKPIs();
  renderTable();
});
