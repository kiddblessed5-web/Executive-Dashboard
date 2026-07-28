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
    { label:'Revenue', value:412500, prefix:'KES ', icon:'ri-money-dollar-circle-line', delta:'+6.2%', up:true, color:'success' },
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
    { name:'Grace Achieng', role:'Software Install', output:312, color:'#6D5DF6' },
    { name:'Kevin Otieno', role:'Quality Check', output:289, color:'#3B82F6' },
    { name:'Mercy Njoki', role:'Packaging', output:274, color:'#7C3AED' },
    { name:'Samuel Kiprono', role:'Unboxing', output:251, color:'#4F46E5' },
  ]
};

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

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
      <span class="worker-rank-val">${w.output}</span>
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
  new Chart(trendCtx, {
    type:'line',
    data:{
      labels:['Mon','Tue','Wed','Thu','Fri','Sat'],
      datasets:[{
        label:'Units produced', data:[1420,1560,1380,1710,1840,1690],
        borderColor:'#6D5DF6', backgroundColor:grad, fill:true, tension:.4,
        pointBackgroundColor:'#fff', pointBorderColor:'#6D5DF6', pointBorderWidth:2, pointRadius:4, borderWidth:3,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10, titleFont:{weight:700} } },
      scales:{
        x:{ grid:{ display:false }, border:{display:false} },
        y:{ grid:{ color:gridColor }, border:{display:false}, ticks:{ callback:v=>v/1000+'k' } }
      }
    }
  });

  // Daily Output (bar)
  const outputCtx = document.getElementById('outputChart').getContext('2d');
  new Chart(outputCtx, {
    type:'bar',
    data:{
      labels:['Unboxing','Software','QC','Reseal','Packaging'],
      datasets:[{
        label:'Units', data:[1920,1780,1640,1710,1580],
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

document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('index.html', session);
  renderKPIs();
  renderActivity();
  renderDeadlines();
  renderTopWorkers();
  initCharts();
  initFab();
});
