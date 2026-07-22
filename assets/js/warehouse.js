/* ============================================================
   NEXUS OPERATIONS OS — Warehouse module
============================================================ */

const WH_MODELS = ['Vivo Y18','Vivo Y28','Vivo V30','Vivo Y36','Vivo X100','Vivo Y17s'];

let STOCK = [];
let SHIPMENTS = [];

function loadStock(){
  const saved = localStorage.getItem('nexus_warehouse_stock');
  if(saved){ STOCK = JSON.parse(saved); return; }
  STOCK = WH_MODELS.map(model => {
    const inStock = 40 + Math.floor(Math.random()*260);
    const threshold = 80;
    return { model, inStock, incoming: Math.floor(Math.random()*80), outgoing: Math.floor(Math.random()*60), threshold };
  });
  persistStock();
}
function persistStock(){ localStorage.setItem('nexus_warehouse_stock', JSON.stringify(STOCK)); }

function loadShipments(){
  const saved = localStorage.getItem('nexus_warehouse_shipments');
  if(saved){ SHIPMENTS = JSON.parse(saved); return; }
  SHIPMENTS = [];
  const now = Date.now();
  for(let i=0;i<14;i++){
    const type = Math.random()>0.5 ? 'Incoming' : 'Outgoing';
    SHIPMENTS.push({
      id:'SH-'+(5001+i), type, model: WH_MODELS[i % WH_MODELS.length],
      qty: 20+Math.floor(Math.random()*120),
      ref: type==='Incoming' ? 'BX-'+(1030+i) : 'ORD-'+(7700+i),
      date: new Date(now - i*20*3600000).toISOString(),
      status: i<3 ? 'Pending' : 'Completed',
    });
  }
  SHIPMENTS.sort((a,b)=> new Date(b.date)-new Date(a.date));
  persistShipments();
}
function persistShipments(){ localStorage.setItem('nexus_warehouse_shipments', JSON.stringify(SHIPMENTS)); }

function fmtDate(iso){ return new Date(iso).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
function stockStatus(item){
  if(item.inStock <= item.threshold*0.5) return 'critical';
  if(item.inStock <= item.threshold) return 'low';
  return 'healthy';
}
function scanReadyCount(){
  const saved = localStorage.getItem('nexus_scan_lists');
  if(!saved) return 0;
  try{ return JSON.parse(saved).reduce((s,l)=>s+l.items.length,0); }catch(e){ return 0; }
}

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const totalStock = STOCK.reduce((s,i)=>s+i.inStock,0);
  const incomingWeek = SHIPMENTS.filter(s=>s.type==='Incoming' && withinDays(s.date,7)).reduce((s,i)=>s+i.qty,0);
  const outgoingWeek = SHIPMENTS.filter(s=>s.type==='Outgoing' && withinDays(s.date,7)).reduce((s,i)=>s+i.qty,0);
  const lowStockCount = STOCK.filter(i=>stockStatus(i)!=='healthy').length;

  document.getElementById('kpiTotalStock').textContent = totalStock.toLocaleString();
  document.getElementById('kpiIncoming').textContent = incomingWeek.toLocaleString();
  document.getElementById('kpiOutgoing').textContent = outgoingWeek.toLocaleString();
  document.getElementById('kpiLowStock').textContent = lowStockCount;
  document.getElementById('kpiScanReady').textContent = scanReadyCount().toLocaleString();
}
function withinDays(iso, days){ return (Date.now() - new Date(iso).getTime()) <= days*86400000; }

/* ---------------- CHARTS ---------------- */
let chart1 = null, chart2 = null;
function renderCharts(){
  if(chart1) chart1.destroy();
  if(chart2) chart2.destroy();

  chart1 = new Chart(document.getElementById('stockChart').getContext('2d'), {
    type:'bar',
    data:{ labels: STOCK.map(s=>s.model), datasets:[
      { label:'In stock', data: STOCK.map(s=>s.inStock), backgroundColor:'#6D5DF6', borderRadius:8 },
      { label:'Reorder threshold', data: STOCK.map(s=>s.threshold), type:'line', borderColor:'#EF4444', borderDash:[5,4], pointRadius:0, borderWidth:2 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
      scales:{ x:{ grid:{display:false}, border:{display:false} }, y:{ grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false} } } }
  });

  const days = [];
  for(let i=13;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); days.push(d); }
  const incomingArr = days.map(d => SHIPMENTS.filter(s=>s.type==='Incoming' && new Date(s.date).toDateString()===d.toDateString()).reduce((s,i)=>s+i.qty,0));
  const outgoingArr = days.map(d => SHIPMENTS.filter(s=>s.type==='Outgoing' && new Date(s.date).toDateString()===d.toDateString()).reduce((s,i)=>s+i.qty,0));

  chart2 = new Chart(document.getElementById('flowChart').getContext('2d'), {
    type:'line',
    data:{ labels: days.map(d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})), datasets:[
      { label:'Incoming', data:incomingArr, borderColor:'#16A34A', backgroundColor:'rgba(22,163,74,0.12)', fill:true, tension:.4, pointRadius:0, borderWidth:2.5 },
      { label:'Outgoing', data:outgoingArr, borderColor:'#F59E0B', backgroundColor:'rgba(245,158,11,0.1)', fill:true, tension:.4, pointRadius:0, borderWidth:2.5 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle', font:{size:11,weight:600} } }, tooltip:{ backgroundColor:'#14162B', padding:10, cornerRadius:10 } },
      scales:{ x:{ grid:{display:false}, border:{display:false} }, y:{ grid:{ color:'rgba(20,22,43,0.06)' }, border:{display:false} } } }
  });
}

/* ---------------- STOCK TABLE ---------------- */
function renderStockTable(){
  const STATUS_BADGE = { healthy:'success', low:'warning', critical:'danger' };
  const STATUS_LABEL = { healthy:'Healthy', low:'Low', critical:'Critical' };
  document.getElementById('stockTableBody').innerHTML = STOCK.map(item => {
    const status = stockStatus(item);
    const pct = Math.min(100, Math.round(item.inStock / (item.threshold*2) * 100));
    return `
    <tr>
      <td style="font-weight:700;">${item.model}</td>
      <td>${item.inStock} units</td>
      <td style="color:var(--success);">+${item.incoming}</td>
      <td style="color:var(--danger);">-${item.outgoing}</td>
      <td style="width:140px;"><div class="progress-track"><div class="progress-fill" style="width:${pct}%; background:${status==='critical'?'#EF4444':status==='low'?'#F59E0B':'#16A34A'};"></div></div></td>
      <td><span class="badge badge-${STATUS_BADGE[status]}"><span class="badge-dot"></span>${STATUS_LABEL[status]}</span></td>
    </tr>`;
  }).join('');
}

/* ---------------- SHIPMENTS ---------------- */
let activeTab = 'all';
function setShipmentTab(tab){
  activeTab = tab;
  document.querySelectorAll('.ship-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  renderShipments();
}
function renderShipments(){
  let items = SHIPMENTS;
  if(activeTab !== 'all') items = items.filter(s => s.type.toLowerCase() === activeTab);

  document.getElementById('shipmentsBody').innerHTML = items.map(s => `
    <tr>
      <td><span class="badge badge-${s.type==='Incoming'?'success':'info'}">${s.type}</span></td>
      <td style="font-weight:700;">${s.ref}</td>
      <td>${s.model}</td>
      <td>${s.qty} units</td>
      <td>${fmtDate(s.date)}</td>
      <td><span class="badge badge-${s.status==='Pending'?'warning':'neutral'}">${s.status}</span></td>
      <td>${s.status==='Pending' ? `<button class="btn btn-secondary btn-sm" onclick="completeShipment('${s.id}')"><i class="ri-check-line"></i>Mark received</button>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:24px;">No shipments in this view</td></tr>`;
}
function completeShipment(id){
  const s = SHIPMENTS.find(x=>x.id===id);
  if(!s) return;
  s.status = 'Completed';
  const stockItem = STOCK.find(x=>x.model===s.model);
  if(stockItem){
    if(s.type==='Incoming') stockItem.inStock += s.qty;
    else stockItem.inStock = Math.max(0, stockItem.inStock - s.qty);
  }
  persistShipments();
  persistStock();
  renderShipments();
  renderStockTable();
  renderKPIs();
  renderCharts();
  NexusApp.toast(`${s.ref} marked received — stock updated`, 'success');
}

/* ---------------- NEW SHIPMENT MODAL ---------------- */
function openNewShipmentModal(){ NexusApp.openModal('modal-newshipment'); }
function submitNewShipment(e){
  e.preventDefault();
  const type = document.getElementById('ns-type').value;
  const model = document.getElementById('ns-model').value;
  const qty = parseInt(document.getElementById('ns-qty').value, 10);
  const ref = document.getElementById('ns-ref').value.trim();
  if(!qty || qty < 1){ NexusApp.toast('Enter a valid quantity', 'error'); return; }

  const shipment = {
    id:'SH-'+(5001+SHIPMENTS.length+Math.floor(Math.random()*90)),
    type, model, qty, ref: ref || (type==='Incoming'?'BX-NEW':'ORD-NEW'),
    date:new Date().toISOString(), status:'Pending',
  };
  SHIPMENTS.unshift(shipment);
  persistShipments();
  NexusApp.closeModal('modal-newshipment');
  renderShipments();
  renderKPIs();
  e.target.reset();
  NexusApp.toast('Shipment ' + shipment.id + ' logged', 'success');
}

/* ---------------- EXPORT ---------------- */
function exportStockXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load', 'error'); return; }
  const rows = STOCK.map(s => ({ Model:s.model, 'In Stock':s.inStock, Incoming:s.incoming, Outgoing:s.outgoing, Status: stockStatus(s) }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Levels');
  XLSX.writeFile(wb, 'nexus-warehouse-stock.xlsx');
  NexusApp.toast('Stock levels exported', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('warehouse.html', session);
  loadStock();
  loadShipments();
  document.querySelectorAll('.ship-tab').forEach(t => t.addEventListener('click', () => setShipmentTab(t.dataset.tab)));
  renderKPIs();
  renderCharts();
  renderStockTable();
  renderShipments();
});
