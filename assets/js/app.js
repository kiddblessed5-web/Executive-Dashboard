/* ============================================================
   NEXUS OPERATIONS OS — Shared App Shell
   Handles: auth guard, sidebar, topbar, theme, toasts,
   modals, dropdowns, command palette, ripple buttons
============================================================ */

const NexusApp = (() => {

  /* ---------------- AUTH GUARD ---------------- */
  function requireAuth(){
    const session = localStorage.getItem('nexus_session');
    if(!session){
      window.location.href = 'login.html';
      return null;
    }
    return JSON.parse(session);
  }

  function logout(){
    localStorage.removeItem('nexus_session');
    window.location.href = 'login.html';
  }

  /* ---------------- ACCENT COLOR ---------------- */
  const ACCENT_PRESETS = {
    purple:  { primary:'#6D5DF6', primary2:'#5B5CF6', primary3:'#4F46E5', accent:'#7C3AED', blue:'#3B82F6' },
    emerald: { primary:'#10B981', primary2:'#0D9F6E', primary3:'#047857', accent:'#14B8A6', blue:'#0EA5E9' },
    rose:    { primary:'#F43F5E', primary2:'#E11D48', primary3:'#BE123C', accent:'#FB7185', blue:'#F97316' },
    indigo:  { primary:'#6366F1', primary2:'#4F46E5', primary3:'#4338CA', accent:'#818CF8', blue:'#3B82F6' },
  };
  function hexToRgba(hex, a){
    const v = hex.replace('#','');
    const r = parseInt(v.substring(0,2),16), g = parseInt(v.substring(2,4),16), b = parseInt(v.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function applyAccent(){
    const key = localStorage.getItem('nexus_accent') || 'purple';
    const p = ACCENT_PRESETS[key] || ACCENT_PRESETS.purple;
    const grad = `linear-gradient(135deg, ${p.primary} 0%, ${p.primary3} 100%)`;
    const gradSoft = `linear-gradient(135deg, ${hexToRgba(p.primary,0.12)} 0%, ${hexToRgba(p.primary3,0.06)} 100%)`;
    [document.documentElement, document.body].forEach(el => {
      if(!el) return;
      el.style.setProperty('--primary', p.primary);
      el.style.setProperty('--primary-2', p.primary2);
      el.style.setProperty('--primary-3', p.primary3);
      el.style.setProperty('--accent', p.accent);
      el.style.setProperty('--blue', p.blue);
      el.style.setProperty('--grad', grad);
      el.style.setProperty('--grad-soft', gradSoft);
    });
  }
  function setAccent(key){
    localStorage.setItem('nexus_accent', key);
    applyAccent();
  }

  /* ---------------- THEME ---------------- */
  function initTheme(){
    const saved = localStorage.getItem('nexus_theme') || 'light';
    if(saved === 'dark') document.body.classList.add('dark');
    updateThemeIcon();
    applyAccent();
  }
  function toggleTheme(){
    document.body.classList.toggle('dark');
    localStorage.setItem('nexus_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    updateThemeIcon();
  }
  function updateThemeIcon(){
    const btn = document.getElementById('themeToggleIcon');
    if(!btn) return;
    btn.className = document.body.classList.contains('dark') ? 'ri-sun-line' : 'ri-moon-line';
  }

  /* ---------------- TOASTS ---------------- */
  function toast(message, type = 'info', icon){
    let stack = document.querySelector('.toast-stack');
    if(!stack){
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const icons = { success:'ri-checkbox-circle-fill', error:'ri-error-warning-fill', info:'ri-information-fill', warning:'ri-alert-fill' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="${icon || icons[type] || icons.info}"></i><span>${message}</span><button class="toast-close"><i class="ri-close-line"></i></button>`;
    el.querySelector('.toast-close').onclick = () => el.remove();
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(24px)'; setTimeout(()=>el.remove(), 250); }, 3800);
  }

  /* ---------------- DROPDOWNS ---------------- */
  function toggleDropdown(id){
    const panel = document.getElementById(id);
    if(!panel) return;
    const isOpen = panel.classList.contains('open');
    document.querySelectorAll('.dropdown-panel').forEach(p=>p.classList.remove('open'));
    if(!isOpen) panel.classList.add('open');
  }
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.dropdown-wrap')){
      document.querySelectorAll('.dropdown-panel').forEach(p=>p.classList.remove('open'));
    }
  });

  /* ---------------- MODALS ---------------- */
  function openModal(id){
    document.getElementById('overlay-' + id)?.classList.add('open');
    document.getElementById(id)?.classList.add('open');
  }
  function closeModal(id){
    document.getElementById('overlay-' + id)?.classList.remove('open');
    document.getElementById(id)?.classList.remove('open');
  }

  /* ---------------- DRAWERS ---------------- */
  function openDrawer(id){
    document.getElementById('drawer-overlay')?.classList.add('open');
    document.getElementById(id)?.classList.add('open');
  }
  function closeDrawer(id){
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.getElementById(id)?.classList.remove('open');
  }

  /* ---------------- RIPPLE BUTTONS ---------------- */
  function initRipple(){
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if(!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
      btn.appendChild(ripple);
      setTimeout(()=>ripple.remove(), 600);
    });
  }

  /* ---------------- SIDEBAR NAV DATA ---------------- */
  const NAV = [
    { group:'', items:[
      { label:'Dashboard', icon:'ri-dashboard-3-line', page:'index.html' },
    ]},
    { group:'Production', items:[
      { label:'Phone Batches', icon:'ri-smartphone-line', page:'batches.html' },
      { label:'Workflow', icon:'ri-flow-chart', page:'workflow.html' },
    ]},
    { group:'People', items:[
      { label:'Workers', icon:'ri-team-line', page:'workers.html' },
      { label:'Attendance', icon:'ri-calendar-check-line', page:'attendance.html' },
      { label:'Payroll', icon:'ri-money-dollar-circle-line', page:'payroll.html' },
    ]},
    { group:'Communication', items:[
      { label:'Messages', icon:'ri-chat-3-line', page:'messages.html', badge:3 },
    ]},
    { group:'Analytics', items:[
      { label:'Reports', icon:'ri-bar-chart-2-line', page:'reports.html' },
    ]},
    { group:'Inventory', items:[
      { label:'Devices', icon:'ri-cellphone-line', page:'devices.html' },
      { label:'Warehouse', icon:'ri-building-4-line', page:'warehouse.html' },
    ]},
    { group:'', items:[
      { label:'Quality Control', icon:'ri-shield-check-line', page:'quality.html' },
      { label:'Settings', icon:'ri-settings-4-line', page:'settings.html' },
      { label:'Audit Logs', icon:'ri-file-list-3-line', page:'audit.html' },
      { label:'User Roles', icon:'ri-lock-2-line', page:'roles.html' },
      { label:'Help Center', icon:'ri-question-line', page:'help.html' },
    ]},
  ];

  function renderSidebar(activePage){
    const scroll = document.getElementById('sidebarNav');
    if(!scroll) return;
    let html = '';
    NAV.forEach(section => {
      html += `<div class="nav-group">`;
      if(section.group) html += `<div class="nav-group-label">${section.group}</div>`;
      section.items.forEach(item => {
        const active = item.page === activePage;
        html += `<a class="nav-item ${active?'active':''}" href="${item.page}" data-tip="${item.label}">
          <i class="${item.icon}"></i><span class="nav-label-text">${item.label}</span>
          ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
        </a>`;
      });
      html += `</div>`;
    });
    scroll.innerHTML = html;
  }

  /* ---------------- COMMAND PALETTE ---------------- */
  const CMDK_ITEMS = [
    { group:'Navigate', icon:'ri-dashboard-3-line', label:'Go to Dashboard', action:()=>location.href='index.html' },
    { group:'Navigate', icon:'ri-smartphone-line', label:'Go to Phone Batches', action:()=>location.href='batches.html' },
    { group:'Navigate', icon:'ri-team-line', label:'Go to Workers', action:()=>location.href='workers.html' },
    { group:'Navigate', icon:'ri-calendar-check-line', label:'Go to Attendance', action:()=>location.href='attendance.html' },
    { group:'Navigate', icon:'ri-money-dollar-circle-line', label:'Go to Payroll', action:()=>location.href='payroll.html' },
    { group:'Navigate', icon:'ri-chat-3-line', label:'Go to Messages', action:()=>location.href='messages.html' },
    { group:'Navigate', icon:'ri-bar-chart-2-line', label:'Go to Reports', action:()=>location.href='reports.html' },
    { group:'Actions', icon:'ri-add-line', label:'Create new batch', action:()=>{ toast('Opening new batch form…','info'); if(typeof openNewBatchModal==='function') openNewBatchModal(); } },
    { group:'Actions', icon:'ri-moon-line', label:'Toggle dark mode', action:()=>toggleTheme() },
    { group:'Actions', icon:'ri-logout-box-line', label:'Log out', action:()=>logout() },
  ];

  function initCommandPalette(){
    if(document.getElementById('cmdk')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="overlay" id="cmdk-overlay" onclick="NexusApp.closeCmdk()"></div>
      <div class="cmdk" id="cmdk">
        <div class="cmdk-input"><i class="ri-search-line"></i><input id="cmdkInput" placeholder="Type a command or search…" autocomplete="off"></div>
        <div class="cmdk-list" id="cmdkList"></div>
      </div>`;
    document.body.appendChild(wrap);
    const input = document.getElementById('cmdkInput');
    input.addEventListener('input', renderCmdkList);
    document.addEventListener('keydown', (e) => {
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){
        e.preventDefault();
        openCmdk();
      }
      if(e.key === 'Escape') closeCmdk();
    });
  }
  function renderCmdkList(){
    const q = document.getElementById('cmdkInput').value.trim().toLowerCase();
    const filtered = CMDK_ITEMS.filter(i => i.label.toLowerCase().includes(q));
    const groups = [...new Set(filtered.map(i=>i.group))];
    let html = '';
    groups.forEach(g => {
      html += `<div class="cmdk-group">${g}</div>`;
      filtered.filter(i=>i.group===g).forEach((i, idx) => {
        html += `<div class="cmdk-item" data-idx="${CMDK_ITEMS.indexOf(i)}"><i class="${i.icon}"></i>${i.label}</div>`;
      });
    });
    document.getElementById('cmdkList').innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px;">No results</div>';
    document.querySelectorAll('.cmdk-item').forEach(el => {
      el.onclick = () => { CMDK_ITEMS[el.dataset.idx].action(); closeCmdk(); };
    });
  }
  function openCmdk(){
    initCommandPalette();
    document.getElementById('cmdk-overlay').classList.add('open');
    document.getElementById('cmdk').classList.add('open');
    renderCmdkList();
    setTimeout(()=>document.getElementById('cmdkInput').focus(), 50);
  }
  function closeCmdk(){
    document.getElementById('cmdk-overlay')?.classList.remove('open');
    document.getElementById('cmdk')?.classList.remove('open');
  }

  /* ---------------- TOOLTIPS (fixed-position, escapes scroll-clipped ancestors) ---------------- */
  let tipEl = null, tipTarget = null;
  function ensureTipEl(){
    if(!tipEl){
      tipEl = document.createElement('div');
      tipEl.className = 'global-tooltip';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTooltip(target){
    // Inside the sidebar, only show tooltips once it's collapsed to icons-only —
    // when expanded the label is already visible, so a tooltip would be redundant.
    if(target.closest('.nav-item') && !document.querySelector('.sidebar.collapsed')) return;
    const text = target.getAttribute('data-tip');
    if(!text) return;
    tipTarget = target;
    const tip = ensureTipEl();
    tip.textContent = text;
    const rect = target.getBoundingClientRect();
    tip.style.left = (rect.left + rect.width / 2) + 'px';
    if(rect.top < 44){
      tip.style.top = (rect.bottom + 8) + 'px';
      tip.style.transform = 'translate(-50%, 0)';
    } else {
      tip.style.top = (rect.top - 8) + 'px';
      tip.style.transform = 'translate(-50%, -100%)';
    }
    tip.classList.add('visible');
  }
  function hideTooltip(){
    tipTarget = null;
    tipEl?.classList.remove('visible');
  }
  function initTooltips(){
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest?.('[data-tip]');
      if(!target || target === tipTarget) return;
      showTooltip(target);
    });
    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest?.('[data-tip]');
      if(!target) return;
      if(e.relatedTarget && target.contains(e.relatedTarget)) return;
      hideTooltip();
    });
    document.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('click', hideTooltip);
  }

  /* ---------------- MOBILE SIDEBAR ---------------- */
  function ensureSidebarBackdrop(){
    let bd = document.querySelector('.sidebar-backdrop');
    if(!bd){
      bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', () => closeSidebar());
      document.body.appendChild(bd);
    }
    return bd;
  }
  function ensureSidebarMobileClose(){
    const sidebar = document.querySelector('.sidebar');
    if(!sidebar || sidebar.querySelector('.sidebar-mobile-close')) return;
    const btn = document.createElement('button');
    btn.className = 'sidebar-mobile-close';
    btn.setAttribute('aria-label', 'Close menu');
    btn.innerHTML = '<i class="ri-close-line"></i>';
    btn.addEventListener('click', () => closeSidebar());
    sidebar.appendChild(btn);
  }
  function toggleSidebar(){
    const sidebar = document.querySelector('.sidebar');
    if(!sidebar) return;
    const willOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', willOpen);
    ensureSidebarBackdrop().classList.toggle('open', willOpen);
  }
  function closeSidebar(){
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-backdrop')?.classList.remove('open');
  }

  /* ---------------- SIDEBAR COLLAPSE (icon rail) ---------------- */
  function applySidebarCollapsed(){
    const collapsed = localStorage.getItem('nexus_sidebar_collapsed') === '1';
    document.querySelector('.sidebar')?.classList.toggle('collapsed', collapsed);
    const btn = document.querySelector('.sidebar-collapse-btn');
    if(btn) btn.setAttribute('data-tip', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }
  function toggleSidebarCollapse(){
    const sidebar = document.querySelector('.sidebar');
    if(!sidebar) return;
    const collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    localStorage.setItem('nexus_sidebar_collapsed', collapsed ? '1' : '0');
    const btn = document.querySelector('.sidebar-collapse-btn');
    if(btn) btn.setAttribute('data-tip', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  /* ---------------- COUNT UP ---------------- */
  function countUp(el, target, duration=900, prefix='', suffix=''){
    const start = 0;
    const startTime = performance.now();
    function tick(now){
      const p = Math.min(1, (now-startTime)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const val = Math.round(start + (target-start)*eased);
      el.textContent = prefix + val.toLocaleString() + suffix;
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- DENSITY ---------------- */
  function applyDensity(){
    const density = localStorage.getItem('nexus_density') || 'comfortable';
    document.body.classList.toggle('density-compact', density === 'compact');
  }

  /* ---------------- INIT ---------------- */
  function initShell(activePage, session){
    initTheme();
    applyDensity();
    renderSidebar(activePage);
    applySidebarCollapsed();
    ensureSidebarMobileClose();
    initRipple();
    initCommandPalette();
    initTooltips();
    if(session){
      const nameEl = document.getElementById('userChipName');
      const roleEl = document.getElementById('userChipRole');
      const initialsEl = document.getElementById('userChipAvatar');
      if(nameEl) nameEl.textContent = session.name;
      if(roleEl) roleEl.textContent = session.role;
      if(initialsEl) initialsEl.textContent = session.initials;
    }
  }

  return {
    requireAuth, logout, toggleTheme, toast, toggleDropdown,
    openModal, closeModal, openDrawer, closeDrawer,
    toggleSidebar, closeSidebar, toggleSidebarCollapse, openCmdk, closeCmdk, countUp, initShell, renderSidebar,
    setAccent, applyAccent, ACCENT_PRESETS
  };
})();
