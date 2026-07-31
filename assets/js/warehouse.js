/* ============================================================
   SAGERO CREATIONS — Warehouse module
============================================================ */

const WH_MODELS = ['Y17s','Y18','Y18t','Y28','Y36','Y50t','Y100','Y200','Y300','Y300 Plus','V30','V40','V50','V50 Pro','V50 Lite','V70','V70 Elite','X100','X200','X200 Ultra','X300','X300 Pro','X300 Ultra','T3','T4'];

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
function persistShipments(){ localStorage.setItem('nexus_warehouse_shipments', JSON.stringify(SHIPMENTS)); }

/* ============================================================
   BACKEND MODE — real, shared warehouse (see backend_schema_phase3.sql)
============================================================ */
let whRealtimeChannel = null;

async function loadStockFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('warehouse_stock').select('*').order('model');
  if(error){ NexusApp.toast('Could not load stock: ' + error.message, 'error'); STOCK = []; return; }
  STOCK = (data || []).map(row => ({ model: row.model, inStock: row.in_stock, threshold: row.reorder_threshold, incoming: 0, outgoing: 0 }));
}
async function loadShipmentsFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('warehouse_shipments').select('*').order('created_at', { ascending:false });
  if(error){ NexusApp.toast('Could not load shipments: ' + error.message, 'error'); SHIPMENTS = []; return; }
  SHIPMENTS = (data || []).map(row => ({ id: row.id, type: row.type, model: row.model, qty: row.qty, ref: row.reference, date: row.created_at, status: row.status }));
}
function recomputePendingPerModel(){
  STOCK.forEach(item => {
    item.incoming = SHIPMENTS.filter(s => s.model===item.model && s.type==='Incoming' && s.status==='Pending').reduce((s,x)=>s+x.qty,0);
    item.outgoing = SHIPMENTS.filter(s => s.model===item.model && s.type==='Outgoing' && s.status==='Pending').reduce((s,x)=>s+x.qty,0);
  });
}
function subscribeWarehouseRealtime(sb){
  if(whRealtimeChannel) sb.removeChannel(whRealtimeChannel);
  whRealtimeChannel = sb.channel('sagero-warehouse')
    .on('postgres_changes', { event:'*', schema:'public', table:'warehouse_stock' }, async () => {
      await loadStockFromBackend(); recomputePendingPerModel(); renderStockTable(); renderKPIs(); renderCharts();
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'warehouse_shipments' }, async () => {
      await loadShipmentsFromBackend(); recomputePendingPerModel(); renderStockTable(); renderShipments(); renderKPIs(); renderCharts();
    })
    .subscribe();
}

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
async function completeShipment(id){
  const s = SHIPMENTS.find(x=>x.id===id);
  if(!s) return;
  s.status = 'Completed';
  const stockItem = STOCK.find(x=>x.model===s.model);
  if(stockItem){
    if(s.type==='Incoming') stockItem.inStock += s.qty;
    else stockItem.inStock = Math.max(0, stockItem.inStock - s.qty);
  }
  recomputePendingPerModel();
  renderShipments();
  renderStockTable();
  renderKPIs();
  renderCharts();
  NexusApp.toast(`${s.ref} marked received — stock updated`, 'success');

  if(SagoBackend?.isConfigured()){
    const sb = SagoBackend.getClient();
    const { error: e1 } = await sb.from('warehouse_shipments').update({ status:'Completed' }).eq('id', id);
    const { error: e2 } = await sb.from('warehouse_stock').update({ in_stock: stockItem.inStock, updated_at: new Date().toISOString() }).eq('model', s.model);
    if(e1 || e2) NexusApp.toast('Could not save on server: ' + (e1?.message || e2?.message), 'error');
  } else {
    persistShipments();
    persistStock();
  }
}

/* ---------------- NEW SHIPMENT MODAL ---------------- */
function openNewShipmentModal(){ NexusApp.openModal('modal-newshipment'); }
async function submitNewShipment(e){
  e.preventDefault();
  const type = document.getElementById('ns-type').value;
  const model = document.getElementById('ns-model').value;
  const qty = parseInt(document.getElementById('ns-qty').value, 10);
  const ref = document.getElementById('ns-ref').value.trim();
  if(!qty || qty < 1){ NexusApp.toast('Enter a valid quantity', 'error'); return; }
  const reference = ref || (type==='Incoming'?'BX-NEW':'ORD-NEW');

  if(SagoBackend?.isConfigured()){
    const sb = SagoBackend.getClient();
    const session = await SagoBackend.getSession();
    const { data, error } = await sb.from('warehouse_shipments').insert({
      type, model, qty, reference, status:'Pending', created_by: session?.user?.id || null,
    }).select().single();
    if(error){ NexusApp.toast('Could not log shipment: ' + error.message, 'error'); return; }
    SHIPMENTS.unshift({ id:data.id, type:data.type, model:data.model, qty:data.qty, ref:data.reference, date:data.created_at, status:data.status });
    recomputePendingPerModel();
    NexusApp.closeModal('modal-newshipment');
    renderShipments();
    renderStockTable();
    renderKPIs();
    e.target.reset();
    NexusApp.toast('Shipment logged', 'success');
    return;
  }

  const shipment = {
    id:'SH-'+(5001+SHIPMENTS.length+Math.floor(Math.random()*90)),
    type, model, qty, ref: reference,
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
  XLSX.writeFile(wb, 'sagero-warehouse-stock.xlsx');
  NexusApp.toast('Stock levels exported', 'success');
}

let whDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(whDidInit) return;
  whDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('warehouse.html', session);

  if(SagoBackend?.isConfigured()){
    await loadStockFromBackend();
    await loadShipmentsFromBackend();
    recomputePendingPerModel();
    subscribeWarehouseRealtime(SagoBackend.getClient());
  } else {
    loadStock();
    loadShipments();
  }

  document.querySelectorAll('.ship-tab').forEach(t => t.addEventListener('click', () => setShipmentTab(t.dataset.tab)));
  renderKPIs();
  renderCharts();
  renderStockTable();
  renderShipments();
});
