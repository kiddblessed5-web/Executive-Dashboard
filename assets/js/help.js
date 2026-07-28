/* ============================================================
   SAGERO CREATIONS — Help Center module
============================================================ */

const FAQ_DATA = [
  { category:'Getting Started', q:'How do I switch between light and dark mode?', a:'Click the moon/sun icon in the top-right of any page, or go to Settings → Appearance for the same toggle plus layout density options.' },
  { category:'Getting Started', q:'How do I collapse the sidebar?', a:'Click the small chevron next to the Sagero logo at the top of the sidebar. It folds into an icon-only rail and remembers your preference across every page.' },
  { category:'Getting Started', q:'What is the Command Palette?', a:'Press ⌘K (or Ctrl+K on Windows) anywhere in the app to jump to any page or trigger quick actions like creating a batch or toggling dark mode, without touching your mouse.' },

  { category:'Production', q:'How do I create a new phone batch?', a:'Go to Phone Batches and click "New Batch" in the top right, or the same action is available from the Dashboard\u2019s Quick Actions and the Command Palette.' },
  { category:'Production', q:'What\u2019s the difference between Grid, List and Kanban view?', a:'Grid and List show the same batch data in card or table form. Kanban lays batches out by production stage and lets you drag a batch card to a new stage to update it instantly.' },
  { category:'Production', q:'How do I move a batch through production stages?', a:'On the Workflow page, drag a batch card from one stage column to the next. Its timer resets and the pipeline counts update immediately.' },
  { category:'Production', q:'How do I allocate workers to a stage?', a:'On the Workflow page, drag a worker chip from the pool at the bottom (or from another stage) into a stage\u2019s worker zone.' },

  { category:'People', q:'How do I add a new worker?', a:'Go to Workers and click "Add Worker". You can assign their role right away and fill in the rest of their profile afterward.' },
  { category:'People', q:'How is a worker marked "Late" for attendance?', a:'Any check-in after 08:30 is automatically marked Late. You can still manually mark someone Present, Late or Absent from the Attendance page if needed.' },
  { category:'People', q:'Can I undo an attendance mark?', a:'Yes — every row in the Daily Attendance table has a reset icon that clears that day\u2019s mark for that worker so you can re-enter it.' },

  { category:'Payroll', q:'How is pay calculated?', a:'Base pay is KES 600 per day worked (auto-pulled from Attendance), plus any overtime at KES 100/hour and performance bonuses, minus a KES 100 deduction per late day.' },
  { category:'Payroll', q:'How do I download a payslip?', a:'Open any worker\u2019s row on the Payroll page and click "Payslip", then "Download PDF" — this opens your browser\u2019s print dialog with "Save as PDF" as the destination.' },
  { category:'Payroll', q:'What\u2019s the difference between Weekly and Monthly payroll?', a:'Toggle it at the top of the Payroll page. Both recalculate from the same underlying attendance data, just grouped into different pay periods.' },

  { category:'Messages', q:'How do I start a new conversation?', a:'Click the pencil icon next to "Messages" in the conversation list. You can search the full company directory, not just people you\u2019ve already messaged.' },
  { category:'Messages', q:'Can I pin messages or whole conversations?', a:'Yes, both. Hover any message and click the pin icon to pin it inside that chat. To pin an entire conversation to the top of your list, that\u2019s managed from the conversation list itself.' },
  { category:'Messages', q:'How do polls work?', a:'Any message can include a poll. Click an option to vote — percentages update live, and clicking your own vote again removes it.' },

  { category:'Quality Control', q:'What happens when I fail an inspection?', a:'You\u2019ll be asked to log at least one defect type before it can be marked Failed. It\u2019s then automatically flagged with a severity rating and sent to the Approvals tab for a supervisor decision.' },
  { category:'Quality Control', q:'What\u2019s the difference between "Reject & scrap" and "Approve rework"?', a:'Approve rework sends the batch back into production to be fixed. Reject & scrap closes it out as a loss. Both are logged permanently against that inspection.' },

  { category:'Inventory', q:'How do I scan a phone barcode?', a:'On the Devices page, click into the scan input and use a USB/Bluetooth barcode scanner (it types like a keyboard) or type the barcode manually and press Enter. A camera-based option is also available in Chrome-based browsers.' },
  { category:'Inventory', q:'Can I export scanned devices to Excel?', a:'Yes — every saved scan list has a "CSV" and an "Excel" export button, and there\u2019s an "Export all" option in the top bar that combines every list into one workbook.' },

  { category:'Settings & Security', q:'How do I change notification preferences?', a:'Go to Settings → Notifications. Every toggle there is saved instantly.' },
  { category:'Settings & Security', q:'How do I generate an API key?', a:'Go to Settings → API Keys → Generate key. You\u2019ll see the full key once in a copy-to-clipboard dialog — it\u2019s masked everywhere after that, so store it somewhere safe.' },
  { category:'Settings & Security', q:'Who can see what? How do permissions work?', a:'Settings → Permissions has a full role-by-permission matrix. You can also jump straight there from any role card under Settings → Roles.' },
];

const TOPICS = [
  { id:'Getting Started', icon:'ri-rocket-2-line', desc:'Basics of navigating Sagero' },
  { id:'Production', icon:'ri-smartphone-line', desc:'Batches, workflow & stages' },
  { id:'People', icon:'ri-team-line', desc:'Workers & attendance' },
  { id:'Payroll', icon:'ri-money-dollar-circle-line', desc:'Pay, payslips & runs' },
  { id:'Messages', icon:'ri-chat-3-line', desc:'Chat, polls & mentions' },
  { id:'Quality Control', icon:'ri-shield-check-line', desc:'Inspections & approvals' },
  { id:'Inventory', icon:'ri-cellphone-line', desc:'Scanning & exports' },
  { id:'Settings & Security', icon:'ri-shield-keyhole-line', desc:'Roles, keys & preferences' },
];

const SHORTCUTS = [
  { keys:['⌘','K'], desc:'Open the command palette' },
  { keys:['Enter'], desc:'Send a message (in Messages)' },
  { keys:['Shift','Enter'], desc:'New line in a message' },
  { keys:['Esc'], desc:'Close the open modal or command palette' },
];

const WHATS_NEW = [
  { date:'This week', title:'Collapsible sidebar', desc:'Fold the sidebar into an icon-only rail from any page — your choice is remembered everywhere.' },
  { date:'This week', title:'Excel export for Devices & Reports', desc:'Scan sessions and every report can now export as genuine .xlsx workbooks, not just CSV.' },
  { date:'Last week', title:'Quality Control approvals', desc:'Failed inspections now route through a proper Approve rework / Reject & scrap decision.' },
  { date:'Last week', title:'Messages: polls & group info', desc:'Added in-chat polls and a Group Info panel with media, files and notification controls.' },
];

let activeCategory = 'all';
let searchQuery = '';

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

/* ---------------- TOPIC CARDS ---------------- */
function renderTopics(){
  document.getElementById('topicsGrid').innerHTML = TOPICS.map(t => `
    <div class="topic-card ${activeCategory===t.id?'active':''}" onclick="filterByCategory('${t.id}')">
      <div class="topic-icon"><i class="${t.icon}"></i></div>
      <b>${t.id}</b>
      <span>${t.desc}</span>
    </div>`).join('');
}
function filterByCategory(cat){
  activeCategory = activeCategory === cat ? 'all' : cat;
  renderTopics();
  renderFaq();
  const faqCard = document.getElementById('faqCard');
  if(faqCard && typeof faqCard.scrollIntoView === 'function'){
    faqCard.scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

/* ---------------- FAQ ---------------- */
function renderFaq(){
  const filtered = FAQ_DATA.filter(f => {
    if(activeCategory !== 'all' && f.category !== activeCategory) return false;
    if(searchQuery && !(f.q.toLowerCase().includes(searchQuery) || f.a.toLowerCase().includes(searchQuery))) return false;
    return true;
  });

  document.getElementById('faqCount').textContent = filtered.length + ' article' + (filtered.length===1?'':'s') + (activeCategory!=='all' ? ' in ' + activeCategory : '');
  document.getElementById('clearFilterBtn').style.display = activeCategory !== 'all' ? 'inline-flex' : 'none';

  document.getElementById('faqList').innerHTML = filtered.map((f,i) => `
    <div class="faq-item" id="faq-${i}">
      <div class="faq-q" onclick="toggleFaq(${i})">
        <div><span class="faq-cat-tag">${f.category}</span><div>${f.q}</div></div>
        <i class="ri-arrow-down-s-line"></i>
      </div>
      <div class="faq-a">${f.a}</div>
    </div>`).join('') || `<div class="empty-state"><i class="ri-search-line"></i><b>No matching articles</b><span>Try a different search term or clear the topic filter.</span></div>`;
}
function toggleFaq(i){
  document.getElementById('faq-'+i).classList.toggle('open');
}
function clearFilter(){
  activeCategory = 'all';
  renderTopics();
  renderFaq();
}

/* ---------------- SHORTCUTS ---------------- */
function renderShortcuts(){
  document.getElementById('shortcutsList').innerHTML = SHORTCUTS.map(s => `
    <div class="shortcut-row">
      <div class="shortcut-keys">${s.keys.map(k=>`<kbd>${k}</kbd>`).join('<span class="plus">+</span>')}</div>
      <span>${s.desc}</span>
    </div>`).join('');
}

/* ---------------- WHAT'S NEW ---------------- */
function renderWhatsNew(){
  document.getElementById('whatsNewList').innerHTML = WHATS_NEW.map(w => `
    <div class="whats-new-row">
      <div class="whats-new-dot"></div>
      <div><small>${w.date}</small><b>${w.title}</b><p>${w.desc}</p></div>
    </div>`).join('');
}

/* ---------------- SUPPORT TICKETS ---------------- */
let TICKETS = [];
function loadTickets(){
  const saved = localStorage.getItem('nexus_support_tickets');
  TICKETS = saved ? JSON.parse(saved) : [
    { id:'T-1001', subject:'Payslip PDF not opening print dialog', category:'Payroll', status:'Resolved', createdAt: new Date(Date.now()-4*86400000).toISOString() },
  ];
  renderTickets();
}
function persistTickets(){ localStorage.setItem('nexus_support_tickets', JSON.stringify(TICKETS)); }
function renderTickets(){
  const STATUS_BADGE = { 'Open':'warning', 'In Progress':'info', 'Resolved':'success' };
  document.getElementById('ticketsList').innerHTML = TICKETS.map(t => `
    <div class="ticket-row">
      <div class="ticket-meta">
        <b>${t.subject}</b>
        <small>${t.category} · ${t.id} · Opened ${new Date(t.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</small>
      </div>
      <span class="badge badge-${STATUS_BADGE[t.status]}"><span class="badge-dot"></span>${t.status}</span>
      ${t.status !== 'Resolved' ? `<button class="btn btn-secondary btn-sm" onclick="resolveTicket('${t.id}')"><i class="ri-check-line"></i>Mark resolved</button>` : ''}
    </div>`).join('') || `<span class="muted-note">No support tickets yet.</span>`;
}
function resolveTicket(id){
  const t = TICKETS.find(x=>x.id===id);
  if(!t) return;
  t.status = 'Resolved';
  persistTickets();
  renderTickets();
  NexusApp.toast('Ticket marked resolved', 'success');
}
function submitTicket(e){
  e.preventDefault();
  const subject = document.getElementById('tk-subject').value.trim();
  const category = document.getElementById('tk-category').value;
  const message = document.getElementById('tk-message').value.trim();
  if(!subject || !message){ NexusApp.toast('Please fill in a subject and message', 'error'); return; }

  const ticket = { id:'T-'+(1002+TICKETS.length), subject, category, status:'Open', createdAt:new Date().toISOString() };
  TICKETS.unshift(ticket);
  persistTickets();
  renderTickets();
  e.target.reset();
  NexusApp.toast('Support ticket ' + ticket.id + ' submitted — we\u2019ll reply within 24 hours', 'success');
}

/* ---------------- WIRES ---------------- */
function wireSearch(){
  document.getElementById('helpSearch').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderFaq();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('help.html', session);
  wireSearch();
  renderTopics();
  renderFaq();
  renderShortcuts();
  renderWhatsNew();
  loadTickets();
});
