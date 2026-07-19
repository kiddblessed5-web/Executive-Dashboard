/* ============================================================
   NEXUS OPERATIONS OS — Payroll module
   Pulls days-worked straight from attendance records and
   auto-calculates base pay, overtime, bonuses & deductions.
============================================================ */

const PR_ROSTER = [
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
  { id:'W-2011', name:'Brian Ochieng', role:'Unboxing', color:'#6D5DF6' },
  { id:'W-2012', name:'Esther Nyambura', role:'Software Install', color:'#3B82F6' },
];

const DAILY_RATE = 600;
const OVERTIME_RATE = 100; // per hour
const LATE_DEDUCTION = 100; // per late day

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function money(n){ return 'KES ' + Math.round(n).toLocaleString(); }
function isSunday(dateStr){ return new Date(dateStr+'T00:00:00').getDay() === 0; }

/* ---------------- SEEDED RANDOM (stable per worker+period) ---------------- */
function strHash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return Math.abs(h); }
function seededRandom(seed){ const x = Math.sin(seed)*10000; return x - Math.floor(x); }

/* ---------------- ATTENDANCE SOURCE ---------------- */
let ATT_DATA = {};
function loadAttendanceSource(){
  const saved = localStorage.getItem('nexus_attendance');
  ATT_DATA = saved ? JSON.parse(saved) : {};
  seedAttendanceIfMissing();
}
function persistAttendanceSource(){ localStorage.setItem('nexus_attendance', JSON.stringify(ATT_DATA)); }
function seedAttendanceIfMissing(){
  let changed = false;
  for(let i = 1; i <= 60; i++){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = fmtDate(d);
    if(isSunday(key)) continue;
    if(!ATT_DATA[key]){
      changed = true;
      ATT_DATA[key] = {};
      PR_ROSTER.forEach(w => {
        const roll = seededRandom(strHash(w.id+key+'att'));
        if(roll < 0.06) ATT_DATA[key][w.id] = { status:'absent' };
        else if(roll < 0.18) ATT_DATA[key][w.id] = { status:'late' };
        else ATT_DATA[key][w.id] = { status:'present' };
      });
    }
  }
  if(changed) persistAttendanceSource();
}

/* ---------------- PERIOD HELPERS ---------------- */
let periodType = 'weekly'; // 'weekly' | 'monthly'
let periodAnchor = new Date(); // any date within the current period

function getWeekStart(date){
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}
function getPeriodDates(){
  if(periodType === 'weekly'){
    const start = getWeekStart(periodAnchor);
    const dates = [];
    for(let i=0;i<6;i++){ const d = new Date(start); d.setDate(d.getDate()+i); dates.push(fmtDate(d)); }
    return dates;
  } else {
    const y = periodAnchor.getFullYear(), m = periodAnchor.getMonth();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const dates = [];
    for(let day=1; day<=daysInMonth; day++){
      const d = new Date(y, m, day);
      if(d > new Date()) break;
      if(d.getDay() !== 0) dates.push(fmtDate(d));
    }
    return dates;
  }
}
function getPeriodKey(){
  if(periodType === 'weekly') return fmtDate(getWeekStart(periodAnchor));
  return `${periodAnchor.getFullYear()}-${String(periodAnchor.getMonth()+1).padStart(2,'0')}`;
}
function getPeriodLabel(){
  const dates = getPeriodDates();
  if(dates.length === 0) return '—';
  if(periodType === 'weekly'){
    const start = new Date(dates[0]+'T00:00:00'), end = new Date(dates[dates.length-1]+'T00:00:00');
    return `${start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
  }
  return periodAnchor.toLocaleDateString('en-GB',{ month:'long', year:'numeric' });
}
function shiftPeriod(delta){
  if(periodType === 'weekly') periodAnchor.setDate(periodAnchor.getDate() + delta*7);
  else periodAnchor.setMonth(periodAnchor.getMonth() + delta);
  renderAll();
}
function setPeriodType(type){
  periodType = type;
  document.querySelectorAll('.period-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  renderAll();
}

/* ---------------- PAY CALCULATION ---------------- */
function calcWorkerPay(worker, periodKey, dates){
  let daysWorked = 0, daysLate = 0;
  dates.forEach(dateStr => {
    const rec = (ATT_DATA[dateStr] || {})[worker.id];
    if(rec && (rec.status === 'present' || rec.status === 'late')) daysWorked++;
    if(rec && rec.status === 'late') daysLate++;
  });

  const basePay = daysWorked * DAILY_RATE;
  const otRoll = seededRandom(strHash(worker.id+periodKey+'ot'));
  const overtimeHours = otRoll > 0.55 ? Math.round(otRoll*6) : 0;
  const overtimePay = overtimeHours * OVERTIME_RATE;
  const bonusRoll = seededRandom(strHash(worker.id+periodKey+'bonus'));
  const bonus = bonusRoll > 0.72 ? Math.round((300 + bonusRoll*1300)/50)*50 : 0;
  const latePenalty = daysLate * LATE_DEDUCTION;
  const otherDeduction = 0;
  const deductions = latePenalty + otherDeduction;
  const grossPay = basePay + overtimePay + bonus;
  const netPay = grossPay - deductions;

  return { worker, daysWorked, daysLate, basePay, overtimeHours, overtimePay, bonus, latePenalty, deductions, grossPay, netPay };
}

function calcPeriodPayroll(){
  const dates = getPeriodDates();
  const periodKey = getPeriodKey();
  return PR_ROSTER.map(w => calcWorkerPay(w, periodKey, dates));
}

/* ---------------- PAYMENT RUNS ---------------- */
let PAYROLL_RUNS = {};
function loadRuns(){
  const saved = localStorage.getItem('nexus_payroll_runs');
  PAYROLL_RUNS = saved ? JSON.parse(saved) : {};
}
function persistRuns(){ localStorage.setItem('nexus_payroll_runs', JSON.stringify(PAYROLL_RUNS)); }
function runKey(){ return periodType + ':' + getPeriodKey(); }
function isPeriodPaid(){ return !!PAYROLL_RUNS[runKey()]; }

function runPayroll(){
  const payroll = calcPeriodPayroll();
  const total = payroll.reduce((s,p)=>s+p.netPay, 0);
  const btn = document.getElementById('runPayrollBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin .7s linear infinite;"></i> Processing…';

  setTimeout(() => {
    PAYROLL_RUNS[runKey()] = {
      periodType, periodKey:getPeriodKey(), label:getPeriodLabel(),
      total, workers: payroll.length, runDate: new Date().toISOString(), status:'Paid'
    };
    persistRuns();
    NexusApp.toast(`Payroll processed — ${money(total)} paid to ${payroll.length} workers`, 'success');
    renderAll();
  }, 1100);
}

/* ---------------- RENDER: HERO ---------------- */
function renderHero(){
  const payroll = calcPeriodPayroll();
  const totalNet = payroll.reduce((s,p)=>s+p.netPay,0);
  const totalBase = payroll.reduce((s,p)=>s+p.basePay,0);
  const totalOT = payroll.reduce((s,p)=>s+p.overtimePay,0);
  const totalBonus = payroll.reduce((s,p)=>s+p.bonus,0);
  const totalDed = payroll.reduce((s,p)=>s+p.deductions,0);

  document.getElementById('periodLabel').textContent = getPeriodLabel();
  document.getElementById('heroPeriodType').textContent = periodType === 'weekly' ? 'Weekly Payroll' : 'Monthly Payroll';

  NexusApp.countUp(document.getElementById('heroTotal'), Math.round(totalNet), 900, 'KES ', '');
  document.getElementById('heroBase').textContent = money(totalBase);
  document.getElementById('heroOT').textContent = money(totalOT);
  document.getElementById('heroBonus').textContent = money(totalBonus);
  document.getElementById('heroDed').textContent = '-' + money(totalDed);

  const paid = isPeriodPaid();
  const statusEl = document.getElementById('heroStatus');
  if(paid){
    const run = PAYROLL_RUNS[runKey()];
    statusEl.innerHTML = `<i class="ri-checkbox-circle-fill"></i> Paid on ${new Date(run.runDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
    statusEl.className = 'hero-status paid';
    document.getElementById('runPayrollBtn').innerHTML = '<i class="ri-refresh-line"></i> Re-run Payroll';
  } else {
    statusEl.innerHTML = `<i class="ri-time-line"></i> Pending — not yet processed`;
    statusEl.className = 'hero-status pending';
    document.getElementById('runPayrollBtn').innerHTML = '<i class="ri-play-circle-line"></i> Run Payroll';
  }
  document.getElementById('runPayrollBtn').disabled = false;
}

/* ---------------- RENDER: KPIs ---------------- */
function renderKPIs(){
  const payroll = calcPeriodPayroll();
  const avgNet = payroll.length ? payroll.reduce((s,p)=>s+p.netPay,0)/payroll.length : 0;
  const totalOTHours = payroll.reduce((s,p)=>s+p.overtimeHours,0);
  const totalDed = payroll.reduce((s,p)=>s+p.deductions,0);
  const paidWorkers = payroll.filter(p=>p.daysWorked>0).length;

  document.getElementById('kpiWorkers').textContent = paidWorkers;
  document.getElementById('kpiAvg').textContent = money(avgNet);
  document.getElementById('kpiOTHours').textContent = totalOTHours + ' hrs';
  document.getElementById('kpiDeductions').textContent = money(totalDed);
}

/* ---------------- RENDER: CHARTS ---------------- */
let trendChartInstance = null, breakdownChartInstance = null;

function renderCharts(){
  // trend across last 6 periods of current type
  const labels = [], totals = [];
  const savedAnchor = new Date(periodAnchor);
  for(let i=5;i>=0;i--){
    const anchor = new Date(savedAnchor);
    if(periodType==='weekly') anchor.setDate(anchor.getDate() - i*7);
    else anchor.setMonth(anchor.getMonth() - i);
    const dates = (function(){
      const tmp = periodAnchor; periodAnchor = anchor;
      const d = getPeriodDates(); const key = getPeriodKey();
      periodAnchor = tmp;
      return { d, key };
    })();
    const total = PR_ROSTER.reduce((s,w)=> s + calcWorkerPay(w, dates.key, dates.d).netPay, 0);
    labels.push(periodType==='weekly'
      ? new Date(dates.d[0]||fmtDate(anchor)).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
      : anchor.toLocaleDateString('en-GB',{month:'short'}));
    totals.push(Math.round(total));
  }

  const trendCtx = document.getElementById('prTrendChart').getContext('2d');
  if(trendChartInstance) trendChartInstance.destroy();
  const grad = trendCtx.createLinearGradient(0,0,0,200);
  grad.addColorStop(0, 'rgba(109,93,246,0.35)');
  grad.addColorStop(1, 'rgba(109,93,246,0.02)');
  trendChartInstance = new Chart(trendCtx, {
    type:'line',
    data:{ labels, datasets:[{ data:totals, borderColor:'#6D5DF6', backgroundColor:grad, fill:true, tension:.4, pointBackgroundColor:'#fff', pointBorderColor:'#6D5DF6', pointBorderWidth:2, pointRadius:4, borderWidth:3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10, callbacks:{ label: c => money(c.raw) } } },
      scales:{ x:{ grid:{display:false}, border:{display:false} }, y:{ grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false}, ticks:{ callback:v=>(v/1000)+'k' } } } }
  });

  const payroll = calcPeriodPayroll();
  const totalBase = payroll.reduce((s,p)=>s+p.basePay,0);
  const totalOT = payroll.reduce((s,p)=>s+p.overtimePay,0);
  const totalBonus = payroll.reduce((s,p)=>s+p.bonus,0);
  const totalDed = payroll.reduce((s,p)=>s+p.deductions,0);

  const bCtx = document.getElementById('prBreakdownChart').getContext('2d');
  if(breakdownChartInstance) breakdownChartInstance.destroy();
  breakdownChartInstance = new Chart(bCtx, {
    type:'doughnut',
    data:{ labels:['Base Pay','Overtime','Bonuses','Deductions'], datasets:[{ data:[totalBase,totalOT,totalBonus,totalDed], backgroundColor:['#6D5DF6','#3B82F6','#16A34A','#EF4444'], borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'70%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', padding:12, font:{size:11,weight:600} } },
        tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10, callbacks:{ label: c => c.label+': '+money(c.raw) } } } }
  });
}

/* ---------------- RENDER: TABLE ---------------- */
let prFilters = { search:'', status:'all' };

function renderTable(){
  const payroll = calcPeriodPayroll();
  const paid = isPeriodPaid();
  const tbody = document.getElementById('prTableBody');
  const rows = payroll.filter(p => {
    if(prFilters.search && !p.worker.name.toLowerCase().includes(prFilters.search)) return false;
    if(prFilters.status === 'worked' && p.daysWorked === 0) return false;
    if(prFilters.status === 'none' && p.daysWorked > 0) return false;
    return true;
  });

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><div class="region-cell"><div class="avatar" style="width:32px;height:32px;font-size:11px;background:${p.worker.color};">${initials(p.worker.name)}</div><div><b>${p.worker.name}</b><small style="display:block;color:var(--ink-faint);font-weight:600;">${p.worker.role}</small></div></div></td>
      <td>${p.daysWorked} days</td>
      <td>${money(p.basePay)}</td>
      <td>${p.overtimeHours>0 ? p.overtimeHours+'h · '+money(p.overtimePay) : '—'}</td>
      <td>${p.bonus>0 ? money(p.bonus) : '—'}</td>
      <td style="color:var(--danger);">${p.deductions>0 ? '-'+money(p.deductions) : '—'}</td>
      <td><b>${money(p.netPay)}</b></td>
      <td><span class="badge badge-${paid?'success':'warning'}"><span class="badge-dot"></span>${paid?'Paid':'Pending'}</span></td>
      <td><button class="btn btn-secondary btn-sm" onclick="openPayslip('${p.worker.id}')"><i class="ri-file-text-line"></i>Payslip</button></td>
    </tr>`).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:26px;">No workers match your filters</td></tr>`;
}

/* ---------------- PAYSLIP ---------------- */
function openPayslip(workerId){
  const worker = PR_ROSTER.find(w=>w.id===workerId);
  const dates = getPeriodDates();
  const p = calcWorkerPay(worker, getPeriodKey(), dates);
  const paid = isPeriodPaid();

  document.getElementById('psWorkerAvatar').style.background = worker.color;
  document.getElementById('psWorkerAvatar').textContent = initials(worker.name);
  document.getElementById('psWorkerName').textContent = worker.name;
  document.getElementById('psWorkerRole').textContent = worker.role + ' · ' + worker.id;
  document.getElementById('psPeriod').textContent = getPeriodLabel();
  document.getElementById('psIssued').textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('psStatus').innerHTML = paid ? `<i class="ri-checkbox-circle-fill"></i> Paid` : `<i class="ri-time-line"></i> Pending`;
  document.getElementById('psStatus').className = 'badge ' + (paid ? 'badge-success' : 'badge-warning');

  document.getElementById('psDaysWorked').textContent = p.daysWorked + ' days × ' + money(DAILY_RATE);
  document.getElementById('psBasePay').textContent = money(p.basePay);
  document.getElementById('psOvertime').textContent = p.overtimeHours + ' hrs × ' + money(OVERTIME_RATE);
  document.getElementById('psOvertimePay').textContent = money(p.overtimePay);
  document.getElementById('psBonus').textContent = money(p.bonus);
  document.getElementById('psGross').textContent = money(p.grossPay);
  document.getElementById('psLateDays').textContent = p.daysLate + ' late day(s) × ' + money(LATE_DEDUCTION);
  document.getElementById('psDeductions').textContent = '-' + money(p.deductions);
  document.getElementById('psNet').textContent = money(p.netPay);

  window.currentPayslipWorker = workerId;
  NexusApp.openModal('modal-payslip');
}

function downloadPayslipPDF(){
  NexusApp.toast('Opening print dialog — choose "Save as PDF"', 'info');
  setTimeout(() => window.print(), 300);
}

function sendPayslip(){
  const worker = PR_ROSTER.find(w=>w.id===window.currentPayslipWorker);
  NexusApp.toast(`Payslip sent to ${worker.name} (demo)`, 'success');
}

/* ---------------- PAYMENT HISTORY ---------------- */
function renderHistory(){
  const runs = Object.values(PAYROLL_RUNS).sort((a,b)=> new Date(b.runDate)-new Date(a.runDate));
  const wrap = document.getElementById('historyList');
  wrap.innerHTML = runs.slice(0,8).map(r => `
    <div class="history-row" onclick="jumpToRun('${r.periodType}','${r.periodKey}')">
      <div class="history-icon"><i class="ri-checkbox-circle-fill"></i></div>
      <div class="history-text"><b>${r.periodType==='weekly'?'Weekly':'Monthly'} payroll — ${r.label}</b><small>${r.workers} workers · Paid ${new Date(r.runDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</small></div>
      <div class="history-amt">${money(r.total)}</div>
    </div>`).join('') || `<span class="muted-note">No payroll runs yet — process this period to start your history.</span>`;
}
function jumpToRun(type, periodKey){
  periodType = type;
  document.querySelectorAll('.period-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  periodAnchor = type==='weekly' ? new Date(periodKey+'T00:00:00') : new Date(periodKey+'-01T00:00:00');
  renderAll();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---------------- EXPORT ---------------- */
function exportPayrollCSV(){
  const payroll = calcPeriodPayroll();
  const rows = [['Worker ID','Name','Role','Days Worked','Base Pay','Overtime Hours','Overtime Pay','Bonus','Deductions','Net Pay']];
  payroll.forEach(p => rows.push([p.worker.id, p.worker.name, p.worker.role, p.daysWorked, p.basePay, p.overtimeHours, p.overtimePay, p.bonus, p.deductions, p.netPay]));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `payroll-${getPeriodKey()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Payroll report exported', 'success');
}

/* ---------------- WIRES ---------------- */
function wireToolbar(){
  document.getElementById('prSearch').addEventListener('input', e => { prFilters.search = e.target.value.trim().toLowerCase(); renderTable(); });
  document.getElementById('prStatusFilter').addEventListener('change', e => { prFilters.status = e.target.value; renderTable(); });
}

function renderAll(){
  document.getElementById('periodTypeLabel').textContent = periodType === 'weekly' ? 'Week' : 'Month';
  const label2 = document.getElementById('periodLabel2');
  if(label2) label2.textContent = getPeriodLabel();
  renderHero();
  renderKPIs();
  renderTable();
  renderCharts();
  renderHistory();
}

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('payroll.html', session);
  loadAttendanceSource();
  loadRuns();
  wireToolbar();
  renderAll();
});
