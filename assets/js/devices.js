/* ============================================================
   SAGERO CREATIONS — Phones / Device Inventory module
   Barcode scan-in station (hardware scanner + optional camera),
   saved scan sessions, Excel / CSV export via SheetJS
============================================================ */

const DEV_MODELS = ['Y17s','Y18','Y18t','Y28','Y36','Y50t','Y100','Y200','Y300','Y300 Plus','V30','V40','V50','V50 Pro','V50 Lite','V70','V70 Elite','X100','X200','X200 Ultra','X300','X300 Pro','X300 Ultra','T3','T4'];

/* ---------------- STATE ---------------- */
let sessionScans = [];      // current working scan session (not yet saved)
let SAVED_LISTS = [];       // saved / exported sessions
let cameraStream = null;
let cameraDetectLoop = null;
function persistSession(){ localStorage.setItem('nexus_scan_session', JSON.stringify(sessionScans)); }
function persistLists(){ localStorage.setItem('nexus_scan_lists', JSON.stringify(SAVED_LISTS)); }

/* ============================================================
   BACKEND MODE — real, shared scan lists (see backend_schema_phase4.sql)
============================================================ */
async function loadListsFromBackend(){
  const sb = SagoBackend.getClient();
  const { data: lists, error } = await sb.from('inventory_scan_lists').select('*').eq('kind','device').order('created_at', { ascending:false });
  if(error){ NexusApp.toast('Could not load saved lists: ' + error.message, 'error'); SAVED_LISTS = []; return; }
  SAVED_LISTS = [];
  for(const l of (lists || [])){
    const { data: items } = await sb.from('inventory_scan_items').select('*').eq('list_id', l.id);
    SAVED_LISTS.push({
      id: l.id, name: l.name, model: l.model_or_category, batchRef: l.batch_ref, createdAt: l.created_at,
      items: (items || []).map(i => ({ barcode: i.barcode, model: i.label, scannedAt: i.scanned_at })),
    });
  }
}

function seedSavedLists(){
  const now = Date.now();
  function mockItems(model, count, hoursAgo){
    return Array.from({length:count}, (_,i) => ({
      barcode: '86' + String(1000000000000 + Math.floor(Math.random()*8999999999999)).slice(0,13),
      model, scannedAt: new Date(now - hoursAgo*3600000 - i*4000).toISOString()
    }));
  }
  return [
    { id:'list1', name:'BX-1042 intake — Vivo Y18', model:'Vivo Y18', batchRef:'BX-1042', createdAt: new Date(now-2*86400000).toISOString(), items: mockItems('Vivo Y18', 24, 50) },
    { id:'list2', name:'BX-1051 intake — Vivo Y36', model:'Vivo Y36', batchRef:'BX-1051', createdAt: new Date(now-1*86400000).toISOString(), items: mockItems('Vivo Y36', 18, 26) },
  ];
}

/* ---------------- HELPERS ---------------- */
function fmtDateTime(iso){ return new Date(iso).toLocaleString('en-GB',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
function fmtDate(iso){ return new Date(iso).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' }); }
function isToday(iso){ return new Date(iso).toDateString() === new Date().toDateString(); }
function totalScannedAllTime(){
  return SAVED_LISTS.reduce((s,l)=>s+l.items.length,0) + sessionScans.length;
}
function totalScannedToday(){
  const fromLists = SAVED_LISTS.reduce((s,l)=> s + l.items.filter(i=>isToday(i.scannedAt)).length, 0);
  const fromSession = sessionScans.filter(i=>isToday(i.scannedAt)).length;
  return fromLists + fromSession;
}

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  document.getElementById('kpiTotal').textContent = totalScannedAllTime().toLocaleString();
  document.getElementById('kpiToday').textContent = totalScannedToday();
  document.getElementById('kpiModels').textContent = DEV_MODELS.length;
  document.getElementById('kpiLists').textContent = SAVED_LISTS.length;
}

/* ---------------- SCAN INPUT (hardware scanner + manual entry) ---------------- */
function addScan(barcode){
  barcode = barcode.trim();
  if(!barcode) return;

  const dupeInSession = sessionScans.some(s => s.barcode === barcode);
  const dupeInLists = SAVED_LISTS.some(l => l.items.some(i => i.barcode === barcode));
  if(dupeInSession || dupeInLists){
    NexusApp.toast('Barcode ' + barcode + ' has already been scanned', 'error');
    flashScanInput(false);
    return;
  }

  const model = document.getElementById('scanModel').value;
  sessionScans.unshift({ barcode, model, scannedAt: new Date().toISOString() });
  persistSession();
  renderSessionTable();
  renderKPIs();
  flashScanInput(true);
}
function flashScanInput(success){
  const el = document.getElementById('scanInput');
  el.classList.remove('flash-success','flash-error');
  void el.offsetWidth;
  el.classList.add(success ? 'flash-success' : 'flash-error');
}

function wireScanInput(){
  const input = document.getElementById('scanInput');
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      addScan(input.value);
      input.value = '';
    }
  });
  input.focus();
  document.getElementById('addScanBtn').addEventListener('click', () => {
    addScan(input.value);
    input.value = '';
    input.focus();
  });
}

/* ---------------- CAMERA SCANNING (optional, BarcodeDetector where supported) ---------------- */
function cameraSupported(){
  return 'mediaDevices' in navigator && 'BarcodeDetector' in window;
}
async function startCameraScan(){
  if(!cameraSupported()){
    NexusApp.toast('Camera barcode scanning isn\u2019t supported in this browser — use the scan input below instead', 'error');
    return;
  }
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    const video = document.getElementById('cameraPreview');
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById('cameraWrap').style.display = 'block';
    document.getElementById('startCameraBtn').style.display = 'none';
    document.getElementById('stopCameraBtn').style.display = 'inline-flex';

    const detector = new window.BarcodeDetector({ formats:['ean_13','code_128','upc_a','qr_code'] });
    cameraDetectLoop = setInterval(async () => {
      try{
        const codes = await detector.detect(video);
        if(codes.length){
          addScan(codes[0].rawValue);
        }
      }catch(err){ /* detection frame errors are expected intermittently, ignore */ }
    }, 600);
  }catch(err){
    NexusApp.toast('Could not access camera — check permissions', 'error');
  }
}
function stopCameraScan(){
  if(cameraDetectLoop) clearInterval(cameraDetectLoop);
  if(cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  document.getElementById('cameraWrap').style.display = 'none';
  document.getElementById('startCameraBtn').style.display = 'inline-flex';
  document.getElementById('stopCameraBtn').style.display = 'none';
}

/* ---------------- SESSION TABLE ---------------- */
function renderSessionTable(){
  document.getElementById('sessionCount').textContent = sessionScans.length + ' scanned this session';
  const tbody = document.getElementById('sessionTableBody');
  tbody.innerHTML = sessionScans.map((s,i) => `
    <tr>
      <td><code class="barcode-code">${s.barcode}</code></td>
      <td>${s.model}</td>
      <td>${fmtDateTime(s.scannedAt)}</td>
      <td><button class="icon-btn" style="width:30px;height:30px;" data-tip="Remove" onclick="removeScan(${i})"><i class="ri-close-line"></i></button></td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:22px;">No devices scanned yet — start scanning below.</td></tr>`;

  document.getElementById('saveSessionBtn').disabled = sessionScans.length === 0;
  document.getElementById('clearSessionBtn').disabled = sessionScans.length === 0;
}
function removeScan(index){
  sessionScans.splice(index,1);
  persistSession();
  renderSessionTable();
  renderKPIs();
}
function clearSession(){
  if(sessionScans.length === 0) return;
  sessionScans = [];
  persistSession();
  renderSessionTable();
  renderKPIs();
  NexusApp.toast('Session cleared', 'info');
}

/* ---------------- SAVE SESSION ---------------- */
function openSaveModal(){
  if(sessionScans.length === 0) return;
  const model = document.getElementById('scanModel').value;
  document.getElementById('sv-name').value = model + ' intake — ' + new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  document.getElementById('sv-count').textContent = sessionScans.length + ' device' + (sessionScans.length===1?'':'s') + ' will be saved to this list';
  NexusApp.openModal('modal-savesession');
}
async function submitSaveSession(e){
  e.preventDefault();
  const name = document.getElementById('sv-name').value.trim();
  const batchRef = document.getElementById('sv-batchref').value.trim();
  if(!name){ NexusApp.toast('Give this list a name', 'error'); return; }
  const model = document.getElementById('scanModel').value;
  const scans = [...sessionScans];

  if(SagoBackend?.isConfigured()){
    const sb = SagoBackend.getClient();
    const session = await SagoBackend.getSession();
    const { data: listRow, error: listErr } = await sb.from('inventory_scan_lists').insert({
      kind:'device', name, model_or_category: model, batch_ref: batchRef || null, created_by: session?.user?.id || null,
    }).select().single();
    if(listErr){ NexusApp.toast('Could not save list: ' + listErr.message, 'error'); return; }

    if(scans.length){
      const { error: itemsErr } = await sb.from('inventory_scan_items').insert(
        scans.map(s => ({ list_id: listRow.id, barcode: s.barcode, label: s.model }))
      );
      if(itemsErr) NexusApp.toast('List saved, but some items failed to save: ' + itemsErr.message, 'error');
    }

    SAVED_LISTS.unshift({ id: listRow.id, name, model, batchRef: batchRef || null, createdAt: listRow.created_at, items: scans });
    sessionScans = [];
    NexusApp.closeModal('modal-savesession');
    renderSessionTable();
    renderKPIs();
    renderSavedLists();
    NexusApp.toast(`Saved "${name}" with ${scans.length} devices`, 'success');
    return;
  }

  const list = {
    id: 'list' + Date.now(),
    name, batchRef: batchRef || null, model,
    createdAt: new Date().toISOString(),
    items: scans,
  };
  SAVED_LISTS.unshift(list);
  persistLists();
  sessionScans = [];
  persistSession();

  NexusApp.closeModal('modal-savesession');
  renderSessionTable();
  renderKPIs();
  renderSavedLists();
  NexusApp.toast(`Saved "${name}" with ${list.items.length} devices`, 'success');
}

/* ---------------- SAVED LISTS ---------------- */
function renderSavedLists(){
  const wrap = document.getElementById('savedListsWrap');
  wrap.innerHTML = SAVED_LISTS.map(l => `
    <div class="saved-list-card">
      <div class="saved-list-icon"><i class="ri-folder-zip-line"></i></div>
      <div class="saved-list-meta">
        <b>${l.name}</b>
        <span>${l.items.length} devices · ${l.model}${l.batchRef?' · '+l.batchRef:''} · Saved ${fmtDate(l.createdAt)}</span>
      </div>
      <div class="saved-list-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewList('${l.id}')"><i class="ri-eye-line"></i>View</button>
        <button class="btn btn-secondary btn-sm" onclick="exportListCSV('${l.id}')"><i class="ri-file-text-line"></i>CSV</button>
        <button class="btn btn-primary btn-sm" onclick="exportListXLSX('${l.id}')"><i class="ri-file-excel-2-line"></i>Excel</button>
        <button class="icon-btn" style="width:34px;height:34px;" data-tip="Delete list" onclick="deleteList('${l.id}')"><i class="ri-delete-bin-line"></i></button>
      </div>
    </div>`).join('') || `<div class="empty-state"><i class="ri-inbox-line"></i><b>No saved lists yet</b><span>Scan some devices above and save your first list.</span></div>`;
}
async function deleteList(id){
  SAVED_LISTS = SAVED_LISTS.filter(l => l.id !== id);
  renderSavedLists();
  renderKPIs();
  NexusApp.toast('List deleted', 'info');

  if(SagoBackend?.isConfigured()){
    const { error } = await SagoBackend.getClient().from('inventory_scan_lists').delete().eq('id', id);
    if(error) NexusApp.toast('Could not delete on server: ' + error.message, 'error');
  } else {
    persistLists();
  }
}

/* ---------------- VIEW LIST DRAWER ---------------- */
function viewList(id){
  const list = SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  window.currentViewList = id;
  document.getElementById('vlName').textContent = list.name;
  document.getElementById('vlMeta').textContent = `${list.items.length} devices · ${list.model}${list.batchRef?' · '+list.batchRef:''} · Saved ${fmtDate(list.createdAt)}`;
  document.getElementById('vlTableBody').innerHTML = list.items.map(i => `
    <tr><td><code class="barcode-code">${i.barcode}</code></td><td>${i.model}</td><td>${fmtDateTime(i.scannedAt)}</td></tr>
  `).join('');
  NexusApp.openDrawer('viewListDrawer');
}

/* ---------------- EXPORT ---------------- */
function exportListCSV(id){
  const list = SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  const rows = [['Barcode / IMEI','Model','Scanned At','List','Batch Ref']];
  list.items.forEach(i => rows.push([i.barcode, i.model, fmtDateTime(i.scannedAt), list.name, list.batchRef||'']));
  const csv = rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = sanitizeFilename(list.name) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  NexusApp.toast('Exported as CSV', 'success');
}
function exportListXLSX(id){
  const list = SAVED_LISTS.find(l=>l.id===id);
  if(!list) return;
  if(typeof XLSX === 'undefined'){
    NexusApp.toast('Excel export library failed to load — try CSV instead', 'error');
    return;
  }
  const rows = list.items.map(i => ({
    'Barcode / IMEI': i.barcode, 'Model': i.model, 'Scanned At': fmtDateTime(i.scannedAt),
    'List': list.name, 'Batch Ref': list.batchRef || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:18},{wch:14},{wch:18},{wch:26},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Devices');
  XLSX.writeFile(wb, sanitizeFilename(list.name) + '.xlsx');
  NexusApp.toast('Exported as Excel workbook', 'success');
}
function sanitizeFilename(name){ return name.replace(/[^a-z0-9\-_ ]/gi,'').replace(/\s+/g,'_'); }

function exportAllListsXLSX(){
  if(typeof XLSX === 'undefined'){ NexusApp.toast('Excel export library failed to load', 'error'); return; }
  if(SAVED_LISTS.length === 0){ NexusApp.toast('No saved lists to export', 'error'); return; }
  const wb = XLSX.utils.book_new();
  SAVED_LISTS.forEach(list => {
    const rows = list.items.map(i => ({ 'Barcode / IMEI': i.barcode, 'Model': i.model, 'Scanned At': fmtDateTime(i.scannedAt) }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:18},{wch:14},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws, sanitizeFilename(list.name).slice(0,28) || 'List');
  });
  XLSX.writeFile(wb, 'sagero-device-inventory-all-lists.xlsx');
  NexusApp.toast('Exported all lists as one workbook', 'success');
}

/* ---------------- SEARCH ---------------- */
function wireSearch(){
  document.getElementById('listSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.saved-list-card').forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
}

/* ---------------- INIT ---------------- */
let devDidInit = false;
document.addEventListener('DOMContentLoaded', async () => {
  if(devDidInit) return;
  devDidInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('devices.html', session);

  // the in-progress scan session is always kept locally (a per-device
  // draft/recovery safety net) regardless of backend mode
  const savedSession = localStorage.getItem('nexus_scan_session');
  sessionScans = savedSession ? JSON.parse(savedSession) : [];

  if(SagoBackend?.isConfigured()){
    await loadListsFromBackend();
  } else {
    const savedLists = localStorage.getItem('nexus_scan_lists');
    SAVED_LISTS = savedLists ? JSON.parse(savedLists) : seedSavedLists();
    if(!savedLists) persistLists();
  }

  wireScanInput();
  wireSearch();
  if(!cameraSupported()){
    document.getElementById('startCameraBtn').innerHTML = '<i class="ri-camera-off-line"></i>Camera scan not supported here';
    document.getElementById('startCameraBtn').disabled = true;
  }
  renderKPIs();
  renderSessionTable();
  renderSavedLists();
  window.addEventListener('beforeunload', stopCameraScan);
});
