/* ============================================================
   SAGERO CREATIONS — Attendance module
============================================================ */

const ATT_ROSTER = [
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

const LATE_CUTOFF_MIN = 8 * 60 + 30; // 08:30

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function fmtTime(d){ return d.toTimeString().slice(0,5); }
function timeToMinutes(t){ const [h,m] = t.split(':').map(Number); return h*60+m; }
function isSunday(dateStr){ return new Date(dateStr+'T00:00:00').getDay() === 0; }

let ATT_DATA = {};
let selectedDate = fmtDate(new Date());

function loadAttendance(){
  const saved = localStorage.getItem('nexus_attendance');
  ATT_DATA = saved ? JSON.parse(saved) : {};
  seedHistoryIfMissing();
}
function persistAttendance(){ localStorage.setItem('nexus_attendance', JSON.stringify(ATT_DATA)); }

function seedHistoryIfMissing(){
  let changed = false;
  for(let i = 1; i <= 30; i++){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = fmtDate(d);
    if(isSunday(key)) continue; // Monday-Saturday work week
    if(!ATT_DATA[key]){
      changed = true;
      ATT_DATA[key] = {};
      ATT_ROSTER.forEach(w => {
        const roll = Math.random();
        if(roll < 0.06){ ATT_DATA[key][w.id] = { status:'absent', checkIn:null, checkOut:null }; }
        else if(roll < 0.18){
          const h = 8, m = 31 + Math.floor(Math.random()*45);
          const ci = `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
          ATT_DATA[key][w.id] = { status:'late', checkIn: ci, checkOut:'17:0'+Math.floor(Math.random()*9) };
        } else {
          const h = 7, m = 40 + Math.floor(Math.random()*49);
          const mm = m % 60; const hh = h + Math.floor(m/60);
          const ci = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
          ATT_DATA[key][w.id] = { status:'present', checkIn: ci, checkOut:'17:0'+Math.floor(Math.random()*9) };
        }
      });
    }
  }
  if(changed) persistAttendance();
}

/* ---------------- KPI + DAILY LIST ---------------- */
function getDayRecords(dateStr){
  return ATT_DATA[dateStr] || {};
}
function renderDateHeader(){
  const d = new Date(selectedDate + 'T00:00:00');
  document.getElementById('dateLabel').textContent = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('datePicker').value = selectedDate;
  document.getElementById('sundayNote').style.display = isSunday(selectedDate) ? 'flex' : 'none';
}

function renderKPIs(){
  const records = getDayRecords(selectedDate);
  const total = ATT_ROSTER.length;
  let present=0, late=0, absent=0, unmarked=0;
  ATT_ROSTER.forEach(w => {
    const r = records[w.id];
    if(!r) unmarked++;
    else if(r.status==='present') present++;
    else if(r.status==='late') late++;
    else if(r.status==='absent') absent++;
  });
  const rate = total ? Math.round((present+late)/total*100) : 0;

  document.getElementById('kpiPresent').textContent = present;
  document.getElementById('kpiLate').textContent = late;
  document.getElementById('kpiAbsent').textContent = absent;
  document.getElementById('kpiRate').textContent = rate + '%';
  document.getElementById('kpiUnmarked').textContent = unmarked + ' not yet marked';
}

let attFilters = { search:'', status:'all' };

function renderDailyList(){
  const records = getDayRecords(selectedDate);
  const tbody = document.getElementById('attTableBody');
  const rows = ATT_ROSTER.filter(w => {
    if(attFilters.search && !w.name.toLowerCase().includes(attFilters.search)) return false;
    const r = records[w.id];
    const status = r ? r.status : 'unmarked';
    if(attFilters.status !== 'all' && status !== attFilters.status) return false;
    return true;
  });

  tbody.innerHTML = rows.map(w => {
    const r = records[w.id];
    const status = r ? r.status : 'unmarked';
    const badgeClass = status==='present'?'success':status==='late'?'warning':status==='absent'?'danger':'neutral';
    return `
    <tr>
      <td><div class="region-cell"><div class="avatar" style="width:32px;height:32px;font-size:11px;background:${w.color};">${initials(w.name)}</div><div><b>${w.name}</b><small style="display:block;color:var(--ink-faint);font-weight:600;">${w.role}</small></div></div></td>
      <td>${r && r.checkIn ? r.checkIn : '—'}</td>
      <td>${r && r.checkOut ? r.checkOut : '—'}</td>
      <td><span class="badge badge-${badgeClass}"><span class="badge-dot"></span>${status[0].toUpperCase()+status.slice(1)}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          ${!r ? `<button class="btn btn-secondary btn-sm" onclick="checkIn('${w.id}')"><i class="ri-login-box-line"></i>Check In</button>
                  <button class="btn btn-ghost btn-sm" onclick="markAbsent('${w.id}')"><i class="ri-close-circle-line"></i>Absent</button>` : ''}
          ${r && r.checkIn && !r.checkOut ? `<button class="btn btn-secondary btn-sm" onclick="checkOut('${w.id}')"><i class="ri-logout-box-line"></i>Check Out</button>` : ''}
          ${r ? `<button class="icon-btn" style="width:32px;height:32px;" data-tip="Reset" onclick="resetMark('${w.id}')"><i class="ri-arrow-go-back-line"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:26px;">No workers match your filters</td></tr>`;
}

function ensureDay(dateStr){ if(!ATT_DATA[dateStr]) ATT_DATA[dateStr] = {}; }

function checkIn(workerId){
  ensureDay(selectedDate);
  const now = new Date();
  const time = fmtTime(now);
  const status = timeToMinutes(time) > LATE_CUTOFF_MIN ? 'late' : 'present';
  ATT_DATA[selectedDate][workerId] = { status, checkIn: time, checkOut: null };
  persistAttendance();
  const w = ATT_ROSTER.find(x=>x.id===workerId);
  NexusApp.toast(`${w.name} checked in — marked ${status}`, status==='late' ? 'warning' : 'success');
  renderAll();
}
function checkOut(workerId){
  ensureDay(selectedDate);
  const rec = ATT_DATA[selectedDate][workerId];
  if(!rec) return;
  rec.checkOut = fmtTime(new Date());
  persistAttendance();
  const w = ATT_ROSTER.find(x=>x.id===workerId);
  NexusApp.toast(`${w.name} checked out`, 'info');
  renderAll();
}
function markAbsent(workerId){
  ensureDay(selectedDate);
  ATT_DATA[selectedDate][workerId] = { status:'absent', checkIn:null, checkOut:null };
  persistAttendance();
  const w = ATT_ROSTER.find(x=>x.id===workerId);
  NexusApp.toast(`${w.name} marked absent`, 'error');
  renderAll();
}
function resetMark(workerId){
  ensureDay(selectedDate);
  delete ATT_DATA[selectedDate][workerId];
  persistAttendance();
  renderAll();
}

/* ---------------- DATE NAV ---------------- */
function changeDate(deltaDays){
  const d = new Date(selectedDate + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  selectedDate = fmtDate(d);
  renderAll();
}
function jumpToday(){ selectedDate = fmtDate(new Date()); renderAll(); }
function onDatePicked(val){ selectedDate = val; renderAll(); }

/* ---------------- CALENDAR ---------------- */
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();

function dayRate(dateStr){
  const rec = ATT_DATA[dateStr];
  if(!rec) return null;
  const total = ATT_ROSTER.length;
  const present = Object.values(rec).filter(r => r.status==='present' || r.status==='late').length;
  return Math.round(present/total*100);
}

function renderCalendar(){
  const first = new Date(calYear, calMonth, 1);
  const startWeekday = (first.getDay()+6)%7; // Monday=0
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  document.getElementById('calLabel').textContent = first.toLocaleDateString('en-GB',{ month:'long', year:'numeric' });

  let html = '';
  for(let i=0;i<startWeekday;i++) html += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rate = dayRate(dateStr);
    const sunday = isSunday(dateStr);
    const isSelected = dateStr === selectedDate;
    const isFuture = new Date(dateStr) > new Date(fmtDate(new Date()));
    let fill = 'cal-empty';
    if(sunday) fill = 'cal-off';
    else if(rate !== null){
      fill = rate >= 95 ? 'cal-r5' : rate >= 85 ? 'cal-r4' : rate >= 70 ? 'cal-r3' : rate >= 50 ? 'cal-r2' : 'cal-r1';
    }
    html += `<div class="cal-cell ${fill} ${isSelected?'selected':''}" data-tip="${sunday?'Weekly off':(rate!==null?rate+'% attendance':'No record')}" onclick="${isFuture?'':`onDatePicked('${dateStr}')`}">${day}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
}
function calPrevMonth(){ calMonth--; if(calMonth<0){calMonth=11; calYear--;} renderCalendar(); }
function calNextMonth(){ calMonth++; if(calMonth>11){calMonth=0; calYear++;} renderCalendar(); }

/* ---------------- CHARTS ---------------- */
let trendChartInstance = null, donutChartInstance = null;

function renderCharts(){
  // weekly trend: last 7 working days ending at selected date
  const labels = [], presentArr = [], lateArr = [], absentArr = [];
  let d = new Date(selectedDate + 'T00:00:00');
  const days = [];
  while(days.length < 7){
    if(d.getDay() !== 0) days.unshift(new Date(d));
    d.setDate(d.getDate()-1);
  }
  days.forEach(dt => {
    const key = fmtDate(dt);
    const rec = ATT_DATA[key] || {};
    labels.push(dt.toLocaleDateString('en-GB',{weekday:'short'}));
    let p=0,l=0,a=0;
    ATT_ROSTER.forEach(w=>{
      const r = rec[w.id];
      if(r && r.status==='present') p++; else if(r && r.status==='late') l++; else if(r && r.status==='absent') a++;
    });
    presentArr.push(p); lateArr.push(l); absentArr.push(a);
  });

  const trendCtx = document.getElementById('attTrendChart').getContext('2d');
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(trendCtx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Present', data:presentArr, backgroundColor:'#16A34A', borderRadius:6, stack:'s' },
      { label:'Late', data:lateArr, backgroundColor:'#F59E0B', borderRadius:6, stack:'s' },
      { label:'Absent', data:absentArr, backgroundColor:'#EF4444', borderRadius:6, stack:'s' },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
      scales:{ x:{ stacked:true, grid:{display:false}, border:{display:false} }, y:{ stacked:true, grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false}, ticks:{ stepSize:2 } } }
    }
  });

  const records = getDayRecords(selectedDate);
  let p=0,l=0,a=0,u=0;
  ATT_ROSTER.forEach(w=>{ const r=records[w.id]; if(!r) u++; else if(r.status==='present') p++; else if(r.status==='late') l++; else a++; });

  const donutCtx = document.getElementById('attDonutChart').getContext('2d');
  if(donutChartInstance) donutChartInstance.destroy();
  donutChartInstance = new Chart(donutCtx, {
    type:'doughnut',
    data:{ labels:['Present','Late','Absent','Unmarked'], datasets:[{ data:[p,l,a,u], backgroundColor:['#16A34A','#F59E0B','#EF4444','#E5E7EB'], borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'72%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', padding:12, font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } } }
  });
}

/* ---------------- EXPORT ---------------- */
function exportAttendanceCSV(){
  const records = getDayRecords(selectedDate);
  const rows = [['Worker ID','Name','Role','Status','Check In','Check Out']];
  ATT_ROSTER.forEach(w => {
    const r = records[w.id];
    rows.push([w.id, w.name, w.role, r?r.status:'unmarked', r&&r.checkIn?r.checkIn:'', r&&r.checkOut?r.checkOut:'']);
  });
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `attendance-${selectedDate}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Attendance report exported', 'success');
}

/* ---------------- WIRES ---------------- */
function wireToolbar(){
  document.getElementById('attSearch').addEventListener('input', e => { attFilters.search = e.target.value.trim().toLowerCase(); renderDailyList(); });
  document.getElementById('attStatusFilter').addEventListener('change', e => { attFilters.status = e.target.value; renderDailyList(); });
  document.getElementById('datePicker').addEventListener('change', e => onDatePicked(e.target.value));
}

function renderAll(){
  renderDateHeader();
  renderKPIs();
  renderDailyList();
  renderCalendar();
  renderCharts();
}

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('attendance.html', session);
  loadAttendance();

  const d = new Date(selectedDate+'T00:00:00');
  calMonth = d.getMonth(); calYear = d.getFullYear();

  wireToolbar();
  renderAll();
});
