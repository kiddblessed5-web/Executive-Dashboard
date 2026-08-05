/* ============================================================
   SAGERO CREATIONS — Orders module
   Tracks customer orders. Designed so a future storefront website
   can insert real orders directly into the same `orders` table
   (see backend_schema_orders.sql) — this page shows both orders
   you add manually now and real ones once that website exists.
============================================================ */

let ORDERS = [];
let ordersRealtimeChannel = null;

function fmtDateTime(iso){ return new Date(iso).toLocaleString('en-GB',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
function money(n){ return 'KES ' + Math.round(n).toLocaleString(); }

function seedDemoOrders(){
  const now = Date.now();
  return [
    { id:'ORD-7001', customer_name:'James Mwangi', customer_phone:'0712345678', customer_email:'', items:[{name:'Vivo Y18',qty:1,unit_price:15000}], total:15000, status:'Delivered', payment_status:'Paid', payment_method:'M-Pesa', source:'Manual', notes:'', created_at:new Date(now-2*86400000).toISOString() },
    { id:'ORD-7002', customer_name:'Faith Wanjiru', customer_phone:'0722334455', customer_email:'', items:[{name:'Phone Case',qty:2,unit_price:500}], total:1000, status:'Processing', payment_status:'Paid', payment_method:'Cash', source:'Manual', notes:'', created_at:new Date(now-3600000).toISOString() },
    { id:'ORD-7003', customer_name:'Brian Otieno', customer_phone:'0733445566', customer_email:'', items:[{name:'Vivo X300',qty:1,unit_price:65000}], total:65000, status:'Pending', payment_status:'Unpaid', payment_method:'', source:'Manual', notes:'Awaiting payment confirmation', created_at:new Date(now-600000).toISOString() },
  ];
}

/* ---------------- BACKEND ---------------- */
async function loadOrdersFromBackend(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending:false });
  if(error){ NexusApp.toast('Could not load orders: ' + error.message, 'error'); ORDERS = []; return; }
  ORDERS = data || [];
}
function subscribeOrdersRealtime(sb){
  if(ordersRealtimeChannel) sb.removeChannel(ordersRealtimeChannel);
  const refresh = NexusApp.debounce(async () => { await loadOrdersFromBackend(); renderAll(); }, 400);
  ordersRealtimeChannel = sb.channel('sagero-orders')
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, () => refresh())
    .subscribe();
}

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const total = ORDERS.length;
  const pending = ORDERS.filter(o=>o.status==='Pending').length;
  const thisMonth = ORDERS.filter(o => new Date(o.created_at).getMonth() === new Date().getMonth() && new Date(o.created_at).getFullYear() === new Date().getFullYear());
  const revenueThisMonth = thisMonth.filter(o=>o.payment_status==='Paid').reduce((s,o)=>s+Number(o.total),0);
  const avgOrder = total ? Math.round(ORDERS.reduce((s,o)=>s+Number(o.total),0) / total) : 0;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiPending').textContent = pending;
  document.getElementById('kpiRevenue').textContent = money(revenueThisMonth);
  document.getElementById('kpiAvg').textContent = money(avgOrder);
}

/* ---------------- FILTERS + LIST ---------------- */
let filters = { search:'', status:'all' };

function getFiltered(){
  return ORDERS.filter(o => {
    if(filters.status !== 'all' && o.status !== filters.status) return false;
    if(filters.search){
      const q = filters.search;
      if(!(o.customer_name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || (o.customer_phone||'').includes(q))) return false;
    }
    return true;
  });
}

const STATUS_BADGE = { Pending:'warning', Processing:'info', Shipped:'primary', Delivered:'success', Cancelled:'danger' };
const PAY_BADGE = { Unpaid:'warning', Paid:'success', Refunded:'danger' };

function renderTable(){
  const items = getFiltered();
  document.getElementById('orderCount').textContent = items.length + ' order' + (items.length===1?'':'s');
  document.getElementById('ordersTableBody').innerHTML = items.map(o => `
    <tr onclick="openOrderDrawer('${o.id}')" style="cursor:pointer;">
      <td style="font-weight:700;">${o.id}${o.source==='Website'?' <span class="badge badge-info" style="font-size:9px;">Website</span>':''}</td>
      <td>${o.customer_name}<br><small style="color:var(--ink-faint);">${o.customer_phone||''}</small></td>
      <td>${(o.items||[]).map(i=>`${i.qty}× ${i.name}`).join(', ')}</td>
      <td style="font-weight:700;">${money(o.total)}</td>
      <td><span class="badge badge-${STATUS_BADGE[o.status]}"><span class="badge-dot"></span>${o.status}</span></td>
      <td><span class="badge badge-${PAY_BADGE[o.payment_status]}">${o.payment_status}</span></td>
      <td>${fmtDateTime(o.created_at)}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:26px;">No orders match your filters</td></tr>`;
}

function renderAll(){ renderKPIs(); renderTable(); }

/* ---------------- NEW ORDER ---------------- */
let orderItemRows = [{ name:'', qty:1, unit_price:0 }];
function openNewOrderModal(){
  orderItemRows = [{ name:'', qty:1, unit_price:0 }];
  renderOrderItemRows();
  NexusApp.openModal('modal-neworder');
}
function renderOrderItemRows(){
  document.getElementById('orderItemsWrap').innerHTML = orderItemRows.map((row,i) => `
    <div class="order-item-row">
      <input type="text" placeholder="Item name" value="${row.name}" oninput="orderItemRows[${i}].name=this.value">
      <input type="number" placeholder="Qty" min="1" value="${row.qty}" oninput="orderItemRows[${i}].qty=parseInt(this.value)||1; updateOrderTotal();">
      <input type="number" placeholder="Unit price" min="0" value="${row.unit_price}" oninput="orderItemRows[${i}].unit_price=parseFloat(this.value)||0; updateOrderTotal();">
      <button type="button" class="icon-btn" style="width:30px;height:30px;" onclick="removeOrderItemRow(${i})"><i class="ri-close-line"></i></button>
    </div>`).join('');
  updateOrderTotal();
}
function addOrderItemRow(){ orderItemRows.push({ name:'', qty:1, unit_price:0 }); renderOrderItemRows(); }
function removeOrderItemRow(i){ if(orderItemRows.length>1){ orderItemRows.splice(i,1); renderOrderItemRows(); } }
function updateOrderTotal(){
  const total = orderItemRows.reduce((s,r)=>s + (r.qty*r.unit_price), 0);
  document.getElementById('no-total-display').textContent = money(total);
}

async function submitNewOrder(e){
  e.preventDefault();
  const customer_name = document.getElementById('no-name').value.trim();
  const customer_phone = document.getElementById('no-phone').value.trim();
  const payment_method = document.getElementById('no-payment').value;
  const payment_status = document.getElementById('no-paid').checked ? 'Paid' : 'Unpaid';
  if(!customer_name){ NexusApp.toast('Enter a customer name', 'error'); return; }
  const items = orderItemRows.filter(r=>r.name.trim());
  if(items.length === 0){ NexusApp.toast('Add at least one item', 'error'); return; }
  const total = items.reduce((s,r)=>s + (r.qty*r.unit_price), 0);
  const id = 'ORD-' + (7001 + ORDERS.length + Math.floor(Math.random()*90));

  const record = { id, customer_name, customer_phone: customer_phone||null, items, total, status:'Pending', payment_status, payment_method: payment_method||null, source:'Manual', notes:'' };

  if(SagoBackend?.isConfigured()){
    const { error } = await SagoBackend.getClient().from('orders').insert(record);
    if(error){ NexusApp.toast('Could not create order: ' + error.message, 'error'); return; }
    ORDERS.unshift({ ...record, created_at: new Date().toISOString() });
  } else {
    ORDERS.unshift({ ...record, created_at: new Date().toISOString() });
  }

  NexusApp.closeModal('modal-neworder');
  renderAll();
  NexusApp.toast('Order ' + id + ' created', 'success');
  NexusApp.logAudit('Orders', `Order ${id} created for ${customer_name} — ${money(total)}`);
  e.target.reset();
}

/* ---------------- ORDER DETAIL DRAWER ---------------- */
function openOrderDrawer(id){
  const o = ORDERS.find(x=>x.id===id);
  if(!o) return;
  window.currentOrderId = id;
  document.getElementById('odId').textContent = o.id;
  document.getElementById('odCustomer').textContent = o.customer_name;
  document.getElementById('odMeta').textContent = `${o.customer_phone||'No phone'} · Placed ${fmtDateTime(o.created_at)}${o.source==='Website'?' · From website':''}`;
  document.getElementById('odItems').innerHTML = (o.items||[]).map(i=>`<div class="od-item-row"><span>${i.qty}× ${i.name}</span><b>${money(i.qty*i.unit_price)}</b></div>`).join('');
  document.getElementById('odTotal').textContent = money(o.total);
  document.getElementById('odStatus').value = o.status;
  document.getElementById('odPayStatus').value = o.payment_status;
  document.getElementById('odNotes').value = o.notes || '';
  NexusApp.openDrawer('orderDrawer');
}
async function saveOrderChanges(){
  const o = ORDERS.find(x=>x.id===window.currentOrderId);
  if(!o) return;
  const status = document.getElementById('odStatus').value;
  const payment_status = document.getElementById('odPayStatus').value;
  const notes = document.getElementById('odNotes').value;
  o.status = status; o.payment_status = payment_status; o.notes = notes;
  renderAll();
  NexusApp.toast('Order updated', 'success');
  NexusApp.logAudit('Orders', `Order ${o.id} updated — status: ${status}, payment: ${payment_status}`);

  if(SagoBackend?.isConfigured()){
    const { error } = await SagoBackend.getClient().from('orders').update({ status, payment_status, notes }).eq('id', o.id);
    if(error) NexusApp.toast('Could not save on server: ' + error.message, 'error');
  }
}

/* ---------------- EXPORT ---------------- */
function exportOrdersCSV(){
  const rows = [['Order ID','Customer','Phone','Items','Total','Status','Payment','Placed']];
  getFiltered().forEach(o => rows.push([o.id, o.customer_name, o.customer_phone||'', (o.items||[]).map(i=>`${i.qty}x ${i.name}`).join('; '), o.total, o.status, o.payment_status, fmtDateTime(o.created_at)]));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sagero-orders.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Orders exported', 'success');
}
function exportOrdersXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load — try CSV', 'error'); return; }
  const rows = getFiltered().map(o => ({
    'Order ID':o.id, Customer:o.customer_name, Phone:o.customer_phone||'', Items:(o.items||[]).map(i=>`${i.qty}x ${i.name}`).join('; '),
    Total:o.total, Status:o.status, Payment:o.payment_status, Placed:fmtDateTime(o.created_at),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, 'sagero-orders.xlsx');
  NexusApp.toast('Orders exported as Excel workbook', 'success');
}

/* ---------------- WIRES ---------------- */
function wireToolbar(){
  document.getElementById('orderSearch').addEventListener('input', e => { filters.search = e.target.value.trim().toLowerCase(); renderTable(); });
  document.getElementById('filterStatus').addEventListener('change', e => { filters.status = e.target.value; renderTable(); });
}

let ordersDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(ordersDidInit) return;
  ordersDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('orders.html', session);

  if(SagoBackend?.isConfigured()){
    await loadOrdersFromBackend();
    subscribeOrdersRealtime(SagoBackend.getClient());
  } else {
    ORDERS = seedDemoOrders();
  }

  wireToolbar();
  renderAll();
});
