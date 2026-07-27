/* ============================================================
   SAGERO CREATIONS — Messages module (Border-style layout)
============================================================ */

const MSG_PEOPLE = {
  'me': { name:'Alex Kimani', color:'#6D5DF6', online:true, role:'You' },
  'wei': { name:'Wei Zhang', color:'#3B82F6', online:true, role:'Chinese Manager' },
  'li': { name:'Li Chen', color:'#7C3AED', online:false, role:'Chinese Manager' },
  'feng': { name:'Feng Yun', color:'#4F46E5', online:true, role:'Chinese Manager' },
  'chao': { name:'Chao Liu', color:'#5B5CF6', online:false, role:'Chinese Manager' },
  'grace': { name:'Grace Achieng', color:'#4F46E5', online:true, role:'Unboxing' },
  'kevin': { name:'Kevin Otieno', color:'#5B5CF6', online:false, role:'Quality Check' },
  'mercy': { name:'Mercy Njoki', color:'#7C3AED', online:true, role:'Quality Check' },
  'samuel': { name:'Samuel Kiprono', color:'#3B82F6', online:false, role:'Resealing' },
  'peter': { name:'Peter Mutua', color:'#6D5DF6', online:true, role:'Packaging' },
  'joy': { name:'Joy Chebet', color:'#4F46E5', online:false, role:'Unboxing' },
  'dennisk': { name:'Dennis Kamau', color:'#5B5CF6', online:true, role:'Software Install' },
  'ruth': { name:'Ruth Wanjiku', color:'#7C3AED', online:false, role:'Quality Check' },
  'collins': { name:'Collins Odhiambo', color:'#3B82F6', online:true, role:'Resealing' },
  'faitha': { name:'Faith Auma', color:'#6D5DF6', online:false, role:'Packaging' },
  'esther': { name:'Esther Nyambura', color:'#4F46E5', online:true, role:'Software Install' },
  'brian': { name:'Brian Mwangi', color:'#3B82F6', online:true, role:'Salesman' },
  'faithk': { name:'Faith Kerubo', color:'#7C3AED', online:false, role:'Salesman' },
  'denniso': { name:'Dennis Otieno', color:'#5B5CF6', online:true, role:'Salesman' },
  'ann': { name:'Ann Wambui', color:'#6D5DF6', online:false, role:'Salesman' },
  'hr': { name:'HR Desk', color:'#7C3AED', online:true, role:'HR' },
};

const MENTIONABLE = Object.entries(MSG_PEOPLE).filter(([k])=>k!=='me').map(([k,v])=>({ id:k, name:v.name }));

function seedConversations(){
  return [
    { id:'c-floor', type:'channel', name:'production-floor', membersLabel:'24 Members, 6 Online', convPinned:true,
      description:'Daily coordination for the Vivo production line — unboxing through packaging.' },
    { id:'c-qc', type:'channel', name:'quality-control', membersLabel:'9 Members, 3 Online', convPinned:false,
      description:'Quality inspection queue, defect reports and reseal approvals.' },
    { id:'c-announce', type:'channel', name:'announcements', membersLabel:'42 Members, 11 Online', convPinned:true,
      description:'Company-wide announcements from HR and management.' },
    { id:'g-managers', type:'group', name:'Chinese Managers', membersLabel:'4 Members, 2 Online', convPinned:false,
      description:'Coordination group for Wei, Li, Feng and Chao on batch assignment.' },
    { id:'dm-wei', type:'dm', personId:'wei', convPinned:false },
    { id:'dm-grace', type:'dm', personId:'grace', convPinned:false },
    { id:'dm-kevin', type:'dm', personId:'kevin', convPinned:false },
    { id:'dm-brian', type:'dm', personId:'brian', convPinned:false },
    { id:'dm-hr', type:'dm', personId:'hr', convPinned:false },
  ];
}

function seedMessages(){
  const now = Date.now();
  const t = (minAgo) => new Date(now - minAgo*60000).toISOString();
  return {
    'c-floor': [
      { id:'m1', sender:'wei', text:'Morning team — vote for the meeting guys, when\u2019s the best time?', time:t(240), reactions:{}, pinned:true,
        poll:{ question:'Best time for today\u2019s sync?', options:[
          { label:'10:00 AM', votes:6 }, { label:'12:00 PM', votes:3 }, { label:'2:00 PM', votes:1 }
        ], myVote:null } },
      { id:'m2', sender:'grace', text:'Unboxing is done, moving to software install now.', time:t(210), reactions:{'👍':2}, pinned:false },
      { id:'m3', sender:'kevin', text:'QC queue is a bit backed up, will prioritise BX-1042.', time:t(180), reactions:{}, pinned:true },
      { id:'m4', sender:'me', text:'Thanks Kevin, appreciate it 🙏', time:t(170), reactions:{}, pinned:false },
      { id:'m5', sender:'brian', text:'Delivered 300 more Vivo Y18 units to the warehouse, ref BX-1051.', time:t(90), reactions:{'🎉':1}, pinned:false,
        attachment:{ type:'file', name:'delivery-note-BX-1051.pdf', size:'214 KB' } },
      { id:'m6', sender:'me', text:'Wait a minute, I\u2019ll check my schedule first', time:t(60), reactions:{}, pinned:false },
    ],
    'c-qc': [
      { id:'m1', sender:'kevin', text:'Failed 4 units from BX-1039 — screen defects. Photos attached.', time:t(300), reactions:{}, pinned:false,
        attachment:{ type:'image', label:'defect-photo-1.jpg' } },
      { id:'m2', sender:'wei', text:'Noted, please reseal the rest and flag the 4 for return.', time:t(280), reactions:{'👍':1}, pinned:false },
    ],
    'c-announce': [
      { id:'m1', sender:'hr', text:'Reminder: Warehouse B will run extended hours this Saturday for the Vivo Y-series batch. Overtime pay applies.', time:t(600), reactions:{'👍':6,'🎉':2}, pinned:true },
    ],
    'g-managers': [
      { id:'m1', sender:'li', text:'Can we sync on next week\u2019s production targets?', time:t(400), reactions:{}, pinned:false },
      { id:'m2', sender:'wei', text:'Yes — let\u2019s do Monday 9am before the floor opens.', time:t(390), reactions:{}, pinned:false },
    ],
    'dm-wei': [
      { id:'m1', sender:'wei', text:'Hey Alex, do you have the worker allocation for tomorrow\u2019s shift?', time:t(50), reactions:{}, pinned:false },
      { id:'m2', sender:'me', text:'Sending it over now, one sec.', time:t(45), reactions:{}, pinned:false },
    ],
    'dm-grace': [
      { id:'m1', sender:'grace', text:'Hit 312 units today \u2014 new personal best 🚀', time:t(70), reactions:{'🔥':1}, pinned:false },
    ],
    'dm-kevin': [
      { id:'m1', sender:'kevin', text:'Voice note attached re: the QC backlog', time:t(120), reactions:{}, pinned:false, attachment:{ type:'voice', duration:'0:34' } },
    ],
    'dm-brian': [
      { id:'m1', sender:'brian', text:'Next delivery is scheduled for Thursday morning.', time:t(500), reactions:{}, pinned:false },
    ],
    'dm-hr': [
      { id:'m1', sender:'hr', text:'Your payroll for this week has been processed ✅', time:t(200), reactions:{}, pinned:false },
    ],
  };
}

function seedFiles(){
  return [
    { name:'Preview shot webinar.ai', size:'29.2 MB', date:'26 Jun 2026' },
    { name:'Mountain shot travel.png', size:'12.3 MB', date:'24 Mar 2026' },
    { name:'Ramadan vibes.mp3', size:'5.7 MB', date:'2 Mar 2026' },
  ];
}

let CONVERSATIONS = [];
let MESSAGES = {};
let unreadState = {};
let activeConvId = 'c-floor';
let msgSearch = '';
let infoPanelOpen = true;

function loadMessagesState(){
  const savedConv = localStorage.getItem('nexus_conversations');
  const savedMsg = localStorage.getItem('nexus_messages');
  const savedUnread = localStorage.getItem('nexus_unread');
  CONVERSATIONS = savedConv ? JSON.parse(savedConv) : seedConversations();
  MESSAGES = savedMsg ? JSON.parse(savedMsg) : seedMessages();
  unreadState = savedUnread ? JSON.parse(savedUnread) : { 'c-qc':2, 'dm-kevin':1, 'g-managers':1 };
}
function persistConversations(){ localStorage.setItem('nexus_conversations', JSON.stringify(CONVERSATIONS)); }
function persistMessages(){ localStorage.setItem('nexus_messages', JSON.stringify(MESSAGES)); }
function persistUnread(){ localStorage.setItem('nexus_unread', JSON.stringify(unreadState)); }

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function convDisplayName(c){ return c.type === 'dm' ? MSG_PEOPLE[c.personId].name : c.name; }
function convAvatarColor(c){ return c.type === 'dm' ? MSG_PEOPLE[c.personId].color : (c.type==='group' ? '#7C3AED' : '#6D5DF6'); }
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
  if(m.attachment.type==='file') return '📎 '+m.attachment.name;
  if(m.attachment.type==='voice') return '🎤 Voice note';
  return 'Attachment';
}

/* ---------------- ONLINE NOW ---------------- */
function renderOnlineNow(){
  const wrap = document.getElementById('onlineNowRow');
  const online = Object.entries(MSG_PEOPLE).filter(([id,p]) => id!=='me' && p.online);
  wrap.innerHTML = online.map(([id,p]) => `
    <div class="online-avatar" data-tip="${p.name}" onclick="openDMWith('${id}')">
      <div class="avatar" style="width:40px;height:40px;font-size:13px;background:${p.color};">${initials(p.name)}</div>
      <span class="status-dot online"></span>
    </div>`).join('');
}
function openDMWith(personId){
  let conv = CONVERSATIONS.find(c => c.type==='dm' && c.personId===personId);
  if(!conv) conv = createDMConversation(personId);
  selectConversation(conv.id);
}
function createDMConversation(personId){
  const conv = { id:'dm-'+personId, type:'dm', personId, convPinned:false };
  CONVERSATIONS.push(conv);
  MESSAGES[conv.id] = [];
  persistConversations();
  persistMessages();
  return conv;
}

/* ---------------- NEW MESSAGE (COMPOSE) ---------------- */
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
  const people = Object.entries(MSG_PEOPLE).filter(([id]) => id !== 'me');
  const filtered = people.filter(([id,p]) => !composeSearch || p.name.toLowerCase().includes(composeSearch) || p.role.toLowerCase().includes(composeSearch));
  list.innerHTML = filtered.map(([id,p]) => {
    const hasConv = CONVERSATIONS.some(c => c.type==='dm' && c.personId===id);
    return `
    <div class="compose-opt" onclick="startNewConversation('${id}')">
      <div class="conv-avatar-wrap">
        <div class="avatar" style="width:36px;height:36px;font-size:12px;background:${p.color};">${initials(p.name)}</div>
        <span class="status-dot ${p.online?'online':'offline'}"></span>
      </div>
      <div class="compose-opt-meta"><b>${p.name}</b><small>${p.role}</small></div>
      ${hasConv ? '<span class="compose-existing">Message</span>' : '<span class="compose-new">Start chat</span>'}
    </div>`;
  }).join('') || `<div class="muted-note" style="padding:16px;">No one matches your search.</div>`;
}
function startNewConversation(personId){
  let conv = CONVERSATIONS.find(c => c.type==='dm' && c.personId===personId);
  const isNew = !conv;
  if(!conv) conv = createDMConversation(personId);
  NexusApp.closeModal('modal-compose');
  selectConversation(conv.id);
  renderConvList();
  if(isNew) NexusApp.toast(`Started a conversation with ${MSG_PEOPLE[personId].name}`, 'success');
}

/* ---------------- CONVERSATION LIST ---------------- */
function convRowHTML(c){
  const last = lastMessageOf(c.id);
  const unread = unreadState[c.id] || 0;
  const isDM = c.type === 'dm';
  const online = isDM && MSG_PEOPLE[c.personId].online;
  const lastText = last ? (last.text || attachmentPreviewText(last)) : 'No messages yet';
  const lastSender = last && last.sender === 'me' ? 'You: ' : '';
  return `
  <div class="conv-item ${c.id===activeConvId?'active':''}" onclick="selectConversation('${c.id}')">
    <div class="conv-avatar-wrap">
      ${isDM
        ? `<div class="avatar" style="width:42px;height:42px;font-size:13px;background:${convAvatarColor(c)};">${initials(convDisplayName(c))}</div>`
        : `<div class="avatar conv-icon-avatar" style="background:${convAvatarColor(c)};"><i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i></div>`}
      ${isDM ? `<span class="status-dot ${online?'online':'offline'}"></span>` : ''}
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
  document.getElementById('allList').innerHTML = rest.map(convRowHTML).join('') || `<div class="muted-note" style="padding:16px;">No conversations match.</div>`;
}

/* ---------------- ACTIVE CONVERSATION ---------------- */
function selectConversation(id){
  activeConvId = id;
  unreadState[id] = 0;
  persistUnread();
  renderConvList();
  renderActiveHeader();
  renderMessages();
  renderInfoPanel();
  const input = document.getElementById('msgInput');
  if(input) input.focus();
}

function renderActiveHeader(){
  const c = CONVERSATIONS.find(x=>x.id===activeConvId);
  if(!c) return;
  const isDM = c.type === 'dm';
  document.getElementById('activeAvatar').innerHTML = isDM
    ? initials(convDisplayName(c))
    : `<i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i>`;
  document.getElementById('activeAvatar').style.background = convAvatarColor(c);
  document.getElementById('activeName').textContent = convDisplayName(c);
  document.getElementById('activeSub').textContent = isDM
    ? (MSG_PEOPLE[c.personId].online ? 'Online' : 'Offline')
    : c.membersLabel;
  document.getElementById('activeStatusDot').style.display = isDM ? 'inline-block' : 'none';
  document.getElementById('activeStatusDot').className = 'status-dot-inline ' + (isDM && MSG_PEOPLE[c.personId].online ? 'online' : 'offline');
}

/* ---------------- MESSAGES RENDER ---------------- */
function dayLabel(iso){
  const d = new Date(iso), today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  if(isToday) return 'Today';
  if(d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
}

function renderMessages(){
  const msgs = MESSAGES[activeConvId] || [];
  const wrap = document.getElementById('msgList');
  let html = '';
  let lastSender = null;
  let lastDay = null;

  msgs.forEach((m) => {
    const day = dayLabel(m.time);
    if(day !== lastDay){
      html += `<div class="day-divider"><span>${day}</span></div>`;
      lastDay = day; lastSender = null;
    }
    const grouped = m.sender === lastSender;
    const person = MSG_PEOPLE[m.sender];
    const isMe = m.sender === 'me';
    html += `
    <div class="msg-row ${isMe?'me':''} ${grouped?'grouped':''}" data-id="${m.id}">
      ${!grouped ? `<div class="avatar" style="width:32px;height:32px;font-size:11px;background:${person.color};">${initials(person.name)}</div>` : `<div class="avatar-spacer"></div>`}
      <div class="msg-bubble-col">
        ${!grouped ? `<div class="msg-head"><span class="msg-sender">${person.name}</span><span class="msg-time">${new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>${m.pinned?'<i class="ri-pushpin-2-fill msg-pin-flag" data-tip="Pinned"></i>':''}</div>` : ''}
        <div class="msg-bubble ${m.poll?'has-poll':''}">
          ${m.text ? `<div class="msg-text">${renderMentions(m.text)}</div>` : ''}
          ${m.attachment ? renderAttachment(m.attachment) : ''}
          ${m.poll ? renderPoll(m.id, m.poll) : ''}
        </div>
        ${Object.keys(m.reactions||{}).length ? `<div class="msg-reactions">${Object.entries(m.reactions).map(([emoji,count])=>`<span class="reaction-chip" onclick="toggleReaction('${m.id}','${emoji}')">${emoji} ${count}</span>`).join('')}</div>` : ''}
        ${isMe ? `<div class="read-receipt"><i class="ri-check-double-line"></i></div>` : ''}
        <div class="msg-hover-actions">
          <button data-tip="React" onclick="openReactPicker(event,'${m.id}')"><i class="ri-emotion-line"></i></button>
          <button data-tip="${m.pinned?'Unpin':'Pin'}" onclick="togglePin('${m.id}')"><i class="ri-pushpin-2-${m.pinned?'fill':'line'}"></i></button>
        </div>
      </div>
    </div>`;
    lastSender = m.sender;
  });
  wrap.innerHTML = html;
  renderPinnedBanner();
  scrollToBottom();
}

function renderPinnedBanner(){
  const msgs = MESSAGES[activeConvId] || [];
  const pinned = msgs.filter(m => m.pinned);
  const banner = document.getElementById('pinnedBanner');
  if(pinned.length === 0){ banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const first = pinned[0];
  document.getElementById('pinnedText').textContent = `${MSG_PEOPLE[first.sender].name}: ${first.text || attachmentPreviewText(first)}`;
  document.getElementById('pinnedCount').textContent = pinned.length > 1 ? `+${pinned.length-1} more` : '';
}

function renderMentions(text){
  return text.replace(/@([A-Za-z]+)/g, (match, name) => {
    const found = MENTIONABLE.find(p => p.name.toLowerCase().startsWith(name.toLowerCase()));
    return found ? `<span class="mention-chip">@${found.name.split(' ')[0]}</span>` : match;
  });
}
function renderAttachment(att){
  if(att.type === 'image'){
    return `<div class="att-image"><i class="ri-image-2-line"></i><span>${att.label||'Photo'}</span></div>`;
  }
  if(att.type === 'file'){
    return `<div class="att-file"><div class="att-file-icon"><i class="ri-file-text-line"></i></div><div><b>${att.name}</b><small>${att.size}</small></div><i class="ri-download-2-line att-file-dl"></i></div>`;
  }
  if(att.type === 'voice'){
    return `<div class="att-voice" onclick="this.classList.toggle('playing')"><i class="ri-play-fill att-voice-icon"></i><div class="att-voice-wave">${Array.from({length:18}).map(()=>`<span style="height:${6+Math.round(Math.random()*16)}px"></span>`).join('')}</div><span class="att-voice-dur">${att.duration}</span></div>`;
  }
  return '';
}

/* ---------------- POLL ---------------- */
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
function votePoll(msgId, optionIndex){
  const msgs = MESSAGES[activeConvId];
  const m = msgs.find(x=>x.id===msgId);
  if(!m || !m.poll) return;
  const poll = m.poll;
  if(poll.myVote === optionIndex){
    poll.options[optionIndex].votes--;
    poll.myVote = null;
  } else {
    if(poll.myVote !== null) poll.options[poll.myVote].votes--;
    poll.options[optionIndex].votes++;
    poll.myVote = optionIndex;
  }
  persistMessages();
  renderMessages();
}

function scrollToBottom(){
  const wrap = document.getElementById('msgList');
  wrap.scrollTop = wrap.scrollHeight;
}

/* ---------------- REACTIONS / PINS ---------------- */
const QUICK_EMOJIS = ['👍','❤️','😂','🎉','🔥','🙏','👏','😮'];

function toggleReaction(msgId, emoji){
  const msgs = MESSAGES[activeConvId];
  const m = msgs.find(x=>x.id===msgId);
  if(!m) return;
  if(!m.reactions) m.reactions = {};
  m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
  persistMessages();
  renderMessages();
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
function togglePin(msgId){
  const msgs = MESSAGES[activeConvId];
  const m = msgs.find(x=>x.id===msgId);
  if(!m) return;
  m.pinned = !m.pinned;
  persistMessages();
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

/* ---------------- SEND / TYPING / ATTACH / MENTIONS ---------------- */
function genId(){ return 'm'+Date.now()+Math.floor(Math.random()*999); }

function sendMessage(){
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if(!text) return;
  if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
  MESSAGES[activeConvId].push({ id:genId(), sender:'me', text, time:new Date().toISOString(), reactions:{}, pinned:false });
  persistMessages();
  input.value = '';
  autoGrow(input);
  renderMessages();
  renderConvList();
  maybeAutoReply();
}
function handleInputKey(e){
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
}
function autoGrow(el){ el.style.height='auto'; el.style.height = Math.min(120, el.scrollHeight)+'px'; }

function maybeAutoReply(){
  const c = CONVERSATIONS.find(x=>x.id===activeConvId);
  if(!c || c.type !== 'dm') return;
  const person = MSG_PEOPLE[c.personId];
  if(!person.online) return;

  showTyping(person.name);
  const replies = ['Got it, thanks!', 'Sounds good 👍', 'On it now.', 'Let me check and get back to you.', 'Perfect, appreciate the update.'];
  const reply = replies[Math.floor(Math.random()*replies.length)];

  setTimeout(() => {
    hideTyping();
    MESSAGES[activeConvId].push({ id:genId(), sender:c.personId, text:reply, time:new Date().toISOString(), reactions:{}, pinned:false });
    persistMessages();
    renderMessages();
    renderConvList();
  }, 1600);
}
function showTyping(name){
  document.getElementById('typingIndicator').style.display = 'flex';
  document.getElementById('typingName').textContent = name;
  scrollToBottom();
}
function hideTyping(){ document.getElementById('typingIndicator').style.display = 'none'; }

/* attachments */
function toggleAttachMenu(){ document.getElementById('attachMenu').classList.toggle('open'); }
function attachMock(type){
  document.getElementById('attachMenu').classList.remove('open');
  if(!MESSAGES[activeConvId]) MESSAGES[activeConvId] = [];
  let attachment;
  if(type==='image') attachment = { type:'image', label:'photo-'+Math.floor(Math.random()*900)+'.jpg' };
  if(type==='file') attachment = { type:'file', name:'shift-report.pdf', size:'188 KB' };
  if(type==='voice') attachment = { type:'voice', duration:'0:'+(10+Math.floor(Math.random()*40)) };
  MESSAGES[activeConvId].push({ id:genId(), sender:'me', text:'', time:new Date().toISOString(), reactions:{}, pinned:false, attachment });
  persistMessages();
  renderMessages();
  renderConvList();
  NexusApp.toast((type[0].toUpperCase()+type.slice(1)) + ' attached', 'success');
}

/* emoji picker for composer */
function toggleEmojiPicker(){
  const pop = document.getElementById('emojiPopover');
  pop.innerHTML = QUICK_EMOJIS.map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('');
  pop.classList.toggle('open');
}
function insertEmoji(e){
  const input = document.getElementById('msgInput');
  input.value += e;
  input.focus();
}

/* mention autocomplete */
function handleInputChange(){
  const input = document.getElementById('msgInput');
  autoGrow(input);
  const val = input.value;
  const caretAtMention = /@([A-Za-z]*)$/.exec(val);
  const pop = document.getElementById('mentionPopover');
  if(caretAtMention){
    const q = caretAtMention[1].toLowerCase();
    const matches = MENTIONABLE.filter(p => p.name.toLowerCase().includes(q));
    if(matches.length){
      pop.innerHTML = matches.map(p => `<div class="mention-opt" onclick="pickMention('${p.name.replace(/'/g,"")}')"><span>${initials(p.name)}</span>${p.name}</div>`).join('');
      pop.classList.add('open');
    } else pop.classList.remove('open');
  } else {
    pop.classList.remove('open');
  }
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

  document.getElementById('infoAvatar').innerHTML = isDM ? initials(convDisplayName(c)) : `<i class="${c.type==='channel'?'ri-hashtag':'ri-group-line'}"></i>`;
  document.getElementById('infoAvatar').style.background = convAvatarColor(c);
  document.getElementById('infoName').textContent = convDisplayName(c);
  document.getElementById('infoSub').textContent = isDM ? (MSG_PEOPLE[c.personId].online?'Online':'Offline') : c.membersLabel;
  document.getElementById('infoDescription').textContent = isDM
    ? `Direct messages with ${convDisplayName(c)}.`
    : (c.description || 'No description yet.');
  document.getElementById('infoDescTitle').style.display = 'block';

  const msgs = MESSAGES[activeConvId] || [];
  const mediaCount = msgs.filter(m => m.attachment && m.attachment.type==='image').length + 12;
  document.getElementById('infoMediaCount').textContent = mediaCount;

  const files = seedFiles();
  document.getElementById('infoFilesList').innerHTML = files.map(f => `
    <div class="info-file-row">
      <div class="att-file-icon"><i class="ri-file-text-line"></i></div>
      <div><b>${f.name}</b><small>${f.size} · ${f.date}</small></div>
    </div>`).join('');
}

function toggleInfoPanel(){
  infoPanelOpen = !infoPanelOpen;
  document.getElementById('msgShell').classList.toggle('info-hidden', !infoPanelOpen);
}

/* ---------------- SEARCH ---------------- */
function wireSidebarControls(){
  document.getElementById('convSearch').addEventListener('input', e => { msgSearch = e.target.value.trim().toLowerCase(); renderConvList(); });
  document.getElementById('composeSearch').addEventListener('input', e => { composeSearch = e.target.value.trim().toLowerCase(); renderComposeList(); });
}

document.addEventListener('DOMContentLoaded', () => {
  const session = NexusApp.requireAuth();
  if(!session) return;
  NexusApp.initShell('messages.html', session);
  loadMessagesState();
  wireSidebarControls();
  renderOnlineNow();
  renderConvList();
  renderActiveHeader();
  renderMessages();
  renderInfoPanel();
});
