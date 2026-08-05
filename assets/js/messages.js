/* ============================================================
   SAGERO CREATIONS — Messages module (Supabase-only, Phase 1 fix pass)
   ============================================================
   This page requires the backend to be configured — see
   backend_schema_phase1.sql and backend_migration_fix_rls.sql.
   There is no local demo-data fallback here anymore: this page
   only ever shows real Supabase data.
============================================================ */

/* ---------------- STATE ---------------- */
let backendUserId = null;
let PEOPLE = {};            // userId -> { name, color, online, role } — always populated, never assume a key exists
let CONVERSATIONS = [];     // { id, type, name, personId, membersLabel, convPinned, broken }
let MESSAGES = {};          // conversationId -> [{ id, senderId, text, time, attachment, poll, pinned, reactions }]
let unreadCounts = {};      // conversationId -> number
let activeConvId = null;
let msgSearch = '';
let infoPanelOpen = true;
let realtimeChannel = null;
let didInit = false;        // guards against double-initialization creating duplicate subscriptions

const FALLBACK_PERSON = { name:'Unknown user', color:'#9CA3AF', online:false, role:'' };
function getPerson(id){ return (id && PEOPLE[id]) ? PEOPLE[id] : FALLBACK_PERSON; }
function isMe(id){ return id === backendUserId; }
function initials(name){ return (name||'?').split(' ').map(p=>p[0]).filter(Boolean).slice(0,2).join('').toUpperCase(); }

/* ---------------- LOAD: PEOPLE ---------------- */
async function loadPeople(){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('profiles').select('*');
  if(error){ NexusApp.toast('Could not load team directory: ' + error.message, 'error'); return; }
  PEOPLE = {};
  const palette = ['#6D5DF6','#3B82F6','#7C3AED','#4F46E5','#5B5CF6','#16A34A'];
  (data || []).forEach((p, i) => {
    PEOPLE[p.id] = {
      name: p.full_name || 'Unnamed user',
      color: p.avatar_color || palette[i % palette.length],
      online: !!p.is_online,
      role: p.role || '',
    };
  });
}

/* ---------------- LOAD: CONVERSATIONS ---------------- */
async function loadConversations(){
  const sb = SagoBackend.getClient();

  const { data: memberRows, error: memberErr } = await sb
    .from('conversation_members')
    .select('conversation_id, last_read_at, conversations(id, type, name, created_by)')
    .eq('user_id', backendUserId);
  if(memberErr){ NexusApp.toast('Could not load conversations: ' + memberErr.message, 'error'); CONVERSATIONS = []; return; }

  const convIds = (memberRows || []).map(r => r.conversation_id);
  let allMembers = [];
  if(convIds.length){
    const { data, error } = await sb.from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds);
    if(error){ NexusApp.toast('Could not load conversation members: ' + error.message, 'error'); }
    allMembers = data || [];
  }

  CONVERSATIONS = (memberRows || []).map(r => {
    const conv = r.conversations;
    if(!conv) return null; // membership row pointing at a conversation we can no longer see — skip, don't crash
    const membersOfThis = allMembers.filter(m => m.conversation_id === conv.id);
    const otherMemberId = conv.type === 'dm'
      ? membersOfThis.find(m => m.user_id !== backendUserId)?.user_id || null
      : null;
    const broken = conv.type === 'dm' && !otherMemberId;
    if(broken) console.warn('[messages] DM conversation', conv.id, 'has no linked user — hiding from the list.');

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      personId: otherMemberId,
      membersLabel: conv.type !== 'dm' ? `${membersOfThis.length} member${membersOfThis.length===1?'':'s'}` : undefined,
      convPinned: false,
      lastReadAt: r.last_read_at,
      broken,
    };
  }).filter(Boolean).filter(c => !c.broken); // never render a conversation we can't safely display
}

/* ---------------- LOAD: MESSAGES ---------------- */
async function loadMessages(conversationId){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb
    .from('messages')
    .select('*, message_reactions(emoji, user_id)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending:true });
  if(error){ NexusApp.toast('Could not load messages: ' + error.message, 'error'); MESSAGES[conversationId] = []; return; }

  MESSAGES[conversationId] = (data || []).map(mapDbMessage);
}
function mapDbMessage(m){
  return {
    id: m.id, senderId: m.sender_id, text: m.body || '', time: m.created_at,
    attachment: m.attachment || undefined, poll: m.poll || undefined, pinned: !!m.pinned,
    reactions: (m.message_reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji]||0)+1; return acc; }, {}),
  };
}

/* ---------------- UNREAD COUNTS ---------------- */
function recomputeUnread(conversationId){
  const conv = CONVERSATIONS.find(c => c.id === conversationId);
  const msgs = MESSAGES[conversationId] || [];
  if(!conv){ unreadCounts[conversationId] = 0; return; }
  const lastRead = new Date(conv.lastReadAt || 0).getTime();
  unreadCounts[conversationId] = msgs.filter(m => !isMe(m.senderId) && new Date(m.time).getTime() > lastRead).length;
}
async function markRead(conversationId){
  const conv = CONVERSATIONS.find(c => c.id === conversationId);
  if(!conv) return;
  const now = new Date().toISOString();
  conv.lastReadAt = now;
  unreadCounts[conversationId] = 0;
  if(SagoBackend?.isConfigured()){
    const sb = SagoBackend.getClient();
    await sb.from('conversation_members').update({ last_read_at: now }).eq('conversation_id', conversationId).eq('user_id', backendUserId);
  }
}

/* ---------------- REALTIME (single guarded subscription) ---------------- */
function subscribeRealtime(){
  const sb = SagoBackend.getClient();
  if(realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; } // belt-and-braces: never allow two live channels

  realtimeChannel = sb.channel('sagero-messages-' + backendUserId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, (payload) => {
      const m = payload.new;
      if(!CONVERSATIONS.some(c => c.id === m.conversation_id)) return; // not one of ours, or a hidden/broken conversation
      if(!MESSAGES[m.conversation_id]) MESSAGES[m.conversation_id] = [];
      if(MESSAGES[m.conversation_id].some(x => x.id === m.id)) return; // already have it — avoid duplicate render
      const mapped = mapDbMessage(m);
      MESSAGES[m.conversation_id].push(mapped);

      if(m.conversation_id === activeConvId){
        appendMessageDom(mapped);
        markRead(activeConvId);
      } else {
        recomputeUnread(m.conversation_id);
      }
      renderConvListRow(m.conversation_id); // update just that one row's preview/unread badge, not the whole list
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'messages' }, (payload) => {
      const m = payload.new;
      const list = MESSAGES[m.conversation_id];
      if(!list) return;
      const idx = list.findIndex(x => x.id === m.id);
      if(idx === -1) return;
      list[idx] = mapDbMessage(m);
      if(m.conversation_id === activeConvId) renderMessages();
    })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'message_reactions' }, (payload) => {
      if(payload.new.user_id === backendUserId) return; // our own write already applied optimistically in toggleReaction
      applyReactionDelta(payload.new.message_id, payload.new.emoji, +1);
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'message_reactions' }, (payload) => {
      applyReactionDelta(payload.old.message_id, payload.old.emoji, -1);
    })
    .subscribe();
}
function findMessageById(msgId){
  for(const list of Object.values(MESSAGES)){
    const m = list.find(x => x.id === msgId);
    if(m) return m;
  }
  return null;
}
function applyReactionDelta(msgId, emoji, delta){
  const m = findMessageById(msgId);
  if(!m) return;
  m.reactions = m.reactions || {};
  m.reactions[emoji] = Math.max(0, (m.reactions[emoji] || 0) + delta);
  if(m.reactions[emoji] === 0) delete m.reactions[emoji];
  // only re-render if this message is actually visible right now — reactions
  // happening in a chat you're not looking at shouldn't touch the DOM at all
  if(MESSAGES[activeConvId]?.includes(m)) renderMessages();
}

/* ---------------- SEND ---------------- */
async function sendMessage(){
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if(!text || !activeConvId) return;
  input.value = '';
  autoGrow(input);

  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('messages')
    .insert({ conversation_id: activeConvId, sender_id: backendUserId, body: text })
    .select().single();
  if(error){ NexusApp.toast('Message failed to send: ' + error.message, 'error'); return; }

  // Render immediately from the real inserted row rather than waiting on
  // the realtime echo — keeps the UI responsive even if realtime is briefly
  // slow/unavailable. The realtime INSERT handler has a duplicate-id guard,
  // so when the echo does arrive it's a safe no-op, not a double-render.
  if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
  if(!MESSAGES[activeConvId].some(m => m.id === data.id)){
    const mapped = mapDbMessage(data);
    MESSAGES[activeConvId].push(mapped);
    appendMessageDom(mapped);
    renderConvList();
  }
}

/* ---------------- CONVERSATIONS: create / select ---------------- */
async function createDMConversation(personId){
  const sb = SagoBackend.getClient();
  try{
    const { data: authCheck } = await sb.auth.getSession();
    console.log('[call debug] real session user id:', authCheck?.session?.user?.id, '| backendUserId var:', backendUserId, '| match:', authCheck?.session?.user?.id === backendUserId);
  }catch(e){ console.log('[call debug] could not read session:', e.message); }

  const { data: newConv, error: convErr } = await sb.from('conversations').insert({ type:'dm', created_by: backendUserId }).select().single();
  if(convErr){
    console.error('[createDMConversation] full error object:', JSON.stringify(convErr, null, 2));
    NexusApp.toast(`Could not start conversation: ${convErr.message} | code:${convErr.code||'?'} | hint:${convErr.hint||'none'} | details:${convErr.details||'none'}`, 'error');
    return null;
  }

  const { error: memberErr } = await sb.from('conversation_members').insert([
    { conversation_id: newConv.id, user_id: backendUserId },
    { conversation_id: newConv.id, user_id: personId },
  ]);
  if(memberErr){
    console.error('[createDMConversation] member insert full error object:', JSON.stringify(memberErr, null, 2));
    NexusApp.toast(`Could not start conversation: ${memberErr.message} | code:${memberErr.code||'?'} | hint:${memberErr.hint||'none'}`, 'error');
    await sb.from('conversations').delete().eq('id', newConv.id); // clean up the orphaned shell rather than leaving a broken conversation behind
    return null;
  }

  const conv = { id:newConv.id, type:'dm', personId, convPinned:false, lastReadAt:new Date().toISOString() };
  CONVERSATIONS.push(conv);
  MESSAGES[conv.id] = [];
  unreadCounts[conv.id] = 0;
  return conv;
}
async function openDMWith(personId){
  let conv = CONVERSATIONS.find(c => c.type==='dm' && c.personId===personId);
  if(!conv) conv = await createDMConversation(personId);
  if(conv) selectConversation(conv.id);
}
async function selectConversation(id){
  activeConvId = id;
  if(!MESSAGES[id]) await loadMessages(id);
  recomputeUnread(id);
  await markRead(id);
  document.getElementById('chatEmptyState')?.classList.remove('show');
  renderConvList();
  renderActiveHeader();
  renderMessages();
  renderInfoPanel();
  document.getElementById('msgShell')?.classList.add('mobile-chat-open'); // on mobile, swap to the full-screen chat view
  const input = document.getElementById('msgInput');
  if(input) input.focus();
}
function closeMobileChat(){
  document.getElementById('msgShell')?.classList.remove('mobile-chat-open');
}

/* ---------------- RENDER: helpers ---------------- */
function convDisplayName(c){ return c.type === 'dm' ? getPerson(c.personId).name : (c.name || 'Untitled'); }
function convAvatarColor(c){ return c.type === 'dm' ? getPerson(c.personId).color : (c.type==='group' ? '#7C3AED' : '#6D5DF6'); }
function timeAgo(iso){
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff/60000);
  if(min < 1) return 'now';
  if(min < 60) return min+'m';
  const hr = Math.round(min/60);
  if(hr < 24) return hr+'h';
  return Math.round(hr/24)+'d';
}
function lastMessageOf(convId){
  const msgs = MESSAGES[convId] || [];
  return msgs.length ? msgs[msgs.length-1] : null;
}
function attachmentPreviewText(m){
  if(m.poll) return '📊 ' + m.poll.question;
  if(!m.attachment) return '';
  if(m.attachment.type==='image') return '📷 Photo';
  if(m.attachment.type==='file') return '📎 ' + m.attachment.name;
  if(m.attachment.type==='voice') return '🎤 Voice note';
  return 'Attachment';
}

/* ---------------- RENDER: online row + conversation list ---------------- */
function renderOnlineNow(){
  const wrap = document.getElementById('onlineNowRow');
  const online = Object.entries(PEOPLE).filter(([id,p]) => id!==backendUserId && p.online);
  wrap.innerHTML = online.map(([id,p]) => `
    <div class="online-avatar" data-tip="${p.name}" onclick="openDMWith('${id}')">
      <div class="avatar" style="width:40px;height:40px;font-size:13px;background:${p.color};">${initials(p.name)}</div>
      <span class="status-dot online"></span>
    </div>`).join('') || `<span class="muted-note">No one else is online right now.</span>`;
}

function convRowHTML(c){
  const last = lastMessageOf(c.id);
  const unread = unreadCounts[c.id] || 0;
  const isDM = c.type === 'dm';
  const person = isDM ? getPerson(c.personId) : null;
  const lastText = last ? (last.text || attachmentPreviewText(last)) : 'No messages yet';
  const lastSender = last && isMe(last.senderId) ? 'You: ' : '';
  return `
  <div class="conv-item ${c.id===activeConvId?'active':''}" onclick="selectConversation('${c.id}')">
    <div class="conv-avatar-wrap">
      ${isDM
        ? `<div class="avatar" style="width:42px;height:42px;font-size:13px;background:${convAvatarColor(c)};">${initials(convDisplayName(c))}</div>`
        : `<div class="avatar conv-icon-avatar" style="background:${convAvatarColor(c)};"><i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i></div>`}
      ${isDM ? `<span class="status-dot ${person.online?'online':'offline'}"></span>` : ''}
    </div>
    <div class="conv-meta">
      <div class="conv-row-top"><span class="conv-name">${convDisplayName(c)}</span><span class="conv-time">${last?timeAgo(last.time):''}</span></div>
      <div class="conv-row-bottom"><span class="conv-last">${lastSender}${lastText}</span>${unread>0?`<span class="unread-badge">${unread}</span>`:'<i class="ri-check-double-line read-tick"></i>'}</div>
    </div>
  </div>`;
}
function renderConvList(){
  const q = msgSearch;
  const all = CONVERSATIONS.filter(c => !q || convDisplayName(c).toLowerCase().includes(q));
  const pinned = all.filter(c => c.convPinned);
  const rest = all.filter(c => !c.convPinned);

  document.getElementById('pinnedSection').style.display = pinned.length ? 'block' : 'none';
  document.getElementById('pinnedList').innerHTML = pinned.map(convRowHTML).join('');
  document.getElementById('allList').innerHTML = rest.map(convRowHTML).join('')
    || `<div class="muted-note" style="padding:16px;">${CONVERSATIONS.length ? 'No conversations match your search.' : 'No conversations yet — start one with the pencil icon above.'}</div>`;
  updateNotifBadge();
}
// Cheaper than renderConvList() — used for realtime updates so we're not
// rebuilding the whole sidebar (and restarting its CSS) on every message.
const renderConvListDebounced = NexusApp.debounce(() => renderConvList(), 250);
function renderConvListRow(convId){
  renderConvListDebounced();
}
function updateNotifBadge(){
  const total = Object.values(unreadCounts).reduce((s,n)=>s+n, 0);
  NexusApp.setUnreadTotal(total); // keeps the sidebar badge accurate on every page, not just here
  const dot = document.querySelector('.icon-btn[data-tip="Notifications"] .icon-dot');
  if(dot) dot.style.display = total > 0 ? 'block' : 'none';

  const panel = document.getElementById('notifPanel');
  if(!panel) return;
  const unreadConvs = CONVERSATIONS.filter(c => (unreadCounts[c.id]||0) > 0);
  panel.innerHTML = unreadConvs.length
    ? unreadConvs.map(c => `<div class="dd-item" onclick="selectConversation('${c.id}')"><i class="ri-chat-3-line"></i>${unreadCounts[c.id]} unread in ${convDisplayName(c)}</div>`).join('')
    : `<div class="dd-item" style="cursor:default;"><i class="ri-checkbox-circle-line"></i>You're all caught up</div>`;
}

/* ---------------- RENDER: active conversation header ---------------- */
function renderActiveHeader(){
  const c = CONVERSATIONS.find(x=>x.id===activeConvId);
  if(!c) return;
  const isDM = c.type === 'dm';
  const person = isDM ? getPerson(c.personId) : null;
  document.getElementById('activeAvatar').innerHTML = isDM ? initials(convDisplayName(c)) : `<i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i>`;
  document.getElementById('activeAvatar').style.background = convAvatarColor(c);
  document.getElementById('activeName').textContent = convDisplayName(c);
  document.getElementById('activeSub').textContent = isDM ? (person.online ? 'Online' : 'Offline') : (c.membersLabel || '');
  document.getElementById('activeStatusDot').style.display = isDM ? 'inline-block' : 'none';
  document.getElementById('activeStatusDot').className = 'status-dot-inline ' + (isDM && person.online ? 'online' : 'offline');
}

/* ---------------- RENDER: messages ---------------- */
function dayLabel(iso){
  const d = new Date(iso), today = new Date();
  if(d.toDateString() === today.toDateString()) return 'Today';
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  if(d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
}
function messageRowHTML(m, grouped){
  const person = getPerson(m.senderId);
  const me = isMe(m.senderId);
  return `
    <div class="msg-row ${me?'me':''} ${grouped?'grouped':''}" data-id="${m.id}">
      ${!grouped ? `<div class="avatar" style="width:32px;height:32px;font-size:11px;background:${person.color};">${initials(person.name)}</div>` : `<div class="avatar-spacer"></div>`}
      <div class="msg-bubble-col">
        ${!grouped ? `<div class="msg-head"><span class="msg-sender">${person.name}</span><span class="msg-time">${new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>${m.pinned?'<i class="ri-pushpin-2-fill msg-pin-flag" data-tip="Pinned"></i>':''}</div>` : ''}
        <div class="msg-bubble ${m.poll?'has-poll':''}">
          ${m.text ? `<div class="msg-text">${renderMentions(m.text)}</div>` : ''}
          ${m.attachment ? renderAttachment(m.attachment) : ''}
          ${m.poll ? renderPoll(m.id, m.poll) : ''}
        </div>
        ${Object.keys(m.reactions||{}).length ? `<div class="msg-reactions">${Object.entries(m.reactions).map(([emoji,count])=>`<span class="reaction-chip" onclick="toggleReaction('${m.id}','${emoji}')">${emoji} ${count}</span>`).join('')}</div>` : ''}
        <div class="msg-hover-actions">
          <button data-tip="React" onclick="openReactPicker(event,'${m.id}')"><i class="ri-emotion-line"></i></button>
          <button data-tip="${m.pinned?'Unpin':'Pin'}" onclick="togglePin('${m.id}')"><i class="ri-pushpin-2-${m.pinned?'fill':'line'}"></i></button>
        </div>
      </div>
    </div>`;
}
function renderMessages(){
  const msgs = MESSAGES[activeConvId] || [];
  const wrap = document.getElementById('msgList');
  let html = '', lastSender = null, lastDay = null;
  msgs.forEach(m => {
    const day = dayLabel(m.time);
    if(day !== lastDay){ html += `<div class="day-divider"><span>${day}</span></div>`; lastDay = day; lastSender = null; }
    html += messageRowHTML(m, m.senderId === lastSender);
    lastSender = m.senderId;
  });
  wrap.innerHTML = html || `<div class="muted-note" style="padding:24px;text-align:center;">No messages yet — say hello 👋</div>`;
  renderPinnedBanner();
  scrollToBottom();
}
// Used by the realtime handler so a new message doesn't force a full
// rebuild (and re-animation) of the entire thread — just appends one row.
function appendMessageDom(m){
  const wrap = document.getElementById('msgList');
  const msgs = MESSAGES[activeConvId] || [];
  const prev = msgs[msgs.length-2]; // the message before this new one
  const grouped = prev && prev.senderId === m.senderId && dayLabel(prev.time) === dayLabel(m.time);
  const day = dayLabel(m.time);
  const needsDivider = !prev || dayLabel(prev.time) !== day;
  wrap.insertAdjacentHTML('beforeend', (needsDivider ? `<div class="day-divider"><span>${day}</span></div>` : '') + messageRowHTML(m, grouped));
  scrollToBottom();
}
function renderPinnedBanner(){
  const msgs = MESSAGES[activeConvId] || [];
  const pinned = msgs.filter(m => m.pinned);
  const banner = document.getElementById('pinnedBanner');
  if(pinned.length === 0){ banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const first = pinned[0];
  document.getElementById('pinnedText').textContent = `${getPerson(first.senderId).name}: ${first.text || attachmentPreviewText(first)}`;
  document.getElementById('pinnedCount').textContent = pinned.length > 1 ? `+${pinned.length-1} more` : '';
}
function renderMentions(text){
  return text.replace(/@([A-Za-z]+)/g, (match, name) => {
    const found = Object.values(PEOPLE).find(p => p.name.toLowerCase().startsWith(name.toLowerCase()));
    return found ? `<span class="mention-chip">@${found.name.split(' ')[0]}</span>` : match;
  });
}
function renderAttachment(att){
  if(att.type === 'image'){
    if(att.url) return `<img src="${att.url}" class="att-image-real" alt="${att.name||'Photo'}" onclick="window.open('${att.url}','_blank')">`;
    return `<div class="att-image"><i class="ri-image-2-line"></i><span>${att.label||'Photo'}</span></div>`; // legacy fake attachment
  }
  if(att.type === 'video'){
    return `<video src="${att.url}" class="att-video-real" controls preload="metadata"></video>`;
  }
  if(att.type === 'file') return `<div class="att-file" onclick="window.open('${att.url}','_blank')" style="cursor:pointer;"><div class="att-file-icon"><i class="ri-file-text-line"></i></div><div><b>${att.name}</b><small>${att.size}</small></div><i class="ri-download-2-line att-file-dl"></i></div>`;
  if(att.type === 'voice') return `<div class="att-voice"><i class="ri-mic-line att-voice-icon"></i><audio src="${att.url}" controls preload="metadata" style="height:32px; max-width:200px;"></audio><span class="att-voice-dur">${att.duration||''}</span></div>`;
  return '';
}
function scrollToBottom(){
  const wrap = document.getElementById('msgList');
  wrap.scrollTop = wrap.scrollHeight;
}

/* ---------------- POLLS ---------------- */
function renderPoll(msgId, poll){
  const total = poll.options.reduce((s,o)=>s+o.votes,0) || 1;
  return `
  <div class="poll-widget">
    <div class="poll-question">${poll.question}</div>
    ${poll.options.map((o,i) => {
      const pct = Math.round(o.votes/total*100);
      const mine = poll.myVote === i;
      return `<div class="poll-option ${mine?'voted':''}" onclick="votePoll('${msgId}',${i})">
        <div class="poll-option-fill" style="width:${pct}%;"></div>
        <span class="poll-option-label">${mine?'<i class="ri-check-line"></i> ':''}${o.label}</span>
        <span class="poll-option-pct">${pct}%</span>
      </div>`;
    }).join('')}
    <div class="poll-footer">${total} vote${total===1?'':'s'}</div>
  </div>`;
}
async function votePoll(msgId, optionIndex){
  const msgs = MESSAGES[activeConvId];
  const m = msgs?.find(x=>x.id===msgId);
  if(!m || !m.poll) return;
  const poll = JSON.parse(JSON.stringify(m.poll));
  if(poll.myVote === optionIndex){ poll.options[optionIndex].votes--; poll.myVote = null; }
  else { if(poll.myVote !== null) poll.options[poll.myVote].votes--; poll.options[optionIndex].votes++; poll.myVote = optionIndex; }
  m.poll = poll;
  renderMessages();

  const sb = SagoBackend.getClient();
  const { error } = await sb.from('messages').update({ poll }).eq('id', msgId);
  if(error) NexusApp.toast('Could not save your vote: ' + error.message, 'error');
}

/* ---------------- REACTIONS / PINS ---------------- */
const QUICK_EMOJIS = ['👍','❤️','😂','🎉','🔥','🙏','👏','😮'];

async function toggleReaction(msgId, emoji){
  const sb = SagoBackend.getClient();
  const m = findMessageById(msgId);
  if(m){ // instant local feedback — don't wait on the realtime round-trip to see your own reaction land
    m.reactions = m.reactions || {};
    m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
    if(MESSAGES[activeConvId]?.includes(m)) renderMessages();
  }
  const { error } = await sb.from('message_reactions').insert({ message_id: msgId, user_id: backendUserId, emoji });
  if(error && error.code !== '23505'){ NexusApp.toast('Reaction failed: ' + error.message, 'error'); return; }
  // the realtime echo of this exact insert will arrive shortly after — the
  // handler above recognizes it's our own write (matching user_id) and skips
  // re-applying it, so this doesn't get double-counted or double-rendered
}
function openReactPicker(evt, msgId){
  evt.stopPropagation();
  closeAllPopovers();
  const pop = document.getElementById('reactPopover');
  pop.innerHTML = QUICK_EMOJIS.map(e => `<span onclick="toggleReaction('${msgId}','${e}'); closeAllPopovers();">${e}</span>`).join('');
  const rect = evt.target.closest('button').getBoundingClientRect();
  const wrapRect = document.getElementById('chatArea').getBoundingClientRect();
  pop.style.top = (rect.top - wrapRect.top - 46) + 'px';
  pop.style.left = (rect.left - wrapRect.left - 80) + 'px';
  pop.classList.add('open');
}
async function togglePin(msgId){
  const m = (MESSAGES[activeConvId]||[]).find(x=>x.id===msgId);
  if(!m) return;
  const nextPinned = !m.pinned;
  const sb = SagoBackend.getClient();
  const { error } = await sb.from('messages').update({ pinned: nextPinned }).eq('id', msgId);
  if(error){ NexusApp.toast('Could not update pin: ' + error.message, 'error'); return; }
  m.pinned = nextPinned;
  renderMessages();
  NexusApp.toast(m.pinned ? 'Message pinned' : 'Message unpinned', 'info');
}
function closeAllPopovers(){
  document.getElementById('reactPopover')?.classList.remove('open');
  document.getElementById('emojiPopover')?.classList.remove('open');
  document.getElementById('mentionPopover')?.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if(!e.target.closest('.msg-hover-actions') && !e.target.closest('#reactPopover')) document.getElementById('reactPopover')?.classList.remove('open');
  if(!e.target.closest('#emojiBtn') && !e.target.closest('#emojiPopover')) document.getElementById('emojiPopover')?.classList.remove('open');
});

/* ---------------- COMPOSER: attach / emoji / mentions ---------------- */
function handleInputKey(e){ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }
function autoGrow(el){ el.style.height='auto'; el.style.height = Math.min(120, el.scrollHeight)+'px'; }
function toggleAttachMenu(){ document.getElementById('attachMenu').classList.toggle('open'); }
/* ---------------- REAL MEDIA UPLOAD (Supabase Storage) ---------------- */
let pendingMediaType = null;
function triggerMediaUpload(type){
  document.getElementById('attachMenu').classList.remove('open');
  if(!activeConvId) return;
  if(!SagoBackend?.isConfigured()){
    NexusApp.toast('Photo/video sharing needs the backend connected \u2014 see assets/js/supabase-client.js', 'error');
    return;
  }
  pendingMediaType = type;
  const input = document.getElementById('mediaFileInput');
  input.accept = type === 'video' ? 'video/*' : 'image/*';
  input.value = '';
  input.click();
}
async function handleMediaFileSelected(e){
  const file = e.target.files[0];
  if(!file || !activeConvId) return;
  const type = pendingMediaType;

  const MAX_MB = 25;
  if(file.size > MAX_MB * 1024 * 1024){
    NexusApp.toast(`That file is too large \u2014 keep ${type}s under ${MAX_MB}MB`, 'error');
    return;
  }

  const progressBar = document.getElementById('uploadProgressBar');
  const progressFill = document.getElementById('uploadProgressFill');
  progressBar.style.display = 'block';
  progressFill.style.width = '15%';

  try{
    const sb = SagoBackend.getClient();
    const ext = file.name.split('.').pop();
    const path = `${activeConvId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    progressFill.style.width = '45%';
    const { error: uploadErr } = await sb.storage.from('message-attachments').upload(path, file, { cacheControl:'3600', upsert:false });
    if(uploadErr){ NexusApp.toast('Upload failed: ' + uploadErr.message, 'error'); progressBar.style.display = 'none'; return; }

    progressFill.style.width = '75%';
    const { data: urlData } = sb.storage.from('message-attachments').getPublicUrl(path);
    const attachment = { type, url: urlData.publicUrl, name: file.name, size: fmtFileSize(file.size) };

    const { data, error } = await sb.from('messages')
      .insert({ conversation_id: activeConvId, sender_id: backendUserId, body:'', attachment })
      .select().single();
    progressFill.style.width = '100%';
    if(error){ NexusApp.toast('Could not send: ' + error.message, 'error'); return; }

    if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
    if(!MESSAGES[activeConvId].some(m => m.id === data.id)){
      const mapped = mapDbMessage(data);
      MESSAGES[activeConvId].push(mapped);
      appendMessageDom(mapped);
      renderConvList();
    }
  } finally {
    setTimeout(() => { progressBar.style.display = 'none'; progressFill.style.width = '0%'; }, 300);
  }
}
function fmtFileSize(bytes){
  if(bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

/* ---------------- REAL FILE ATTACHMENT ---------------- */
function triggerFileUpload(){
  document.getElementById('attachMenu').classList.remove('open');
  if(!activeConvId) return;
  if(!SagoBackend?.isConfigured()){ NexusApp.toast('File sharing needs the backend connected', 'error'); return; }
  document.getElementById('generalFileInput').value = '';
  document.getElementById('generalFileInput').click();
}
async function handleGeneralFileSelected(e){
  const file = e.target.files[0];
  if(!file || !activeConvId) return;
  const MAX_MB = 25;
  if(file.size > MAX_MB*1024*1024){ NexusApp.toast(`That file is too large — keep files under ${MAX_MB}MB`, 'error'); return; }

  const progressBar = document.getElementById('uploadProgressBar');
  const progressFill = document.getElementById('uploadProgressFill');
  progressBar.style.display = 'block'; progressFill.style.width = '20%';

  try{
    const sb = SagoBackend.getClient();
    const path = `${activeConvId}/${Date.now()}-${file.name}`;
    progressFill.style.width = '55%';
    const { error: upErr } = await sb.storage.from('message-attachments').upload(path, file);
    if(upErr){ NexusApp.toast('Upload failed: ' + upErr.message, 'error'); return; }
    progressFill.style.width = '80%';
    const { data: urlData } = sb.storage.from('message-attachments').getPublicUrl(path);
    const attachment = { type:'file', url: urlData.publicUrl, name: file.name, size: fmtFileSize(file.size) };
    await sendAttachmentMessage(attachment);
    progressFill.style.width = '100%';
  } finally {
    setTimeout(() => { progressBar.style.display = 'none'; progressFill.style.width = '0%'; }, 300);
  }
}

/* ---------------- REAL VOICE NOTE (MediaRecorder) ---------------- */
let voiceRecorder = null, voiceChunks = [], voiceStream = null, voiceStartTime = null, voiceTimerHandle = null;
async function startVoiceRecording(){
  document.getElementById('attachMenu').classList.remove('open');
  if(!activeConvId) return;
  if(!SagoBackend?.isConfigured()){ NexusApp.toast('Voice notes need the backend connected', 'error'); return; }
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){ NexusApp.toast('Voice recording isn\u2019t supported in this browser', 'error'); return; }

  try{
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  }catch(err){
    NexusApp.toast('Could not access microphone — check permissions', 'error');
    return;
  }
  voiceChunks = [];
  voiceRecorder = new MediaRecorder(voiceStream);
  voiceRecorder.ondataavailable = (e) => { if(e.data.size > 0) voiceChunks.push(e.data); };
  voiceRecorder.start();
  voiceStartTime = Date.now();
  document.getElementById('voiceRecordBanner').style.display = 'flex';
  voiceTimerHandle = setInterval(() => {
    const secs = Math.floor((Date.now()-voiceStartTime)/1000);
    document.getElementById('voiceRecordTimer').textContent = Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');
  }, 500);
}
function cleanupVoiceRecording(){
  clearInterval(voiceTimerHandle);
  if(voiceStream) voiceStream.getTracks().forEach(t=>t.stop());
  voiceRecorder = null; voiceStream = null; voiceChunks = [];
  document.getElementById('voiceRecordBanner').style.display = 'none';
}
function cancelVoiceRecording(){
  if(voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
  cleanupVoiceRecording();
  NexusApp.toast('Recording discarded', 'info');
}
async function stopAndSendVoiceRecording(){
  if(!voiceRecorder || voiceRecorder.state === 'inactive') return;
  const durationSecs = Math.floor((Date.now()-voiceStartTime)/1000);
  const stopped = new Promise(resolve => { voiceRecorder.onstop = resolve; });
  voiceRecorder.stop();
  await stopped;

  const blob = new Blob(voiceChunks, { type: voiceRecorder.mimeType || 'audio/webm' });
  cleanupVoiceRecording();

  if(blob.size === 0){ NexusApp.toast('Recording was empty', 'error'); return; }

  const sb = SagoBackend.getClient();
  const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
  const path = `${activeConvId}/${Date.now()}-voice.${ext}`;
  const { error: upErr } = await sb.storage.from('message-attachments').upload(path, blob, { contentType: blob.type });
  if(upErr){ NexusApp.toast('Could not send voice note: ' + upErr.message, 'error'); return; }
  const { data: urlData } = sb.storage.from('message-attachments').getPublicUrl(path);
  const duration = Math.floor(durationSecs/60)+':'+String(durationSecs%60).padStart(2,'0');
  await sendAttachmentMessage({ type:'voice', url: urlData.publicUrl, duration });
}

/* ---------------- SHARED: send a message carrying only an attachment ---------------- */
async function sendAttachmentMessage(attachment){
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('messages')
    .insert({ conversation_id: activeConvId, sender_id: backendUserId, body:'', attachment })
    .select().single();
  if(error){ NexusApp.toast('Could not send: ' + error.message, 'error'); return; }

  if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
  if(!MESSAGES[activeConvId].some(m => m.id === data.id)){
    const mapped = mapDbMessage(data);
    MESSAGES[activeConvId].push(mapped);
    appendMessageDom(mapped);
    renderConvList();
  }
  NexusApp.toast('Attached', 'success');
}
function toggleEmojiPicker(){
  const pop = document.getElementById('emojiPopover');
  pop.innerHTML = QUICK_EMOJIS.map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('');
  pop.classList.toggle('open');
}
function insertEmoji(e){ const input = document.getElementById('msgInput'); input.value += e; input.focus(); }
function handleInputChange(){
  const input = document.getElementById('msgInput');
  autoGrow(input);
  const caretAtMention = /@([A-Za-z]*)$/.exec(input.value);
  const pop = document.getElementById('mentionPopover');
  if(caretAtMention){
    const q = caretAtMention[1].toLowerCase();
    const matches = Object.entries(PEOPLE).filter(([id,p]) => id !== backendUserId && p.name.toLowerCase().includes(q));
    if(matches.length){
      pop.innerHTML = matches.map(([id,p]) => `<div class="mention-opt" onclick="pickMention('${p.name.replace(/'/g,"")}')"><span>${initials(p.name)}</span>${p.name}</div>`).join('');
      pop.classList.add('open');
    } else pop.classList.remove('open');
  } else pop.classList.remove('open');
}
function pickMention(name){
  const input = document.getElementById('msgInput');
  input.value = input.value.replace(/@([A-Za-z]*)$/, '@'+name.split(' ')[0]+' ');
  document.getElementById('mentionPopover').classList.remove('open');
  input.focus();
}

/* ---------------- GROUP INFO PANEL ---------------- */
function renderInfoPanel(){
  const c = CONVERSATIONS.find(x=>x.id===activeConvId);
  if(!c) return;
  const isDM = c.type === 'dm';
  const person = isDM ? getPerson(c.personId) : null;
  document.getElementById('infoAvatar').innerHTML = isDM ? initials(convDisplayName(c)) : `<i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i>`;
  document.getElementById('infoAvatar').style.background = convAvatarColor(c);
  document.getElementById('infoName').textContent = convDisplayName(c);
  document.getElementById('infoSub').textContent = isDM ? (person.online?'Online':'Offline') : (c.membersLabel || '');
  document.getElementById('infoDescription').textContent = isDM
    ? `Direct messages with ${convDisplayName(c)}${person.role ? ' · ' + person.role : ''}.`
    : 'No description yet.';

  const msgs = MESSAGES[activeConvId] || [];
  document.getElementById('infoMediaCount').textContent = msgs.filter(m => m.attachment && m.attachment.type==='image').length;
  const files = msgs.filter(m => m.attachment && m.attachment.type==='file');
  document.getElementById('infoFilesList').innerHTML = files.map(m => `
    <div class="info-file-row">
      <div class="att-file-icon"><i class="ri-file-text-line"></i></div>
      <div><b>${m.attachment.name}</b><small>${m.attachment.size}</small></div>
    </div>`).join('') || `<span class="muted-note">No files shared yet.</span>`;
}
function toggleInfoPanel(){
  infoPanelOpen = !infoPanelOpen;
  document.getElementById('msgShell').classList.toggle('info-hidden', !infoPanelOpen);
}

/* ---------------- COMPOSE (new message) ---------------- */
let composeSearch = '';
function openComposeModal(){
  composeSearch = '';
  document.getElementById('composeSearch').value = '';
  renderComposeList();
  NexusApp.openModal('modal-compose');
  setTimeout(()=>document.getElementById('composeSearch').focus(), 100);
}
function renderComposeList(){
  const list = document.getElementById('composeList');
  const people = Object.entries(PEOPLE).filter(([id]) => id !== backendUserId);
  const filtered = people.filter(([id,p]) => !composeSearch || p.name.toLowerCase().includes(composeSearch) || (p.role||'').toLowerCase().includes(composeSearch));
  list.innerHTML = filtered.map(([id,p]) => {
    const hasConv = CONVERSATIONS.some(c => c.type==='dm' && c.personId===id);
    return `
    <div class="compose-opt" onclick="startNewConversation('${id}')">
      <div class="conv-avatar-wrap">
        <div class="avatar" style="width:36px;height:36px;font-size:12px;background:${p.color};">${initials(p.name)}</div>
        <span class="status-dot ${p.online?'online':'offline'}"></span>
      </div>
      <div class="compose-opt-meta"><b>${p.name}</b><small>${p.role||''}</small></div>
      ${hasConv ? '<span class="compose-existing">Message</span>' : '<span class="compose-new">Start chat</span>'}
    </div>`;
  }).join('') || `<div class="muted-note" style="padding:16px;">No one else in the workspace yet.</div>`;
}
async function startNewConversation(personId){
  let conv = CONVERSATIONS.find(c => c.type==='dm' && c.personId===personId);
  const isNew = !conv;
  if(!conv) conv = await createDMConversation(personId);
  if(!conv) return;
  NexusApp.closeModal('modal-compose');
  await selectConversation(conv.id);
  renderConvList();
  if(isNew) NexusApp.toast(`Started a conversation with ${getPerson(personId).name}`, 'success');
}

/* ---------------- SEARCH ---------------- */
function wireSidebarControls(){
  document.getElementById('convSearch').addEventListener('input', e => { msgSearch = e.target.value.trim().toLowerCase(); renderConvList(); });
  document.getElementById('composeSearch').addEventListener('input', e => { composeSearch = e.target.value.trim().toLowerCase(); renderComposeList(); });
}

/* ---------------- INIT ---------------- */
/* ============================================================
   CALLING — real peer-to-peer voice/video via WebRTC.
   Signaling (offer/answer/ICE) rides on Supabase Realtime
   Broadcast, scoped to each user's own channel, so calls work
   the moment Messages is open regardless of which chat is active.
   The audio/video itself never touches the server — it's a
   direct connection between the two browsers.
============================================================ */
const ICE_SERVERS = { iceServers: [
  { urls:'stun:stun.l.google.com:19302' },
  { urls:'stun:stun1.l.google.com:19302' },
] };
const CALL_RING_TIMEOUT_MS = 30000;

let myCallChannel = null;
let outboundCallChannel = null, outboundCallChannelPeerId = null;
let pc = null, localStream = null;
let callState = 'idle'; // idle | calling | ringing | connecting | connected
let currentPeerId = null, currentCallType = null, currentCallConvId = null;
let pendingOffer = null, queuedIce = [];
let callTimeoutHandle = null, callTimerHandle = null, callStartTime = null;

function initCallSignaling(){
  const sb = SagoBackend.getClient();
  myCallChannel = sb.channel('user-calls-' + backendUserId)
    .on('broadcast', { event:'offer' }, ({ payload }) => handleIncomingOffer(payload))
    .on('broadcast', { event:'answer' }, ({ payload }) => handleAnswer(payload))
    .on('broadcast', { event:'ice' }, ({ payload }) => handleRemoteIce(payload))
    .on('broadcast', { event:'end' }, () => handleRemoteEnd())
    .on('broadcast', { event:'decline' }, ({ payload }) => handleRemoteDecline(payload))
    .subscribe();
}
function getOutboundChannel(toUserId){
  if(outboundCallChannel && outboundCallChannelPeerId === toUserId) return Promise.resolve(outboundCallChannel);
  if(outboundCallChannel) SagoBackend.getClient().removeChannel(outboundCallChannel);
  const sb = SagoBackend.getClient();
  const ch = sb.channel('user-calls-' + toUserId);
  outboundCallChannel = ch;
  outboundCallChannelPeerId = toUserId;
  return new Promise(resolve => {
    ch.subscribe((status) => { if(status === 'SUBSCRIBED') resolve(ch); });
  });
}
async function sendSignal(toUserId, event, payload){
  const ch = await getOutboundChannel(toUserId);
  ch.send({ type:'broadcast', event, payload });
}

/* ---------------- OUTGOING ---------------- */
async function startCall(type){
  if(callState !== 'idle'){ NexusApp.toast('You\u2019re already in a call', 'error'); return; }
  const conv = CONVERSATIONS.find(c => c.id === activeConvId);
  if(!conv || conv.type !== 'dm'){ NexusApp.toast('Calls are only available in direct messages right now', 'error'); return; }
  const peerId = conv.personId;
  if(!peerId){ return; }

  if(!navigator.mediaDevices?.getUserMedia){ NexusApp.toast('This browser doesn\u2019t support calling', 'error'); return; }

  currentPeerId = peerId; currentCallType = type; currentCallConvId = activeConvId; callState = 'calling';

  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video: type==='video' });
  }catch(err){
    NexusApp.toast('Could not access ' + (type==='video'?'camera/microphone':'microphone') + ' \u2014 check permissions', 'error');
    callState = 'idle'; currentPeerId = null;
    return;
  }

  showActiveCallUI('calling');
  pc = createPeerConnection(peerId);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal(peerId, 'offer', {
    sdp: offer, callType: type, callerId: backendUserId,
    callerName: getPerson(backendUserId).name, conversationId: activeConvId,
  });

  callTimeoutHandle = setTimeout(() => {
    if(callState === 'calling'){ NexusApp.toast('No answer', 'info'); endCall(); }
  }, CALL_RING_TIMEOUT_MS);
}

/* ---------------- INCOMING ---------------- */
function handleIncomingOffer(payload){
  if(callState !== 'idle'){ sendSignal(payload.callerId, 'decline', { reason:'busy' }); return; }
  pendingOffer = payload;
  currentPeerId = payload.callerId; currentCallType = payload.callType; currentCallConvId = payload.conversationId;
  callState = 'ringing';
  showIncomingCallUI(payload);

  callTimeoutHandle = setTimeout(() => {
    if(callState === 'ringing'){ declineCall(); }
  }, CALL_RING_TIMEOUT_MS);
}
async function acceptCall(){
  if(!pendingOffer) return;
  const payload = pendingOffer;
  clearTimeout(callTimeoutHandle);
  hideIncomingCallUI();
  callState = 'connecting';

  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video: currentCallType==='video' });
  }catch(err){
    NexusApp.toast('Could not access ' + (currentCallType==='video'?'camera/microphone':'microphone') + ' \u2014 check permissions', 'error');
    sendSignal(currentPeerId, 'decline', { reason:'no-media' });
    cleanupCall();
    return;
  }

  showActiveCallUI('connecting');
  pc = createPeerConnection(currentPeerId);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  for(const c of queuedIce){ try{ await pc.addIceCandidate(new RTCIceCandidate(c)); }catch(e){} }
  queuedIce = [];

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendSignal(currentPeerId, 'answer', { sdp: answer });
}
function declineCall(){
  if(pendingOffer) sendSignal(pendingOffer.callerId, 'decline', { reason:'declined' });
  clearTimeout(callTimeoutHandle);
  hideIncomingCallUI();
  callState = 'idle';
  currentPeerId = null; pendingOffer = null;
}

/* ---------------- PEER CONNECTION ---------------- */
function createPeerConnection(peerId){
  const conn = new RTCPeerConnection(ICE_SERVERS);
  conn.onicecandidate = (e) => { if(e.candidate) sendSignal(peerId, 'ice', { candidate: e.candidate }); };
  conn.ontrack = (e) => {
    const stream = e.streams[0];
    const videoEl = document.getElementById('callRemoteVideo');
    const audioEl = document.getElementById('callRemoteAudio');
    if(videoEl) videoEl.srcObject = stream;
    if(audioEl) audioEl.srcObject = stream;
  };
  conn.onconnectionstatechange = () => {
    if(conn.connectionState === 'connected') onCallConnected();
    else if(['disconnected','failed','closed'].includes(conn.connectionState) && callState !== 'idle') endCall();
  };
  return conn;
}
async function handleAnswer(payload){
  if(!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  for(const c of queuedIce){ try{ await pc.addIceCandidate(new RTCIceCandidate(c)); }catch(e){} }
  queuedIce = [];
}
async function handleRemoteIce(payload){
  if(pc && pc.remoteDescription){ try{ await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }catch(e){} }
  else queuedIce.push(payload.candidate);
}
function onCallConnected(){
  callState = 'connected';
  clearTimeout(callTimeoutHandle);
  callStartTime = Date.now();
  callTimerHandle = setInterval(updateCallTimer, 1000);
  showActiveCallUI('connected');
}
function handleRemoteEnd(){ if(callState !== 'idle'){ NexusApp.toast('Call ended', 'info'); cleanupCall(); } }
function handleRemoteDecline(payload){
  NexusApp.toast(payload?.reason === 'busy' ? 'They\u2019re on another call' : 'Call declined', 'info');
  cleanupCall();
}

/* ---------------- END / CLEANUP ---------------- */
function endCall(){
  if(currentPeerId) sendSignal(currentPeerId, 'end', {});
  cleanupCall();
}
function cleanupCall(){
  if(pc){ pc.close(); pc = null; }
  if(localStream){ localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  clearTimeout(callTimeoutHandle);
  clearInterval(callTimerHandle);
  callState = 'idle';
  currentPeerId = null; currentCallType = null; currentCallConvId = null; pendingOffer = null; queuedIce = [];
  if(outboundCallChannel){ SagoBackend.getClient().removeChannel(outboundCallChannel); outboundCallChannel = null; outboundCallChannelPeerId = null; }
  hideActiveCallUI();
  hideIncomingCallUI();
}

/* ---------------- CONTROLS ---------------- */
function toggleMute(){
  if(!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('muteBtn');
  btn.classList.toggle('muted', !track.enabled);
  btn.querySelector('i').className = track.enabled ? 'ri-mic-line' : 'ri-mic-off-line';
}
function toggleCamera(){
  if(!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  const btn = document.getElementById('cameraBtn');
  btn.classList.toggle('muted', !track.enabled);
  btn.querySelector('i').className = track.enabled ? 'ri-vidicon-line' : 'ri-vidicon-off-line';
  document.getElementById('callLocalVideo').style.opacity = track.enabled ? '1' : '0';
}

/* ---------------- UI ---------------- */
function showIncomingCallUI(payload){
  document.getElementById('incomingCallAvatar').textContent = initials(payload.callerName);
  document.getElementById('incomingCallName').textContent = payload.callerName;
  document.getElementById('incomingCallType').textContent = (payload.callType==='video'?'Incoming video call':'Incoming voice call') + '\u2026';
  document.getElementById('incomingCallOverlay').classList.add('show');
}
function hideIncomingCallUI(){
  document.getElementById('incomingCallOverlay').classList.remove('show');
}
function showActiveCallUI(state){
  const person = getPerson(currentPeerId);
  const overlay = document.getElementById('activeCallOverlay');
  overlay.classList.add('show');
  overlay.classList.toggle('video-mode', currentCallType === 'video');
  document.getElementById('callAvatarLarge').textContent = initials(person.name);
  document.getElementById('callPeerName').textContent = person.name;
  document.getElementById('callStatusText').textContent = state === 'calling' ? 'Calling\u2026' : state === 'connecting' ? 'Connecting\u2026' : '00:00';
  document.getElementById('cameraBtn').style.display = currentCallType === 'video' ? 'flex' : 'none';
  const localVideo = document.getElementById('callLocalVideo');
  if(currentCallType === 'video' && localStream){
    localVideo.srcObject = localStream;
    localVideo.style.display = 'block';
  } else {
    localVideo.style.display = 'none';
  }
}
function hideActiveCallUI(){
  const overlay = document.getElementById('activeCallOverlay');
  overlay.classList.remove('show', 'video-mode');
  document.getElementById('callRemoteVideo').srcObject = null;
  document.getElementById('callRemoteAudio').srcObject = null;
  document.getElementById('callLocalVideo').srcObject = null;
  document.getElementById('muteBtn').classList.remove('muted');
  document.getElementById('muteBtn').querySelector('i').className = 'ri-mic-line';
  document.getElementById('cameraBtn').classList.remove('muted');
}
function updateCallTimer(){
  const secs = Math.floor((Date.now() - callStartTime) / 1000);
  const m = String(Math.floor(secs/60)).padStart(2,'0');
  const s = String(secs%60).padStart(2,'0');
  const el = document.getElementById('callStatusText');
  if(el) el.textContent = `${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  if(didInit) return; // guards against this handler somehow firing twice and creating duplicate realtime channels
  didInit = true;

  const session = await NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('messages.html', session);
  wireSidebarControls();

  if(!SagoBackend?.isConfigured()){
    document.getElementById('pinnedList').innerHTML = '';
    document.getElementById('allList').innerHTML = `<div class="muted-note" style="padding:20px;">Messages needs the Supabase backend connected — see assets/js/supabase-client.js.</div>`;
    return;
  }

  const authSession = await SagoBackend.getSession();
  if(!authSession){ window.location.href = 'login.html'; return; }
  backendUserId = authSession.user.id;

  await loadPeople();
  await loadConversations();
  for(const c of CONVERSATIONS) await loadMessages(c.id);
  CONVERSATIONS.forEach(c => recomputeUnread(c.id));

  subscribeRealtime();
  initCallSignaling();

  renderOnlineNow();
  renderConvList();
  document.getElementById('chatEmptyState')?.classList.add('show');
});

window.addEventListener('beforeunload', () => {
  if(!SagoBackend?.isConfigured()) return;
  if(realtimeChannel) SagoBackend.getClient().removeChannel(realtimeChannel);
  if(myCallChannel) SagoBackend.getClient().removeChannel(myCallChannel);
  if(outboundCallChannel) SagoBackend.getClient().removeChannel(outboundCallChannel);
  if(callState !== 'idle') endCall();
});
