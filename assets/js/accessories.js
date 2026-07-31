/* ============================================================
   SAGERO CREATIONS — Accessories Inventory module
   Barcode/QR scan-in station for phone accessories (cases,
   chargers, cables, earphones, etc.) — mirrors the Devices page's
   scan-in pattern. Backend-wired via inventory_scan_lists /
   inventory_scan_items (kind='accessory') — see backend_schema_phase4.sql.
============================================================ */

const ACC_CATEGORIES = ['Phone Case','Screen Protector','Charger','Charging Cable','Earphones','Power Bank','Memory Card','Bluetooth Speaker','Phone Stand','Other'];

/* ---------------- STATE ---------------- */
let accSessionScans = [];
let ACC_SAVED_LISTS = [];
let accCameraStream = null;
let accCameraDetectLoop = null;

function accPersistSession(){ localStorage.setItem('sagero_acc_scan_session', JSON.stringify(accSessionScans)); }
function accPersistLists(){ localStorage.setItem('sagero_acc_scan_lists', JSON.stringify(ACC_SAVED_LISTS)); }

function accSeedSavedLists(){
  const now = Date.now();
  function mockItems(name, count, hoursAgo){
    return Array.from({length:count}, (_,i) => ({
      barcode: '77' + String(1000000000000 + Math.floor(Math.random()*8999999999999)).slice(0,13),
      item: name, scannedAt: new Date(now - hoursAgo*3600000 - i*4000).toISOString()
    }));
  }
  return [
    { id:'acclist1', name:'Silicone Cases intake', category:'Phone Case', batchRef:null, createdAt: new Date(now-2*86400000).toISOString(), items: mockItems('Silicone Case - Black', 30, 40) },
    { id:'acclist2', name:'20W Chargers intake', category:'Charger', batchRef:null, createdAt: new Date(now-86400000).toISOString(), items: mockItems('20W USB-C Charger', 15, 20) },
  ];
}

/* ---------------- BACKEND ---------------- */
async function accLoadListsFromBackend(){
  const sb = SagoBackend.getClient();
  const { data: lists, error } = await sb.from('inventory_scan_lists').select('*').eq('kind','accessory').order('created_at', { ascending:false });
  if(error){ NexusApp.toast('Could not load saved lists: ' + error.message, 'error'); ACC_SAVED_LISTS = []; return; }
  ACC_SAVED_LISTS = [];
  for(const l of (lists || [])){
    const { data: items } = await sb.from('inventory_scan_items').select('*').eq('list_id', l.id);
    ACC_SAVED_LISTS.push({
      id: l.id, name: l.name, category: l.model_or_category, batchRef: l.batch_ref, createdAt: l.created_at,
      items: (items || []).map(i => ({ barcode: i.barcode, item: i.label, scannedAt: i.scanned_at })),
    });
  }
}

/* ---------------- HELPERS ---------------- */
function accFmtDateTime(iso){ return new Date(iso).toLocaleString('en-GB',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
function accFmtDate(iso){ return new Date(iso).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
function accIsToday(iso){ return new Date(iso).toDateString() === new Date().toDateString(); }
function accTotalAllTime(){ return ACC_SAVED_LISTS.reduce((s,l)=>s+l.items.length,0) + accSessionScans.length; }
function accTotalToday(){
  const fromLists = ACC_SAVED_LISTS.reduce((s,l)=> s + l.items.filter(i=>accIsToday(i.scannedAt)).length, 0);
  const fromSession = accSessionScans.filter(i=>accIsToday(i.scannedAt)).length;
  return fromLists + fromSession;
}

/* ---------------- KPIs ---------------- */
function accRenderKPIs(){
  document.getElementById('accKpiTotal').textContent = accTotalAllTime().toLocaleString();
  document.getElementById('accKpiToday').textContent = accTotalToday();
  document.getElementById('accKpiCategories').textContent = ACC_CATEGORIES.length;
  document.getElementById('accKpiLists').textContent = ACC_SAVED_LISTS.length;
}

/* ---------------- SCAN INPUT ---------------- */
function accAddScan(barcode){
  barcode = barcode.trim();
  if(!barcode) return;
  const itemName = document.getElementById('accItemName').value.trim();
  if(!itemName){ NexusApp.toast('Enter what this item is before scanning', 'error'); accFlashScanInput(false); return; }

  const dupeInSession = accSessionScans.some(s => s.barcode === barcode);
  const dupeInLists = ACC_SAVED_LISTS.some(l => l.items.some(i => i.barcode === barcode));
  if(dupeInSession || dupeInLists){
    NexusApp.toast('Barcode ' + barcode + ' has already been scanned', 'error');
    accFlashScanInput(false);
    return;
  }

  accSessionScans.unshift({ barcode, item: itemName, scannedAt: new Date().toISOString() });
  accPersistSession();
  accRenderSessionTable();
  accRenderKPIs();
  accFlashScanInput(true);
}
function accFlashScanInput(success){
  const el = document.getElementById('accScanInput');
  el.classList.remove('flash-success','flash-error');
  void el.offsetWidth;
  el.classList.add(success ? 'flash-success' : 'flash-error');
}
function accWireScanInput(){
  const input = document.getElementById('accScanInput');
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); accAddScan(input.value); input.value = ''; }
  });
  input.focus();
  document.getElementById('accAddScanBtn').addEventListener('click', () => { accAddScan(input.value); input.value = ''; input.focus(); });
}

/* ---------------- CAMERA SCANNING ---------------- */
function accCameraSupported(){ return 'mediaDevices' in navigator && 'BarcodeDetector' in window; }
async function accStartCameraScan(){
  if(!accCameraSupported()){ NexusApp.toast('Camera barcode scanning isn\u2019t supported in this browser — use the scan input below instead', 'error'); return; }
  try{
    accCameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    const video = document.getElementById('accCameraPreview');
    video.srcObject = accCameraStream;
    await video.play();
    document.getElementById('accCameraWrap').style.display = 'block';
    document.getElementById('accStartCameraBtn').style.display = 'none';
    document.getElementById('accStopCameraBtn').style.display = 'inline-flex';

    const detector = new window.BarcodeDetector({ formats:['ean_13','code_128','upc_a','qr_code'] });
    accCameraDetectLoop = setInterval(async () => {
      try{ const codes = await detector.detect(video); if(codes.length) accAddScan(codes[0].rawValue); }
      catch(err){ /* expected intermittent detection frame errors */ }
    }, 600);
  }catch(err){ NexusApp.toast('Could not access camera — check permissions', 'error'); }
}
function accStopCameraScan(){
  if(accCameraDetectLoop) clearInterval(accCameraDetectLoop);
  if(accCameraStream) accCameraStream.getTracks().forEach(t => t.stop());
  accCameraStream = null;
  document.getElementById('accCameraWrap').style.display = 'none';
  document.getElementById('accStartCameraBtn').style.display = 'inline-flex';
  document.getElementById('accStopCameraBtn').style.display = 'none';
}

/* ---------------- SESSION TABLE ---------------- */
function accRenderSessionTable(){
  document.getElementById('accSessionCount').textContent = accSessionScans.length + ' scanned this session';
  const tbody = document.getElementById('accSessionTableBody');
  tbody.innerHTML = accSessionScans.map((s,i) => `
    <tr>
      <td><code class="barcode-code">${s.barcode}</code></td>
      <td>${s.item}</td>
      <td>${accFmtDateTime(s.scannedAt)}</td>
      <td><button class="icon-btn" style="width:30px;height:30px;" data-tip="Remove" onclick="accRemoveScan(${i})"><i class="ri-close-line"></i></button></td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:22px;">No accessories scanned yet — start scanning below.</td></tr>`;

  document.getElementById('accSaveSessionBtn').disabled = accSessionScans.length === 0;
  document.getElementById('accClearSessionBtn').disabled = accSessionScans.length === 0;
}
function accRemoveScan(index){
  accSessionScans.splice(index,1);
  accPersistSession();
  accRenderSessionTable();
  accRenderKPIs();
}
function accClearSession(){
  if(accSessionScans.length === 0) return;
  accSessionScans = [];
  accPersistSession();
  accRenderSessionTable();
  accRenderKPIs();
  NexusApp.toast('Session cleared', 'info');
}

/* ---------------- SAVE SESSION ---------------- */
function accOpenSaveModal(){
  if(accSessionScans.length === 0) return;
  const cat = document.getElementById('accCategory').value;
  document.getElementById('acc-sv-name').value = cat + ' intake — ' + new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  document.getElementById('acc-sv-count').textContent = accSessionScans.length + ' item' + (accSessionScans.length===1?'':'s') + ' will be saved to this list';
  NexusApp.openModal('modal-acc-savesession');
}
async function accSubmitSaveSession(e){
  e.preventDefault();
  const name = document.getElementById('acc-sv-name').value.trim();
  const batchRef = document.getElementById('acc-sv-batchref').value.trim();
  if(!name){ NexusApp.toast('Give this list a name', 'error'); return; }
  const category = document.getElementById('accCategory').value;
  const scans = [...accSessionScans];

  if(SagoBackend?.isConfigured()){
    const sb = SagoBackend.getClient();
    const session = await SagoBackend.getSession();
    const { data: listRow, error: listErr } = await sb.from('inventory_scan_lists').insert({
      kind:'accessory', name, model_or_category: category, batch_ref: batchRef || null, created_by: session?.user?.id || null,
    }).select().single();
    if(listErr){ NexusApp.toast('Could not save list: ' + listErr.message, 'error'); return; }

    if(scans.length){
      const { error: itemsErr } = await sb.from('inventory_scan_items').insert(
        scans.map(s => ({ list_id: listRow.id, barcode: s.barcode, label: s.item }))
      );
      if(itemsErr) NexusApp.toast('List saved, but some items failed to save: ' + itemsErr.message, 'error');
    }

    ACC_SAVED_LISTS.unshift({ id: listRow.id, name, category, batchRef: batchRef || null, createdAt: listRow.created_at, items: scans });
    accSessionScans = [];
    NexusApp.closeModal('modal-acc-savesession');
    accRenderSessionTable();
    accRenderKPIs();
    accRenderSavedLists();
    NexusApp.toast(`Saved "${name}" with ${scans.length} items`, 'success');
    return;
  }

  const list = { id:'acclist'+Date.now(), name, category, batchRef: batchRef || null, createdAt: new Date().toISOString(), items: scans };
  ACC_SAVED_LISTS.unshift(list);
  accPersistLists();
  accSessionScans = [];
  accPersistSession();
  NexusApp.closeModal('modal-acc-savesession');
  accRenderSessionTable();
  accRenderKPIs();
  accRenderSavedLists();
  NexusApp.toast(`Saved "${name}" with ${list.items.length} items`, 'success');
}

/* ---------------- SAVED LISTS ---------------- */
function accRenderSavedLists(){
  const wrap = document.getElementById('accSavedListsWrap');
  wrap.innerHTML = ACC_SAVED_LISTS.map(l => `
    <div class="saved-list-card">
      <div class="saved-list-icon"><i class="ri-folder-zip-line"></i></div>
      <div class="saved-list-meta">
        <b>${l.name}</b>
        <span>${l.items.length} items · ${l.category}${l.batchRef?' · '+l.batchRef:''} · Saved ${accFmtDate(l.createdAt)}</span>
      </div>
      <div class="saved-list-actions">
        <button class="btn btn-secondary btn-sm" onclick="accViewList('${l.id}')"><i class="ri-eye-line"></i>View</button>
        <button class="btn btn-secondary btn-sm" onclick="accExportListCSV('${l.id}')"><i class="ri-file-text-line"></i>CSV</button>
        <button class="btn btn-primary btn-sm" onclick="accExportListXLSX('${l.id}')"><i class="ri-file-excel-2-line"></i>Excel</button>
        <button class="icon-btn" style="width:34px;height:34px;" data-tip="Delete list" onclick="accDeleteList('${l.id}')"><i class="ri-delete-bin-line"></i></button>
      </div>
    </div>`).join('') || `<div class="empty-state"><i class="ri-inbox-line"></i><b>No saved lists yet</b><span>Scan some accessories above and save your first list.</span></div>`;
}
async function accDeleteList(id){
  ACC_SAVED_LISTS = ACC_SAVED_LISTS.filter(l => l.id !== id);
  accRenderSavedLists();
  accRenderKPIs();
  NexusApp.toast('List deleted', 'info');
  if(SagoBackend?.isConfigured()){
    const { error } = await SagoBackend.getClient().from('inventory_scan_lists').delete().eq('id', id);
    if(error) NexusApp.toast('Could not delete on server: ' + error.message, 'error');
  } else {
    accPersistLists();
  }
}

/* ---------------- VIEW LIST DRAWER ---------------- */
function accViewList(id){
  const list = ACC_SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  window.accCurrentViewList = id;
  document.getElementById('accVlName').textContent = list.name;
  document.getElementById('accVlMeta').textContent = `${list.items.length} items · ${list.category}${list.batchRef?' · '+list.batchRef:''} · Saved ${accFmtDate(list.createdAt)}`;
  document.getElementById('accVlTableBody').innerHTML = list.items.map(i => `
    <tr><td><code class="barcode-code">${i.barcode}</code></td><td>${i.item}</td><td>${accFmtDateTime(i.scannedAt)}</td></tr>
  `).join('');
  NexusApp.openDrawer('accViewListDrawer');
}

/* ---------------- EXPORT ---------------- */
function accExportListCSV(id){
  const list = ACC_SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  const rows = [['Barcode','Item','Scanned At','List','Batch Ref']];
  list.items.forEach(i => rows.push([i.barcode, i.item, accFmtDateTime(i.scannedAt), list.name, list.batchRef||'']));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = accSanitize(list.name) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Exported as CSV', 'success');
}
function accExportListXLSX(id){
  const list = ACC_SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load — try CSV instead', 'error'); return; }
  const rows = list.items.map(i => ({ 'Barcode': i.barcode, 'Item': i.item, 'Scanned At': accFmtDateTime(i.scannedAt), 'List': list.name, 'Batch Ref': list.batchRef || '' }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:18},{wch:26},{wch:18},{wch:26},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Accessories');
  XLSX.writeFile(wb, accSanitize(list.name) + '.xlsx');
  NexusApp.toast('Exported as Excel workbook', 'success');
}
function accSanitize(name){ return name.replace(/[^a-z0-9\-_ ]/gi,'').replace(/\s+/g,'_'); }
function accExportAllListsXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load', 'error'); return; }
  if(ACC_SAVED_LISTS.length === 0){ NexusApp.toast('No saved lists to export', 'error'); return; }
  const wb = XLSX.utils.book_new();
  ACC_SAVED_LISTS.forEach(list => {
    const rows = list.items.map(i => ({ 'Barcode': i.barcode, 'Item': i.item, 'Scanned At': accFmtDateTime(i.scannedAt) }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:18},{wch:26},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws, accSanitize(list.name).slice(0,28) || 'List');
  });
  XLSX.writeFile(wb, 'sagero-accessories-all-lists.xlsx');
  NexusApp.toast('Exported all lists as one workbook', 'success');
}

/* ---------------- SEARCH ---------------- */
function accWireSearch(){
  document.getElementById('accListSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#accSavedListsWrap .saved-list-card').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
}

/* ---------------- INIT ---------------- */
let accDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(accDidInit) return;
  accDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('accessories.html', session);

  const savedSession = localStorage.getItem('sagero_acc_scan_session');
  accSessionScans = savedSession ? JSON.parse(savedSession) : [];

  if(SagoBackend?.isConfigured()){
    await accLoadListsFromBackend();
  } else {
    const savedLists = localStorage.getItem('sagero_acc_scan_lists');
    ACC_SAVED_LISTS = savedLists ? JSON.parse(savedLists) : accSeedSavedLists();
    if(!savedLists) accPersistLists();
  }

  accWireScanInput();
  accWireSearch();
  if(!accCameraSupported()){
    document.getElementById('accStartCameraBtn').innerHTML = '<i class="ri-camera-off-line"></i>Camera scan not supported here';
    document.getElementById('accStartCameraBtn').disabled = true;
  }
  accRenderKPIs();
  accRenderSessionTable();
  accRenderSavedLists();
  window.addEventListener('beforeunload', accStopCameraScan);
});
