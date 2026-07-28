/* ============================================================
   SAGERO CREATIONS — Reports module
   Pulls real data from other modules' localStorage where
   available (batches, attendance, payroll, workers, QC),
   with self-contained fallback seeding so this page also
   works standalone.
============================================================ */

const RPT_MODELS = ['Vivo Y18','Vivo Y28','Vivo V30','Vivo Y36','Vivo X100','Vivo Y17s'];
const RPT_MANAGERS = ['Wei Zhang','Li Chen','Feng Yun','Chao Liu'];
const RPT_WORKERS = [
  { id:'W-2001', name:'Grace Achieng', role:'Unboxing', color:'#6D5DF6' },
  { id:'W-2002', name:'Kevin Otieno', role:'Software Install', color:'#3B82F6' },
  { id:'W-2003', name:'Mercy Njoki', role:'Quality Check', color:'#7C3AED' },
  { id:'W-2004', name:'Samuel Kiprono', role:'Resealing', color:'#4F46E5' },
  { id:'W-2005', name:'Peter Mutua', role:'Packaging', color:'#5B5CF6' },
  { id:'W-2006', name:'Joy Chebet', role:'Unboxing', color:'#3B82F6' },
  { id:'W-2007', name:'Dennis Kamau', role:'Software Install', color:'#6D5DF6' },
  { id:'W-2008', name:'Ruth Wanjiku', role:'Quality Check', color:'#7C3AED' },
  { id:'W-2009', name:'Collins Odhiambo', role:'Resealing', color:'#4F46E5' },
  { id:'W-2010', name:'Faith Auma', role:'Packaging', color:'#5B5CF6' },
];

function fmtDate(iso){ return new Date(iso).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
function money(n){ return 'KES ' + Math.round(n).toLocaleString(); }
function isSunday(dateStr){ return new Date(dateStr+'T00:00:00').getDay() === 0; }
function fmtDateISO(d){ return d.toISOString().slice(0,10); }

/* ---------------- DATA SOURCES (real if present, seeded fallback otherwise) ---------------- */
let PROD_DATA = [], ATT_DATA = {}, PAYROLL_RUNS = {}, WORKER_STATS = [], QC_DATA = [];

function loadAllData(){
  loadProduction();
  loadAttendance();
  loadPayroll();
  loadWorkerStats();
  loadQC();
}

function loadProduction(){
  const saved = localStorage.getItem('nexus_batches');
  if(saved){ PROD_DATA = JSON.parse(saved); return; }
  const statuses = ['On Track','On Track','At Risk','Delayed','Completed','On Track','Completed','At Risk'];
  PROD_DATA = statuses.map((status,i) => ({
    id:'BX-'+(1030+i), model:RPT_MODELS[i%RPT_MODELS.length], qty:150+i*23,
    manager:RPT_MANAGERS[i%RPT_MANAGERS.length], status,
    progress: status==='Completed'?100:status==='Delayed'?Math.round(20+Math.random()*20):Math.round(40+Math.random()*50),
  }));
}

function loadAttendance(){
  const saved = localStorage.getItem('nexus_attendance');
  if(saved){ ATT_DATA = JSON.parse(saved); if(Object.keys(ATT_DATA).length) return; }
  ATT_DATA = {};
  for(let i=1;i<=30;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = fmtDateISO(d);
    if(isSunday(key)) continue;
    ATT_DATA[key] = {};
    RPT_WORKERS.forEach(w => {
      const roll = Math.random();
      ATT_DATA[key][w.id] = { status: roll<0.06?'absent':roll<0.18?'late':'present' };
    });
  }
}

function loadPayroll(){
  const saved = localStorage.getItem('nexus_payroll_runs');
  if(saved && Object.keys(JSON.parse(saved)).length){ PAYROLL_RUNS = JSON.parse(saved); return; }
  PAYROLL_RUNS = {};
  for(let i=0;i<5;i++){
    const d = new Date(); d.setDate(d.getDate()-i*7);
    const key = 'weekly:'+fmtDateISO(d);
    PAYROLL_RUNS[key] = {
      periodType:'weekly', label:'Week of '+fmtDate(d.toISOString()),
      total: 40000+Math.round(Math.random()*20000), workers:10,
      runDate: d.toISOString(), status:'Paid'
    };
  }
}

function loadWorkerStats(){
  const savedWorkers = localStorage.getItem('nexus_workers');
  const roster = savedWorkers ? JSON.parse(savedWorkers) : RPT_WORKERS.map(w => ({...w, dailyOutput:180+Math.round(Math.random()*140), attendanceRate:82+Math.round(Math.random()*17), status:'Active'}));
  WORKER_STATS = roster.map(w => ({
    id:w.id, name:w.name, role:w.role, color: w.color || '#6D5DF6',
    dailyOutput: w.dailyOutput || (180+Math.round(Math.random()*140)),
    attendanceRate: w.attendanceRate || (82+Math.round(Math.random()*17)),
    status: w.status || 'Active',
  }));
}

function loadQC(){
  const saved = localStorage.getItem('nexus_qc_inspections');
  QC_DATA = saved ? JSON.parse(saved) : [];
}

/* ---------------- REPORT TYPE STATE ---------------- */
let activeReport = 'production';
let dateFrom = null, dateTo = null;

function setReportType(type){
  activeReport = type;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.toggle('active', t.dataset.report===type));
  document.querySelectorAll('.report-filter-extra').forEach(el => el.style.display = 'none');
  const extra = document.getElementById('extra-'+type);
  if(extra) extra.style.display = 'flex';
  renderActiveReport();
}

function initDateRange(){
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate()-13);
  dateFrom = fmtDateISO(from);
  dateTo = fmtDateISO(to);
  document.getElementById('dateFrom').value = dateFrom;
  document.getElementById('dateTo').value = dateTo;
}
function onDateChange(){
  dateFrom = document.getElementById('dateFrom').value;
  dateTo = document.getElementById('dateTo').value;
  renderActiveReport();
}
function datesInRange(){
  const dates = [];
  let d = new Date(dateFrom+'T00:00:00');
  const end = new Date(dateTo+'T00:00:00');
  while(d <= end){ dates.push(fmtDateISO(d)); d.setDate(d.getDate()+1); }
  return dates;
}

/* ---------------- CHART INSTANCES ---------------- */
let chart1 = null, chart2 = null;
function destroyCharts(){
  if(chart1){ chart1.destroy(); chart1 = null; }
  if(chart2){ chart2.destroy(); chart2 = null; }
}

/* ---------------- RENDER ROUTER ---------------- */
function renderActiveReport(){
  destroyCharts();
  if(activeReport === 'production') renderProduction();
  if(activeReport === 'attendance') renderAttendanceReport();
  if(activeReport === 'payroll') renderPayrollReport();
  if(activeReport === 'managers') renderManagerReport();
  if(activeReport === 'workers') renderWorkerReport();
}

/* ---------------- PRODUCTION REPORT ---------------- */
function renderProduction(){
  const modelFilter = document.getElementById('filterModel').value;
  let data = PROD_DATA;
  if(modelFilter !== 'all') data = data.filter(b => b.model === modelFilter);

  const totalUnits = data.reduce((s,b)=>s+b.qty,0);
  const completed = data.filter(b=>b.status==='Completed').length;
  const onTimeRate = data.length ? Math.round(data.filter(b=>b.status!=='Delayed').length/data.length*100) : 0;

  setKPIs([
    { label:'Total batches', value: data.length, icon:'ri-stack-line', color:'primary' },
    { label:'Units in these batches', value: totalUnits.toLocaleString(), icon:'ri-smartphone-line', color:'info' },
    { label:'Completed', value: completed, icon:'ri-checkbox-circle-line', color:'success' },
    { label:'On-time rate', value: onTimeRate+'%', icon:'ri-flashlight-line', color:'warning' },
  ]);

  const byModel = {};
  RPT_MODELS.forEach(m => byModel[m] = 0);
  data.forEach(b => byModel[b.model] = (byModel[b.model]||0) + b.qty);
  chart1 = new Chart(document.getElementById('reportChart1').getContext('2d'), {
    type:'bar',
    data:{ labels:RPT_MODELS, datasets:[{ data:RPT_MODELS.map(m=>byModel[m]), backgroundColor:'#6D5DF6', borderRadius:8, maxBarThickness:34 }] },
    options: baseBarOptions('Units')
  });

  const statuses = ['On Track','At Risk','Delayed','Completed'];
  const counts = statuses.map(s => data.filter(b=>b.status===s).length);
  chart2 = new Chart(document.getElementById('reportChart2').getContext('2d'), {
    type:'doughnut',
    data:{ labels:statuses, datasets:[{ data:counts, backgroundColor:['#6D5DF6','#F59E0B','#EF4444','#16A34A'], borderWidth:0, hoverOffset:6 }] },
    options: baseDonutOptions()
  });

  renderTable(
    ['Batch','Model','Qty','Manager','Progress','Status'],
    data.map(b => [b.id, b.model, b.qty, b.manager, b.progress+'%', b.status])
  );
}

/* ---------------- ATTENDANCE REPORT ---------------- */
function renderAttendanceReport(){
  const dates = datesInRange().filter(d => !isSunday(d));
  let totalPresent=0, totalLate=0, totalAbsent=0, totalSlots=0;
  const perWorker = {};
  RPT_WORKERS.forEach(w => perWorker[w.id] = { present:0, late:0, absent:0 });

  dates.forEach(d => {
    const rec = ATT_DATA[d] || {};
    RPT_WORKERS.forEach(w => {
      const r = rec[w.id];
      if(!r) return;
      totalSlots++;
      if(r.status==='present'){ totalPresent++; perWorker[w.id].present++; }
      else if(r.status==='late'){ totalLate++; perWorker[w.id].late++; }
      else if(r.status==='absent'){ totalAbsent++; perWorker[w.id].absent++; }
    });
  });
  const avgRate = totalSlots ? Math.round((totalPresent+totalLate)/totalSlots*100) : 0;

  setKPIs([
    { label:'Avg attendance rate', value: avgRate+'%', icon:'ri-percent-line', color:'primary' },
    { label:'Present (days)', value: totalPresent, icon:'ri-checkbox-circle-line', color:'success' },
    { label:'Late (days)', value: totalLate, icon:'ri-time-line', color:'warning' },
    { label:'Absent (days)', value: totalAbsent, icon:'ri-close-circle-line', color:'danger' },
  ]);

  const labels = dates.map(d => new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));
  const presentArr = dates.map(d => Object.values(ATT_DATA[d]||{}).filter(r=>r.status==='present').length);
  const lateArr = dates.map(d => Object.values(ATT_DATA[d]||{}).filter(r=>r.status==='late').length);
  const absentArr = dates.map(d => Object.values(ATT_DATA[d]||{}).filter(r=>r.status==='absent').length);

  chart1 = new Chart(document.getElementById('reportChart1').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Present', data:presentArr, backgroundColor:'#16A34A', stack:'s', borderRadius:4 },
      { label:'Late', data:lateArr, backgroundColor:'#F59E0B', stack:'s', borderRadius:4 },
      { label:'Absent', data:absentArr, backgroundColor:'#EF4444', stack:'s', borderRadius:4 },
    ]},
    options: baseBarOptions('Workers', true)
  });

  const rates = RPT_WORKERS.map(w => {
    const p = perWorker[w.id];
    const total = p.present+p.late+p.absent;
    return total ? Math.round((p.present+p.late)/total*100) : 0;
  });
  chart2 = new Chart(document.getElementById('reportChart2').getContext('2d'), {
    type:'bar',
    data:{ labels:RPT_WORKERS.map(w=>w.name.split(' ')[0]), datasets:[{ data:rates, backgroundColor:'#3B82F6', borderRadius:8, maxBarThickness:24 }] },
    options: { ...baseBarOptions('%'), indexAxis:'y' }
  });

  renderTable(
    ['Worker','Present','Late','Absent','Rate'],
    RPT_WORKERS.map(w => {
      const p = perWorker[w.id];
      const total = p.present+p.late+p.absent;
      const rate = total ? Math.round((p.present+p.late)/total*100) : 0;
      return [w.name, p.present, p.late, p.absent, rate+'%'];
    })
  );
}

/* ---------------- PAYROLL REPORT ---------------- */
function renderPayrollReport(){
  const runs = Object.values(PAYROLL_RUNS).sort((a,b)=> new Date(a.runDate)-new Date(b.runDate));
  const totalPaid = runs.reduce((s,r)=>s+r.total,0);
  const avgPerWorker = runs.length ? Math.round(runs.reduce((s,r)=>s+(r.total/r.workers),0)/runs.length) : 0;

  setKPIs([
    { label:'Total paid (all runs)', value: money(totalPaid), icon:'ri-money-dollar-circle-line', color:'success' },
    { label:'Payroll runs', value: runs.length, icon:'ri-file-list-3-line', color:'primary' },
    { label:'Avg per worker / run', value: money(avgPerWorker), icon:'ri-scales-3-line', color:'info' },
    { label:'Workers covered', value: runs.length ? runs[runs.length-1].workers : 0, icon:'ri-team-line', color:'warning' },
  ]);

  chart1 = new Chart(document.getElementById('reportChart1').getContext('2d'), {
    type:'line',
    data:{ labels: runs.map(r=>r.label||fmtDate(r.runDate)), datasets:[{ data: runs.map(r=>r.total), borderColor:'#6D5DF6', backgroundColor:'rgba(109,93,246,0.15)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#fff', pointBorderColor:'#6D5DF6', pointBorderWidth:2, borderWidth:3 }] },
    options: baseBarOptions('KES')
  });

  const paidCount = runs.filter(r=>r.status==='Paid').length;
  chart2 = new Chart(document.getElementById('reportChart2').getContext('2d'), {
    type:'doughnut',
    data:{ labels:['Paid','Pending'], datasets:[{ data:[paidCount, runs.length-paidCount], backgroundColor:['#16A34A','#F59E0B'], borderWidth:0, hoverOffset:6 }] },
    options: baseDonutOptions()
  });

  renderTable(
    ['Period','Type','Workers','Total','Status'],
    runs.map(r => [r.label||fmtDate(r.runDate), r.periodType, r.workers, money(r.total), r.status])
  );
}

/* ---------------- MANAGER REPORT ---------------- */
function renderManagerReport(){
  const stats = RPT_MANAGERS.map(name => {
    const batches = PROD_DATA.filter(b=>b.manager===name);
    const completed = batches.filter(b=>b.status==='Completed').length;
    const onTime = batches.length ? Math.round(batches.filter(b=>b.status!=='Delayed').length/batches.length*100) : 0;
    return { name, assigned:batches.length, completed, onTime };
  });
  const best = [...stats].sort((a,b)=>b.onTime-a.onTime)[0];

  setKPIs([
    { label:'Managers', value: RPT_MANAGERS.length, icon:'ri-user-star-line', color:'primary' },
    { label:'Avg batches / manager', value: Math.round(PROD_DATA.length/RPT_MANAGERS.length), icon:'ri-stack-line', color:'info' },
    { label:'Best on-time rate', value: best?best.name.split(' ')[0]:'—', icon:'ri-trophy-line', color:'success' },
    { label:'Total batches managed', value: PROD_DATA.length, icon:'ri-smartphone-line', color:'warning' },
  ]);

  chart1 = new Chart(document.getElementById('reportChart1').getContext('2d'), {
    type:'bar',
    data:{ labels:stats.map(s=>s.name), datasets:[
      { label:'Assigned', data:stats.map(s=>s.assigned), backgroundColor:'#E5E0FE', borderRadius:8 },
      { label:'Completed', data:stats.map(s=>s.completed), backgroundColor:'#6D5DF6', borderRadius:8 },
    ]},
    options: baseBarOptions('Batches', true)
  });

  chart2 = new Chart(document.getElementById('reportChart2').getContext('2d'), {
    type:'doughnut',
    data:{ labels:stats.map(s=>s.name), datasets:[{ data:stats.map(s=>s.onTime), backgroundColor:['#6D5DF6','#3B82F6','#7C3AED','#4F46E5'], borderWidth:0, hoverOffset:6 }] },
    options: baseDonutOptions()
  });

  renderTable(
    ['Manager','Batches Assigned','Completed','On-time Rate'],
    stats.map(s => [s.name, s.assigned, s.completed, s.onTime+'%'])
  );
}

/* ---------------- WORKER REPORT ---------------- */
function renderWorkerReport(){
  const sorted = [...WORKER_STATS].sort((a,b)=>b.dailyOutput-a.dailyOutput);
  const avgOutput = WORKER_STATS.length ? Math.round(WORKER_STATS.reduce((s,w)=>s+w.dailyOutput,0)/WORKER_STATS.length) : 0;
  const avgAttendance = WORKER_STATS.length ? Math.round(WORKER_STATS.reduce((s,w)=>s+w.attendanceRate,0)/WORKER_STATS.length) : 0;

  setKPIs([
    { label:'Total workers', value: WORKER_STATS.length, icon:'ri-team-line', color:'primary' },
    { label:'Avg daily output', value: avgOutput+' units', icon:'ri-flashlight-line', color:'info' },
    { label:'Top performer', value: sorted[0]?sorted[0].name.split(' ')[0]:'—', icon:'ri-medal-line', color:'success' },
    { label:'Avg attendance', value: avgAttendance+'%', icon:'ri-percent-line', color:'warning' },
  ]);

  const top10 = sorted.slice(0,10);
  chart1 = new Chart(document.getElementById('reportChart1').getContext('2d'), {
    type:'bar',
    data:{ labels:top10.map(w=>w.name.split(' ')[0]), datasets:[{ data:top10.map(w=>w.dailyOutput), backgroundColor:'#6D5DF6', borderRadius:8 }] },
    options: { ...baseBarOptions('Units'), indexAxis:'y' }
  });

  const roleCounts = {};
  WORKER_STATS.forEach(w => roleCounts[w.role] = (roleCounts[w.role]||0)+1);
  const roles = Object.keys(roleCounts);
  chart2 = new Chart(document.getElementById('reportChart2').getContext('2d'), {
    type:'doughnut',
    data:{ labels:roles, datasets:[{ data:roles.map(r=>roleCounts[r]), backgroundColor:['#6D5DF6','#3B82F6','#7C3AED','#4F46E5','#5B5CF6','#16A34A'], borderWidth:0, hoverOffset:6 }] },
    options: baseDonutOptions()
  });

  renderTable(
    ['Worker','Role','Daily Output','Attendance','Status'],
    sorted.map(w => [w.name, w.role, w.dailyOutput+' units', w.attendanceRate+'%', w.status])
  );
}

/* ---------------- SHARED UI HELPERS ---------------- */
function setKPIs(items){
  document.getElementById('reportKpiRow').innerHTML = items.map(k => `
    <div class="card kpi-card">
      <div class="kpi-icon" style="background:var(--${k.color==='primary'?'grad-soft':k.color+'-soft'}); color:var(--${k.color==='primary'?'primary-3':k.color});"><i class="${k.icon}"></i></div>
      <div><div class="kpi-value">${k.value}</div><div class="kpi-label">${k.label}</div></div>
    </div>`).join('');
}
function baseBarOptions(unitLabel, stacked){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display: !!stacked, position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
    scales:{ x:{ stacked: !!stacked, grid:{display:false}, border:{display:false} }, y:{ stacked: !!stacked, grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false} } }
  };
}
function baseDonutOptions(){
  return { responsive:true, maintainAspectRatio:false, cutout:'68%',
    plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', padding:10, font:{size:10.5,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } } };
}

let currentTableHeaders = [], currentTableRows = [];
function renderTable(headers, rows){
  currentTableHeaders = headers;
  currentTableRows = rows;
  document.getElementById('reportTableHead').innerHTML = '<tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr>';
  document.getElementById('reportTableBody').innerHTML = rows.map(r => '<tr>' + r.map(c=>`<td>${c}</td>`).join('') + '</tr>').join('')
    || `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--ink-faint);padding:22px;">No data for this range</td></tr>`;
  document.getElementById('reportRowCount').textContent = rows.length + ' row' + (rows.length===1?'':'s');
}

/* ---------------- FILTERS ---------------- */
function populateModelFilter(){
  const sel = document.getElementById('filterModel');
  sel.innerHTML = '<option value="all">All models</option>' + RPT_MODELS.map(m=>`<option>${m}</option>`).join('');
  sel.addEventListener('change', renderActiveReport);
}

/* ---------------- EXPORT ---------------- */
function exportReportCSV(){
  const rows = [currentTableHeaders, ...currentTableRows];
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sagero-${activeReport}-report.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Report exported as CSV', 'success');
}
function exportReportXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load — try CSV', 'error'); return; }
  const rows = currentTableRows.map(r => {
    const obj = {};
    currentTableHeaders.forEach((h,i) => obj[h] = r[i]);
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, activeReport.slice(0,28));
  XLSX.writeFile(wb, `sagero-${activeReport}-report.xlsx`);
  NexusApp.toast('Report exported as Excel workbook', 'success');
}
function exportReportPDF(){
  NexusApp.toast('Opening print dialog — choose "Save as PDF"', 'info');
  setTimeout(() => window.print(), 300);
}

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('reports.html', session);
  loadAllData();
  populateModelFilter();
  initDateRange();
  document.getElementById('dateFrom').addEventListener('change', onDateChange);
  document.getElementById('dateTo').addEventListener('change', onDateChange);
  document.querySelectorAll('.report-tab').forEach(tab => tab.addEventListener('click', () => setReportType(tab.dataset.report)));
  setReportType('production');
});
