/* ============================================================
   SAGERO CREATIONS — Dashboard page logic
============================================================ */

const DASH_DATA = {
  kpis: [
    { label:"Today's Production", value:1840, suffix:' units', icon:'ri-smartphone-line', delta:'+8.4%', up:true, color:'primary' },
    { label:'Active Batches', value:23, suffix:'', icon:'ri-stack-line', delta:'+3', up:true, color:'info' },
    { label:'Completed', value:186, suffix:'', icon:'ri-checkbox-circle-line', delta:'+12.1%', up:true, color:'success' },
    { label:'Delayed', value:4, suffix:'', icon:'ri-time-line', delta:'-2', up:false, color:'warning' },
    { label:'Efficiency', value:94, suffix:'%', icon:'ri-flashlight-line', delta:'+1.6%', up:true, color:'primary' },
    { label:'Worker Attendance', value:96, suffix:'%', icon:'ri-team-line', delta:'+0.8%', up:true, color:'info' },
  ],
  activity: [
    { icon:'ri-checkbox-circle-fill', color:'success', text:'Batch <b>#BX-1042</b> completed quality check', time:'6 min ago' },
    { icon:'ri-user-add-line', color:'info', text:'<b>Kevin Otieno</b> checked in for the morning shift', time:'22 min ago' },
    { icon:'ri-alert-line', color:'warning', text:'Batch <b>#BX-1039</b> flagged as delayed by Chinese Manager Wei', time:'41 min ago' },
    { icon:'ri-truck-line', color:'primary', text:'Salesman <b>Brian Mwangi</b> delivered a new batch of 300 units', time:'1 hr ago' },
    { icon:'ri-money-dollar-circle-line', color:'success', text:'Weekly payroll processed for 38 workers', time:'2 hr ago' },
    { icon:'ri-chat-3-line', color:'info', text:'New message from <b>Manager Li Wei</b> in #production-floor', time:'3 hr ago' },
  ],
  deadlines: [
    { title:'Batch #BX-1042 — Final packaging', due:'Today, 5:00 PM', tag:'urgent' },
    { title:'Weekly payroll approval', due:'Tomorrow, 9:00 AM', tag:'normal' },
    { title:'Batch #BX-1051 — Software install', due:'Wed, 2:00 PM', tag:'normal' },
    { title:'Quality audit — Warehouse B', due:'Fri, 11:00 AM', tag:'normal' },
  ],
  topWorkers: [
    { name:'Grace Achieng', role:'Software Install', output:98, color:'#6D5DF6' },
    { name:'Kevin Otieno', role:'Quality Check', output:95, color:'#3B82F6' },
    { name:'Mercy Njoki', role:'Packaging', output:91, color:'#7C3AED' },
    { name:'Samuel Kiprono', role:'Unboxing', output:88, color:'#4F46E5' },
  ]
};

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

/* ============================================================
   BACKEND MODE — derives real Dashboard numbers from the same
   `batches` and `attendance` tables Batches/Workflow/Attendance
   already read and write (see backend_schema_phase2.sql).
   Revenue and Top Workers/Worker Performance still show
   illustrative figures — those need a pricing table and the
   Workers module on the backend, which aren't part of this phase.
============================================================ */
let backendTrendData = null, backendOutputData = null;

async function loadDashboardFromBackend(){
  const sb = SagoBackend.getClient();
  const { data: batches, error: bErr } = await sb.from('batches').select('*');
  if(bErr){ NexusApp.toast('Could not load dashboard data: ' + bErr.message, 'error'); return; }

  const { data: workers } = await sb.from('workers').select('*').eq('status','Active');
  const today = new Date().toISOString().slice(0,10);
  const { data: attToday } = await sb.from('attendance').select('*').eq('work_date', today);

  const active = batches.filter(b => b.status !== 'Completed').length;
  const completed = batches.filter(b => b.status === 'Completed').length;
  const delayed = batches.filter(b => b.status === 'Delayed').length;
  const efficiency = batches.length ? Math.round((batches.length - delayed) / batches.length * 100) : 100;
  const totalQty = batches.reduce((s,b)=>s+b.qty, 0);
  const rosterSize = (workers || []).length;
  const presentToday = (attToday || []).filter(r => r.status==='present' || r.status==='late').length;
  const attendanceRate = rosterSize ? Math.min(100, Math.round(presentToday / rosterSize * 100)) : 0;

  DASH_DATA.kpis[0].value = totalQty; // Today's Production — proxied from total tracked quantity, no daily production log yet
  DASH_DATA.kpis[1].value = active;
  DASH_DATA.kpis[2].value = completed;
  DASH_DATA.kpis[3].value = delayed;
  DASH_DATA.kpis[4].value = efficiency;
  DASH_DATA.kpis[5].value = attendanceRate; // Worker Attendance

  const recentBatches = [...batches].sort((a,b)=> new Date(b.updated_at)-new Date(a.updated_at)).slice(0,6);
  DASH_DATA.activity = recentBatches.map(b => {
    const last = (b.activity_log && b.activity_log[0]) || { text:'Updated', time:'recently' };
    return { icon:'ri-smartphone-line', color:'primary', text:`Batch <b>#${b.id}</b> — ${last.text}`, time: last.time };
  });

  // Top Workers — ranked by real 30-day attendance rate (the only real
  // per-worker metric available so far; there's no daily-output log yet,
  // so we don't fabricate one).
  const { data: attHistory } = await sb.from('attendance').select('*');
  const days30 = Array.from({length:30}, (_,i) => { const d = new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10); });
  DASH_DATA.topWorkers = (workers || [])
    .map(w => {
      const myAtt = (attHistory || []).filter(a => a.worker_id === w.id && days30.includes(a.work_date));
      const worked = myAtt.filter(a => a.status==='present' || a.status==='late').length;
      return { name: w.name, role: w.role, output: Math.round(worked/30*100), color: w.avatar_color || '#6D5DF6' };
    })
    .sort((a,b) => b.output - a.output)
    .slice(0, 4);

  const upcoming = batches.filter(b => b.finish_date && b.status !== 'Completed')
    .sort((a,b)=> new Date(a.finish_date)-new Date(b.finish_date)).slice(0,4);
  DASH_DATA.deadlines = upcoming.map(b => {
    const daysLeft = Math.ceil((new Date(b.finish_date) - new Date()) / 86400000);
    return { title:`Batch #${b.id} — ${b.model}`, due: daysLeft<=0 ? 'Overdue' : daysLeft===1 ? 'Due tomorrow' : `Due in ${daysLeft} days`, tag: daysLeft<=1 ? 'urgent' : 'normal' };
  });

  const days = [];
  for(let i=5;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); days.push(d); }
  backendTrendData = {
    labels: days.map(d=>d.toLocaleDateString('en-GB',{weekday:'short'})),
    values: days.map(d => batches.filter(b=>b.received_date===d.toISOString().slice(0,10)).reduce((s,b)=>s+b.qty,0)),
  };

  const stageBuckets = { Unboxing:'Unboxed', Software:'Software', QC:'Quality Check', Reseal:'Resealed', Packaging:'Packaging' };
  backendOutputData = {
    labels: Object.keys(stageBuckets),
    values: Object.values(stageBuckets).map(stage => batches.filter(b=>b.stage===stage).reduce((s,b)=>s+b.qty,0)),
  };
}

function renderKPIs(){
  const wrap = document.getElementById('kpiRow');
  wrap.innerHTML = DASH_DATA.kpis.map((k,i) => `
    <div class="card kpi-card fade-up" style="animation-delay:${i*0.05}s">
      <div class="kpi-top">
        <div class="kpi-icon kpi-${k.color}"><i class="${k.icon}"></i></div>
        <span class="badge ${k.up?'badge-success':'badge-danger'}"><i class="ri-arrow-${k.up?'up':'down'}-line"></i>${k.delta}</span>
      </div>
      <div class="kpi-value" id="kpi-val-${i}">0</div>
      <div class="kpi-label">${k.label}</div>
    </div>`).join('');

  DASH_DATA.kpis.forEach((k,i) => {
    const el = document.getElementById('kpi-val-'+i);
    NexusApp.countUp(el, k.value, 1000, k.prefix||'', k.suffix||'');
  });
}

function renderActivity(){
  document.getElementById('activityFeed').innerHTML = DASH_DATA.activity.map(a => `
    <div class="activity-row">
      <div class="activity-icon" style="background:var(--${a.color}-soft); color:var(--${a.color});"><i class="${a.icon}"></i></div>
      <div class="activity-text"><span>${a.text}</span><small>${a.time}</small></div>
    </div>`).join('');
}

function renderDeadlines(){
  document.getElementById('deadlineList').innerHTML = DASH_DATA.deadlines.map(d => `
    <div class="deadline-row">
      <span class="deadline-dot ${d.tag==='urgent'?'urgent':''}"></span>
      <div class="deadline-text"><b>${d.title}</b><small>${d.due}</small></div>
    </div>`).join('');
}

function renderTopWorkers(){
  const max = Math.max(...DASH_DATA.topWorkers.map(w=>w.output));
  document.getElementById('topWorkersList').innerHTML = DASH_DATA.topWorkers.map((w,i) => `
    <div class="worker-rank-row">
      <div class="avatar" style="width:34px;height:34px;font-size:12px;background:${w.color};">${initials(w.name)}</div>
      <div class="worker-rank-meta"><b>${w.name}</b><small>${w.role}</small></div>
      <div class="worker-rank-bar-wrap">
        <div class="worker-rank-bar" style="width:0%; background:${w.color};" data-w="${(w.output/max*100)}"></div>
      </div>
      <span class="worker-rank-val">${w.output}%</span>
    </div>`).join('');
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.worker-rank-bar').forEach(el => { el.style.width = el.dataset.w + '%'; });
    }, 100);
  });
}

function initCharts(){
  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(20,22,43,0.06)';
  const textColor = isDark ? '#9CA3AF' : '#6B7280';
  Chart.defaults.font.family = "'Inter Tight','Inter',sans-serif";
  Chart.defaults.color = textColor;

  // Production Trend (line, gradient area)
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  const grad = trendCtx.createLinearGradient(0,0,0,240);
  grad.addColorStop(0, 'rgba(109,93,246,0.35)');
  grad.addColorStop(1, 'rgba(109,93,246,0.02)');
  const trendLabels = backendTrendData ? backendTrendData.labels : ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const trendValues = backendTrendData ? backendTrendData.values : [1420,1560,1380,1710,1840,1690];
  new Chart(trendCtx, {
    type:'line',
    data:{
      labels: trendLabels,
      datasets:[{
        label:'Units produced', data: trendValues,
        borderColor:'#6D5DF6', backgroundColor:grad, fill:true, tension:.4,
        pointBackgroundColor:'#fff', pointBorderColor:'#6D5DF6', pointBorderWidth:2, pointRadius:4, borderWidth:3,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10, titleFont:{weight:700} } },
      scales:{
        x:{ grid:{ display:false }, border:{display:false} },
        y:{ grid:{ color:gridColor }, border:{display:false} }
      }
    }
  });

  // Daily Output (bar)
  const outputCtx = document.getElementById('outputChart').getContext('2d');
  const outputLabels = backendOutputData ? backendOutputData.labels : ['Unboxing','Software','QC','Reseal','Packaging'];
  const outputValues = backendOutputData ? backendOutputData.values : [1920,1780,1640,1710,1580];
  new Chart(outputCtx, {
    type:'bar',
    data:{
      labels: outputLabels,
      datasets:[{
        label:'Units', data: outputValues,
        backgroundColor:['#6D5DF6','#5B5CF6','#4F46E5','#7C3AED','#3B82F6'],
        borderRadius:10, maxBarThickness:38,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
      scales:{
        x:{ grid:{ display:false }, border:{display:false} },
        y:{ grid:{ color:gridColor }, border:{display:false} }
      }
    }
  });

  // Worker Performance (doughnut)
  const perfCtx = document.getElementById('perfChart').getContext('2d');
  new Chart(perfCtx, {
    type:'doughnut',
    data:{
      labels:['Excellent','Good','Average','Needs support'],
      datasets:[{ data:[42,31,19,8], backgroundColor:['#6D5DF6','#3B82F6','#F59E0B','#EF4444'], borderWidth:0, hoverOffset:6 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'72%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', padding:14, font:{size:11,weight:600} } },
        tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } }
    }
  });
}

function initFab(){
  const fab = document.getElementById('fab');
  const fabMenu = document.getElementById('fabMenu');
  fab.addEventListener('click', () => fabMenu.classList.toggle('open'));
  document.addEventListener('click', (e) => { if(!e.target.closest('.fab-wrap')) fabMenu.classList.remove('open'); });
}

/* ---------------- CLOCK OFF ---------------- */
async function renderClockButton(){
  const status = await ShiftStatus.checkAutoRestart();
  const btn = document.getElementById('clockOffBtn');
  const label = document.getElementById('clockOffBtnText');
  if(!status){ btn.style.display = 'none'; return; }
  btn.style.display = 'inline-flex';
  label.textContent = status.is_running ? 'Clock Off' : 'Clocked Off — resumes 8AM';
  btn.classList.toggle('btn-danger', status.is_running);
  btn.classList.toggle('btn-secondary', !status.is_running);
  btn.disabled = !status.is_running;
}
async function handleClockToggle(){
  const btn = document.getElementById('clockOffBtn');
  btn.disabled = true;
  const { error } = await ShiftStatus.clockOff();
  if(error){ NexusApp.toast('Could not clock off: ' + (error.message||error), 'error'); btn.disabled = false; return; }
  NexusApp.toast('Shift clocked off — Workflow will pause and resume automatically at 8:00 AM', 'success');
  renderClockButton();
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('index.html', session);

  if(SagoBackend?.isConfigured()){
    await loadDashboardFromBackend();
    renderClockButton();
  }

  renderKPIs();
  renderActivity();
  renderDeadlines();
  renderTopWorkers();
  initCharts();
  initFab();
});
