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
    .on('postgres_changes', { event:'*', schema:'public', table:'message_reactions' }, async (payload) => {
      const msgId = payload.new?.message_id || payload.old?.message_id;
      if(!msgId) return;
      // reactions aren't embedded in the payload shape we need, so just refresh the one conversation's messages
      if(activeConvId) { await loadMessages(activeConvId); renderMessages(); }
    })
    .subscribe();
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
  const { data: newConv, error: convErr } = await sb.from('conversations').insert({ type:'dm', created_by: backendUserId }).select().single();
  if(convErr){ NexusApp.toast('Could not start conversation: ' + convErr.message, 'error'); return null; }

  const { error: memberErr } = await sb.from('conversation_members').insert([
    { conversation_id: newConv.id, user_id: backendUserId },
    { conversation_id: newConv.id, user_id: personId },
  ]);
  if(memberErr){
    NexusApp.toast('Could not start conversation: ' + memberErr.message, 'error');
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
  renderConvList();
  renderActiveHeader();
  renderMessages();
  renderInfoPanel();
  const input = document.getElementById('msgInput');
  if(input) input.focus();
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
function renderConvListRow(convId){
  if(!document.querySelector(`.conv-item[onclick="selectConversation('${convId}')"]`)){
    renderConvList(); // row doesn't exist yet (e.g. first message in a brand-new conversation) — fall back to a full rebuild
    return;
  }
  renderConvList();
}
function updateNotifBadge(){
  const total = Object.values(unreadCounts).reduce((s,n)=>s+n, 0);
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
  if(att.type === 'image') return `<div class="att-image"><i class="ri-image-2-line"></i><span>${att.label||'Photo'}</span></div>`;
  if(att.type === 'file') return `<div class="att-file"><div class="att-file-icon"><i class="ri-file-text-line"></i></div><div><b>${att.name}</b><small>${att.size}</small></div><i class="ri-download-2-line att-file-dl"></i></div>`;
  if(att.type === 'voice') return `<div class="att-voice" onclick="this.classList.toggle('playing')"><i class="ri-play-fill att-voice-icon"></i><div class="att-voice-wave">${Array.from({length:18}).map(()=>`<span style="height:${6+Math.round(Math.random()*16)}px"></span>`).join('')}</div><span class="att-voice-dur">${att.duration}</span></div>`;
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
  const { error } = await sb.from('message_reactions').insert({ message_id: msgId, user_id: backendUserId, emoji });
  if(error && error.code !== '23505'){ NexusApp.toast('Reaction failed: ' + error.message, 'error'); return; }
  const m = (MESSAGES[activeConvId]||[]).find(x=>x.id===msgId);
  if(m){ m.reactions = m.reactions || {}; m.reactions[emoji] = (m.reactions[emoji]||0)+1; renderMessages(); }
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
async function attachMock(type){
  document.getElementById('attachMenu').classList.remove('open');
  if(!activeConvId) return;
  let attachment;
  if(type==='image') attachment = { type:'image', label:'photo-'+Math.floor(Math.random()*900)+'.jpg' };
  if(type==='file') attachment = { type:'file', name:'shift-report.pdf', size:'188 KB' };
  if(type==='voice') attachment = { type:'voice', duration:'0:'+(10+Math.floor(Math.random()*40)) };
  const sb = SagoBackend.getClient();
  const { data, error } = await sb.from('messages')
    .insert({ conversation_id: activeConvId, sender_id: backendUserId, body:'', attachment })
    .select().single();
  if(error){ NexusApp.toast('Attachment failed: ' + error.message, 'error'); return; }

  if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
  if(!MESSAGES[activeConvId].some(m => m.id === data.id)){
    const mapped = mapDbMessage(data);
    MESSAGES[activeConvId].push(mapped);
    appendMessageDom(mapped);
    renderConvList();
  }
  NexusApp.toast((type[0].toUpperCase()+type.slice(1)) + ' attached', 'success');
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

  if(CONVERSATIONS.length){
    activeConvId = CONVERSATIONS[0].id;
    await markRead(activeConvId);
  }

  subscribeRealtime();

  renderOnlineNow();
  renderConvList();
  if(activeConvId){ renderActiveHeader(); renderMessages(); renderInfoPanel(); }
});

window.addEventListener('beforeunload', () => {
  if(realtimeChannel && SagoBackend?.isConfigured()) SagoBackend.getClient().removeChannel(realtimeChannel);
});
