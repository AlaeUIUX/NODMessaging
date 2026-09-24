// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
export function runPrototype(): () => void {

  // ---------- data ----------
  const AV = {
    charles:'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=120&q=70&fm=jpg',
    roya:'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=120&q=70&fm=jpg',
    jamshed:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=70&fm=jpg',
    me:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&q=70&fm=jpg'
  };

  const members = [
    {name:'Charles', avatar:AV.charles},
    {name:'Roya', avatar:AV.roya},
    {name:'Jamshed', avatar:AV.jamshed},
  ];

  function seedDm(){
    return [
      {id:1, from:'them', type:'text', text:"Hey, I've finished the requirements doc!"},
      {id:2, from:'them', type:'file', fname:'Tech requirements.pdf', fsize:'1.2 MB'},
      {id:3, from:'them', type:'text', text:'Good timing — was just looking at this.'},
      {id:4, from:'them', type:'voice', dur:'0:28'},
      {id:'divider-today', type:'divider', label:'Today'},
      {id:5, from:'me', type:'text', text:'I submitted a new attachment btw', status:'read'},
      {id:6, from:'them', type:'text', text:'Can you review the latest implementation when you get a sec?'},
      {id:7, from:'me', type:'text', text:"Sure thing, I'll have a look at it today.", status:'read', reactions:[{emoji:'❤️'}]},
    ];
  }
  function seedGroup(){
    return [
      {id:1, from:'them', who:'Charles', av:AV.charles, type:'text', text:"Hey team, I've finished with the requirements doc!"},
      {id:2, from:'them', who:'Charles', av:AV.charles, type:'file', fname:'Tech requirements.pdf', fsize:'1.2 MB'},
      {id:3, from:'them', who:'Roya', av:AV.roya, type:'text', text:'Same! I do like it'},
      {id:4, from:'them', who:'Jamshed', av:AV.jamshed, type:'text', text:'Don\u2019t you guys think it\u2019d be nice to add a QR code at the end for clients?'},
      {id:'divider-today', type:'divider', label:'Today'},
      {id:5, from:'me', type:'text', text:'I submitted a new attachment btw', status:'read'},
      {id:6, from:'them', who:'Roya', av:AV.roya, type:'text', text:'@Charles can you please review the latest implementation?'},
      {id:7, from:'me', type:'text', text:"Sure thing, I'll have a look at it today.", status:'read', reactions:[{emoji:'❤️'}]},
    ];
  }

  const dmOlder = [
    {id:'o1', from:'them', type:'text', text:'Morning! Quick one before you start —'},
    {id:'o2', from:'them', type:'text', text:'did the client sign off on the last round of changes?'},
  ];
  const groupOlder = [
    {id:'o1', from:'them', who:'Jamshed', av:AV.jamshed, type:'text', text:'Standup notes are in the doc if anyone missed it'},
    {id:'o2', from:'them', who:'Charles', av:AV.charles, type:'text', text:'Thanks for pulling that together 🙏'},
  ];

  const collections = ['Trip GRP','Work','Personal'];

  const unassigned = [
    {id:'u1', kind:'message', tag:'Message', quote:'Can you review the latest implementation when you get a sec?', source:'Saved from Charles · DM'},
    {id:'u2', kind:'photo', tag:'Photo', img:'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=500&q=65', source:'Saved from Trip GRP'},
    {id:'u3', kind:'link', tag:'Link', quote:'nod.design/changelog', source:'Shared in #General'},
  ];

  const state = {
    activeTab:'chats',
    activeChat:null,
    dm: seedDm(),
    group: seedGroup(),
    replyTarget:null,
    selectMode:false,
    selectedIds:new Set(),
    mindEmpty:false,
    dmOlderLoaded:false,
    groupOlderLoaded:false,
    orgIndex:0,
    lastTap:null,
    pendingSave:null,
    mindView:'masonry',
    mindFilter:'all',
    mindBoard:null,
    pinnedIds:new Set(),
  };

  const mindCards = [
    {id:'c1', tag:'Ticket', kind:'ticket', title:'Ryanair · LIS', who:'Charles', whoAv:AV.charles, when:'2d ago', date:'Jun 14', collection:'Trip GRP'},
    {id:'c2', tag:'Poll', kind:'poll', title:'Which dates work?', who:'Trip GRP', whoAv:AV.roya, when:'4d ago', date:'Jun 12', collection:'Trip GRP',
      poll:[{label:'Fri 21', pct:62},{label:'Sat 22', pct:24},{label:'Sun 23', pct:14}]},
    {id:'c3', tag:'Photo', kind:'photo', img:'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=400&q=65', who:'Trip GRP', whoAv:AV.jamshed, when:'4d ago', date:'Jun 12', collection:'Trip GRP'},
    {id:'c4', tag:'Location', kind:'location', title:'Belém Tower', who:'Trip GRP', whoAv:AV.charles, when:'4d ago', date:'Jun 12', collection:'Trip GRP'},
    {id:'c5', tag:'Checklist', kind:'checklist', title:'Pre‑trip checklist', who:'Trip GRP', whoAv:AV.roya, when:'5d ago', date:'Jun 11', collection:'Trip GRP',
      items:['Book transfers','Pack chargers','Confirm check‑in time']},
    {id:'c6', tag:'Photo', kind:'photo', img:'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=400&q=65', who:'Charles', whoAv:AV.charles, when:'1w ago', date:'Jun 8', collection:'Personal'},
  ];

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const app = $('#phone');
  function toast(msg, icon=true){
    const t = $('#toast');
    t.innerHTML = (icon?'<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>':'')+'<span>'+msg+'</span>';
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(()=>t.classList.remove('show'), 1800);
  }

  // ---------- tab bar ----------
  const tabs = ['chats','mind','spaces','explore'];
  function setPill(index){
    $('#pill-ind').style.transform = `translateX(${index*100}%)`;
  }
  function showTab(name, push){
    state.activeTab = name;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    setPill(tabs.indexOf(name));
    $('#screen-inbox').style.display = name==='chats' && !state.activeChat ? 'flex':'none';
    $('#screen-mind').style.display = name==='mind' ? 'flex':'none';
    $('#screen-spaces').style.display = name==='spaces' ? 'flex':'none';
    $('#screen-explore').style.display = name==='explore' ? 'flex':'none';
    if(name==='chats' && state.activeChat){
      // stay in chat detail; hide inbox behind
      $('#screen-inbox').style.display='none';
    }
    if(name==='mind') runMindEntrance();
  }
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.tab==='chats'){ closeChat(true); }
      showTab(btn.dataset.tab);
    });
  });

  // ---------- inbox ----------
  function renderInbox(){
    const list = $('#inbox-list');
    const lastDm = state.dm.filter(m=>m.type!=='divider').slice(-1)[0];
    const lastGroup = state.group.filter(m=>m.type!=='divider').slice(-1)[0];
    const rows = [
      {id:'dm', name:'Charles', avatar:AV.charles, preview: previewOf(lastDm), time:'9:41', unread:0, online:true},
      {id:'group', name:'TheNOD Team · #General', avatar:AV.roya, preview: previewOf(lastGroup), time:'9:38', unread:2, online:false},
    ];
    list.innerHTML = rows.map(r=>`
      <div class="inbox-row" data-chat="${r.id}">
        <div class="avatar-wrap"><img class="avatar" src="${r.avatar}">${r.online?'<span class="online-dot"></span>':''}</div>
        <div class="inbox-meta">
          <div class="row1"><span class="name">${r.name}</span><span class="time">${r.time}</span></div>
          <div class="row1"><span class="preview">${r.preview}</span>${r.unread?`<span class="unread-badge">${r.unread}</span>`:''}</div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.inbox-row').forEach(row=>{
      row.addEventListener('click', ()=>openChat(row.dataset.chat));
    });
  }
  function previewOf(m){
    if(!m) return '';
    if(m.type==='text') return m.text;
    if(m.type==='file') return '📎 '+m.fname;
    if(m.type==='voice') return '🎤 Voice message';
    return '';
  }

  // ---------- chat detail ----------
  function openChat(id){
    state.activeChat = id;
    const isGroup = id==='group';
    $('#chat-avatar').src = isGroup ? AV.roya : AV.charles;
    $('#chat-online').style.display = isGroup ? 'none':'block';
    $('#chat-name').textContent = isGroup ? 'TheNOD Team · #General' : 'Charles';
    $('#chat-status').textContent = 'Active now';
    $('#chat-status').classList.remove('typing');
    $('#composer-input').placeholder = isGroup ? 'Message #General' : 'Message Charles';
    $('#screen-chat').classList.remove('push-in');
    $('#screen-inbox').classList.add('push-out');
    renderChat();
    updateSmartReplies();
  }
  function closeChat(silent){
    state.activeChat = null;
    $('#screen-chat').classList.add('push-in');
    $('#screen-inbox').classList.remove('push-out');
    $('#screen-inbox').style.display='flex';
    if(!silent) renderInbox();
  }
  $('#chat-back').addEventListener('click', ()=>{ closeChat(); renderInbox(); showTab('chats'); });

  function currentThread(){ return state.activeChat==='group' ? state.group : state.dm; }

  function renderChat(){
    const body = $('#chat-body');
    body.innerHTML = '';
    body.appendChild(renderLoadEarlier());
    currentThread().forEach(m=>body.appendChild(renderMessage(m)));
    body.scrollTop = body.scrollHeight;
  }
  function loadedFlagKey(){ return state.activeChat==='group' ? 'groupOlderLoaded' : 'dmOlderLoaded'; }
  function renderLoadEarlier(){
    const wrap = document.createElement('div');
    if(state[loadedFlagKey()]){ wrap.style.display='none'; return wrap; }
    wrap.className='pull-loader show';
    wrap.style.cursor='pointer';
    wrap.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span>Load earlier messages</span>`;
    wrap.addEventListener('click', loadEarlier);
    return wrap;
  }
  function loadEarlier(){
    const body = $('#chat-body');
    const loader = body.firstElementChild;
    if(!loader || loader._loading) return;
    loader._loading = true;
    const prevHeight = body.scrollHeight;
    loader.innerHTML = `<span class="pull-spinner"></span><span>Loading earlier messages…</span>`;
    setTimeout(()=>{
      state[loadedFlagKey()] = true;
      const older = state.activeChat==='group' ? groupOlder : dmOlder;
      const thread = currentThread();
      thread.unshift(...older);
      loader.remove();
      let ref = body.firstElementChild;
      // Animate the .msg-stack, not the row, so avatars stay put while bubbles
      // launch (see .msg-row.mine .msg-stack.msg-enter in globals.css). Staggered
      // per index — generic burst support, ready for any future multi-message send.
      older.forEach((m,i)=>{
        const el = renderMessage(m);
        const stack = el.querySelector('.msg-stack');
        if(stack){ stack.classList.add('msg-enter'); stack.style.animationDelay = (i*45)+'ms'; }
        body.insertBefore(el, ref);
      });
      const newHeight = body.scrollHeight;
      body.scrollTop = newHeight - prevHeight;
    }, 750);
  }

  function renderMessage(m){
    if(m.type==='divider'){
      const d = document.createElement('div');
      d.className='day-divider';
      d.innerHTML = `<div class="line"></div><span>${m.label}</span><div class="line"></div>`;
      return d;
    }
    const row = document.createElement('div');
    row.className = 'msg-row' + (m.from==='me' ? ' mine':'');
    row.dataset.id = m.id;

    let inner = '';
    if(m.from!=='me'){
      inner += `<img class="msg-avatar" src="${m.av||AV.charles}">`;
    }
    let bubbleHtml = '';
    if(m.type==='text'){
      bubbleHtml = `<div class="bubble" data-mid="${m.id}">${formatMessageText(m.text)}<span class="swipe-hint"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4M5 10h14"/></svg></span></div>`;
    } else if(m.type==='file'){
      bubbleHtml = `<div class="msg-file" data-mid="${m.id}">
        <div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
        <div><div class="fname">${m.fname}</div><div class="fsize">${m.fsize}</div></div></div>`;
    } else if(m.type==='voice'){
      const bars = Array.from({length:26},(_,i)=>4+Math.round(Math.abs(Math.sin(i*0.9+m.id))*16)).join(',');
      bubbleHtml = `<div class="msg-voice" data-mid="${m.id}" data-played="0">
        <div class="voice-play"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></div>
        <div class="voice-wave">${bars.split(',').map(h=>`<i style="height:${h}px"></i>`).join('')}</div>
        <span class="voice-time">${m.dur}</span></div>`;
    }
    const statusHtml = (m.from==='me' && m.status) ? renderStatus(m) : '';
    const reactionsHtml = m.reactions && m.reactions.length
      ? `<div class="reactions-row">${m.reactions.map(r=>`<span class="reaction-chip">${r.emoji}</span>`).join('')}<span class="add-reaction-btn" data-add-reaction="${m.id}"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span></div>`
      : '';

    inner += `<div class="msg-stack">${bubbleHtml}${statusHtml}${(m.type==='text'||m.type==='file')?reactionsHtml:''}</div>`;
    row.innerHTML = inner;
    return row;
  }

  function renderStatus(m){
    if(m.status==='sent') return `<div class="status-line">Sent</div>`;
    if(m.status==='delivered') return `<div class="status-line">Delivered</div>`;
    if(m.status==='read') return `<div class="status-line"><img src="${AV.charles}">Read</div>`;
    return '';
  }

  function formatMessageText(text){
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const lines = esc(text).split('\n').map(line=>{
      let heading = false;
      if(line.startsWith('# ')){ heading = true; line = line.slice(2); }
      line = line
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/~~(.+?)~~/g, '<s>$1</s>')
        .replace(/(^|[^_])_(.+?)_(?!_)/g, '$1<i>$2</i>')
        .replace(/@([A-Za-z]+)/g, '<span class="mention-tag">@$1</span>');
      return heading ? `<span style="font-weight:600; font-size:1.1em;">${line}</span>` : line;
    });
    return lines.join('<br>');
  }

  // ---------- sending ----------
  const input = $('#composer-input');
  const sendBtn = $('#send-btn');
  function updateSendBtn(){
    const has = input.value.trim().length>0;
    sendBtn.classList.toggle('arrow', has);
    sendBtn.classList.toggle('mic', !has);
    sendBtn.innerHTML = has
      ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>`;
  }
  input.addEventListener('input', ()=>{
    updateSendBtn();
    handleMentionTyping();
  });

  function doSend(text){
    if(!text || !text.trim()) return;
    const thread = currentThread();
    thread.forEach(m=>{ if(m.from==='me') delete m.status; });
    const msg = {id:'m'+Date.now(), from:'me', type:'text', text:text.trim(), status:'sent'};
    if(state.replyTarget){
      msg.text = text.trim();
    }
    thread.push(msg);
    const body = $('#chat-body');
    const el = renderMessage(msg);
    el.querySelector('.msg-stack')?.classList.add('msg-enter');
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    input.value='';
    updateSendBtn();
    clearReply();
    $('#smart-replies').style.display='none';

    setTimeout(()=>{ msg.status='delivered'; refreshStatusLine(msg); }, 700);
    setTimeout(()=>{ showTyping(true); }, 1200);
    setTimeout(()=>{
      showTyping(false);
      const reply = pickAutoReply(text);
      const rmsg = {id:'m'+Date.now()+1, from:'me'==='them'?'me':'them', who: state.activeChat==='group'?'Charles':undefined, av:AV.charles, type:'text', text:reply};
      thread.push(rmsg);
      const el2 = renderMessage(rmsg);
      el2.querySelector('.msg-stack')?.classList.add('msg-enter');
      body.appendChild(el2);
      body.scrollTop = body.scrollHeight;
      msg.status='read';
      refreshStatusLine(msg);
      updateSmartReplies();
    }, 2600);
  }
  function refreshStatusLine(msg){
    const row = $(`.msg-row[data-id="${msg.id}"]`);
    if(!row) return;
    const old = row.querySelector('.status-line');
    const html = renderStatus(msg);
    if(old) old.outerHTML = html; else {
      const stack = row.querySelector('.msg-stack');
      const bub = stack.querySelector('.bubble, .msg-file, .msg-voice');
      if(bub) bub.insertAdjacentHTML('afterend', html);
    }
  }
  let typingExitTimer=null;
  function showTyping(on){
    const body = $('#chat-body');
    let el = $('#typing-row');
    $('#chat-status').textContent = on ? (state.activeChat==='group'?'Charles is typing…':'typing…') : 'Active now';
    $('#chat-status').classList.toggle('typing', on);
    if(on){
      clearTimeout(typingExitTimer);
      if(el){ el.classList.remove('typing-row-exit'); el.classList.add('typing-row-enter'); return; }
      const row = document.createElement('div');
      row.className='msg-row typing-row-enter'; row.id='typing-row';
      row.innerHTML = `<img class="msg-avatar" src="${AV.charles}"><div class="msg-stack"><div class="typing-bubble"><span></span><span></span><span></span></div></div>`;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    } else if(el){
      // Shrink out instead of an abrupt remove(); see .typing-row-exit in globals.css.
      el.classList.remove('typing-row-enter');
      el.classList.add('typing-row-exit');
      clearTimeout(typingExitTimer);
      typingExitTimer = setTimeout(()=>{ el.remove(); }, 190);
    }
  }
  function pickAutoReply(userText){
    const t = userText.toLowerCase();
    if(t.includes('review')||t.includes('look')) return "Appreciate it — no rush though.";
    if(t.includes('thanks')||t.includes('thank')) return "Anytime 🙂";
    if(t.includes('call')||t.includes('meet')) return "Works for me, I'll send an invite.";
    const pool = ["Sounds good.", "Got it, thank you!", "Perfect, talk soon.", "👍", "Makes sense to me."];
    return pool[Math.floor(Math.random()*pool.length)];
  }
  sendBtn.addEventListener('click', ()=>{
    if(sendBtn.classList.contains('arrow')) doSend(input.value);
  });
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') doSend(input.value); });

  // ---------- expanded rich composer ----------
  const composerWrap = $('#composer-wrap');
  const cccEditable = $('#ccc-editable');
  const cccSendBtn = $('#ccc-send-btn');

  function autoGrow(){
    cccEditable.style.height = 'auto';
    cccEditable.style.height = Math.min(cccEditable.scrollHeight, 150) + 'px';
  }
  function expandComposer(){
    cccEditable.value = input.value;
    composerWrap.classList.add('expanded');
    autoGrow();
    cccEditable.focus();
    updateCccSendState();
  }
  function collapseComposer(syncBack){
    composerWrap.classList.remove('expanded');
    if(syncBack){
      input.value = cccEditable.value;
      updateSendBtn();
    }
  }
  $('#fmt-btn').addEventListener('click', expandComposer);
  $('#ctb-collapse-btn').addEventListener('click', ()=> collapseComposer(true));

  function updateCccSendState(){
    cccSendBtn.disabled = !cccEditable.value.trim();
  }
  cccEditable.addEventListener('input', ()=>{ autoGrow(); updateCccSendState(); });
  cccEditable.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      sendFromExpanded();
    }
  });
  function sendFromExpanded(){
    const text = cccEditable.value;
    if(!text.trim()) return;
    doSend(text);
    cccEditable.value = '';
    autoGrow();
    updateCccSendState();
    input.value = '';
    updateSendBtn();
    collapseComposer(false);
  }
  cccSendBtn.addEventListener('click', sendFromExpanded);

  // formatting toolbar: wraps the current selection (or inserts markers at the cursor)
  function wrapSelection(before, after){
    const start = cccEditable.selectionStart, end = cccEditable.selectionEnd;
    const val = cccEditable.value;
    const selected = val.slice(start, end);
    cccEditable.value = val.slice(0, start) + before + selected + after + val.slice(end);
    const cursor = selected ? start + before.length + selected.length + after.length : start + before.length;
    cccEditable.focus();
    cccEditable.setSelectionRange(cursor, cursor);
    autoGrow();
    updateCccSendState();
  }
  function prefixCurrentLine(marker){
    const start = cccEditable.selectionStart;
    const val = cccEditable.value;
    const lineStart = val.lastIndexOf('\n', start-1) + 1;
    if(val.slice(lineStart, lineStart+marker.length) === marker){
      cccEditable.value = val.slice(0, lineStart) + val.slice(lineStart+marker.length);
    } else {
      cccEditable.value = val.slice(0, lineStart) + marker + val.slice(lineStart);
    }
    cccEditable.focus();
    autoGrow();
    updateCccSendState();
  }
  document.querySelectorAll('.ctb-fmt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      btn.classList.toggle('active');
      const kind = btn.dataset.fmt;
      if(kind==='bold') wrapSelection('**','**');
      else if(kind==='italic') wrapSelection('_','_');
      else if(kind==='strike') wrapSelection('~~','~~');
      else if(kind==='underline') toast('Underline applied to selection');
      else if(kind==='heading') prefixCurrentLine('# ');
    });
  });
  document.querySelectorAll('.ctb-icon[data-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const act = btn.dataset.act;
      if(act==='poll') toast('Poll builder opened');
      else if(act==='checklist') toast('Checklist inserted');
      else if(act==='reminder') toast('Reminder set for this message');
      else if(act==='gif') toast('GIF picker opened');
      else if(act==='code') wrapSelection('`','`');
    });
  });
  $('#ctb-aa').addEventListener('click', ()=> toast('Choose a text style'));
  document.querySelectorAll('.ccc-icon[data-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const act = btn.dataset.act;
      if(act==='add') toast('Attach a file');
      else if(act==='image') toast('Choose a photo');
      else if(act==='clock') toast('Schedule this message');
    });
  });
  const cccMic = $('#ccc-mic');
  let cccPressTimer = null;
  cccMic.addEventListener('pointerdown', ()=>{ cccPressTimer = setTimeout(()=>{ cccMic.classList.add('recording'); startRecording(); }, 160); });
  cccMic.addEventListener('pointerup', ()=>{
    clearTimeout(cccPressTimer);
    cccMic.classList.remove('recording');
    if(overlay.style.display==='flex'){ stopRecording(true); collapseComposer(false); }
  });
  cccMic.addEventListener('pointerleave', ()=>{
    clearTimeout(cccPressTimer);
    cccMic.classList.remove('recording');
    if(overlay.style.display==='flex') stopRecording(false);
  });

  // ---------- smart replies ----------
  function updateSmartReplies(){
    const thread = currentThread();
    const last = thread.filter(m=>m.type==='text').slice(-1)[0];
    const box = $('#smart-replies');
    if(!last || last.from==='me' || input.value.trim()){ box.style.display='none'; return; }
    let chips;
    const t = (last.text||'').toLowerCase();
    if(t.includes('review')) chips = ["On it 👍","Will do today","Can't right now"];
    else if(t.includes('qr')||t.includes('code')) chips = ["Love that idea","Let's discuss","Not sure yet"];
    else chips = ["Sounds good","Thanks!","Got it 👍"];
    box.innerHTML = chips.map(c=>`<button class="smart-chip">${c}</button>`).join('');
    box.style.display='flex';
    box.querySelectorAll('.smart-chip').forEach(btn=>{
      btn.addEventListener('click', ()=>doSend(btn.textContent));
    });
  }

  // ---------- reply preview (swipe-to-reply) ----------
  function setReply(msg){
    state.replyTarget = msg;
    const slot = $('#reply-preview-slot');
    const snippet = msg.type==='text' ? msg.text : (msg.type==='file'?msg.fname:'Voice message');
    slot.innerHTML = `<div class="reply-preview">
      <div class="rp-text"><b>Replying to ${msg.from==='me'?'yourself':(msg.who||'Charles')}</b><span>${snippet}</span></div>
      <button id="reply-cancel"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" width="12" height="12" style="stroke:#57534e;margin:auto;"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>`;
    $('#reply-cancel').addEventListener('click', clearReply);
    input.focus();
  }
  function clearReply(){ state.replyTarget=null; $('#reply-preview-slot').innerHTML=''; }

  // ---------- swipe-to-reply + long-press on bubbles ----------
  let swipeState = null;
  const chatBody = $('#chat-body');
  chatBody.addEventListener('pointerdown', e=>{
    const bubble = e.target.closest('.bubble, .msg-file, .msg-voice');
    if(!bubble) return;
    const mid = bubble.dataset.mid;
    if(!mid) return;
    const msg = currentThread().find(m=>String(m.id)===String(mid));
    if(!msg) return;
    swipeState = {bubble, startX:e.clientX, dx:0, msg, longTimer:null, moved:false};
    swipeState.longTimer = setTimeout(()=>{
      if(!swipeState || swipeState.moved) return;
      openContextMenu(bubble, msg);
      swipeState = null;
    }, 480);
  });
  chatBody.addEventListener('pointermove', e=>{
    if(!swipeState) return;
    const dx = e.clientX - swipeState.startX;
    if(Math.abs(dx)>6){ swipeState.moved = true; clearTimeout(swipeState.longTimer); }
    const isMine = swipeState.msg.from==='me';
    const clamped = isMine ? Math.min(0, Math.max(dx,-70)) : Math.max(0, Math.min(dx,70));
    if(swipeState.moved){
      // No CSS transition while the drag is live — see .bubble.dragging in
      // globals.css. Without this, .bubble's base transition (needed for a
      // smooth release snap-back) was also easing every pointermove update,
      // making the bubble visibly lag behind the finger during the swipe.
      swipeState.bubble.classList.add('dragging');
      swipeState.bubble.style.transform = `translateX(${clamped}px)`;
      const hint = swipeState.bubble.querySelector('.swipe-hint');
      if(hint) hint.style.opacity = Math.min(1, Math.abs(clamped)/50);
    }
  });
  function endSwipe(){
    if(!swipeState) return;
    clearTimeout(swipeState.longTimer);
    swipeState.bubble.classList.remove('dragging');
    const dx = swipeState.bubble.style.transform.match(/-?\d+/);
    const val = dx ? parseInt(dx[0]) : 0;
    if(swipeState.moved && Math.abs(val) > 46){
      setReply(swipeState.msg);
    } else if(!swipeState.moved){
      handlePossibleDoubleTap(swipeState.bubble, swipeState.msg);
    }
    swipeState.bubble.style.transform = '';
    const hint = swipeState.bubble.querySelector('.swipe-hint');
    if(hint) hint.style.opacity = 0;
    swipeState = null;
  }
  function handlePossibleDoubleTap(bubble, msg){
    const now = Date.now();
    if(state.lastTap && state.lastTap.mid===msg.id && now-state.lastTap.time < 350){
      state.lastTap = null;
      heartBurst(bubble, msg);
    } else {
      state.lastTap = {mid:msg.id, time:now};
    }
  }
  function heartBurst(bubble, msg){
    bubble.style.position = bubble.style.position || 'relative';
    const h = document.createElement('div');
    h.className='heart-burst';
    h.textContent='❤️';
    bubble.appendChild(h);
    requestAnimationFrame(()=>h.classList.add('go'));
    setTimeout(()=>h.remove(), 720);
    msg.reactions = msg.reactions || [];
    if(!msg.reactions.some(r=>r.emoji==='❤️')){
      msg.reactions.push({emoji:'❤️'});
      setTimeout(renderChat, 760);
    }
  }
  chatBody.addEventListener('pointerup', endSwipe);
  chatBody.addEventListener('pointerleave', endSwipe);

  // add-reaction quick tap
  chatBody.addEventListener('click', e=>{
    const btn = e.target.closest('[data-add-reaction]');
    if(!btn) return;
    openReactionStrip(btn);
  });

  function openReactionStrip(anchor){
    const emojis = ['❤️','😂','👍','🔥','😮','🙏'];
    const menu = $('#ctx-menu');
    menu.innerHTML = `<div class="ctx-emoji-row">${emojis.map(em=>`<button data-em="${em}">${em}</button>`).join('')}</div>`;
    positionMenu(menu, anchor);
    showBackdrop(true);
    menu.classList.add('show');
    menu.querySelectorAll('button[data-em]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const mid = anchor.closest('.msg-row').dataset.id;
        const msg = currentThread().find(m=>String(m.id)===String(mid));
        msg.reactions = msg.reactions || [];
        msg.reactions.push({emoji:b.dataset.em});
        closeOverlay();
        renderChat();
        toast('Reaction added');
      });
    });
  }

  function openContextMenu(bubble, msg){
    const menu = $('#ctx-menu');
    const emojis = ['❤️','😂','👍','🔥'];
    menu.innerHTML = `
      <div class="ctx-emoji-row">${emojis.map(em=>`<button data-em="${em}">${em}</button>`).join('')}</div>
      <div class="ctx-item" data-act="reply"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4M5 10h14"/></svg>Reply</div>
      <div class="ctx-item" data-act="save"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>Save to Mind</div>
      <div class="ctx-item" data-act="copy"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy</div>
      <div class="ctx-item" data-act="forward"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l6 6-6 6"/><path d="M3 20v-4a4 4 0 0 1 4-4h14"/></svg>Forward</div>
      <div class="ctx-item" data-act="pin"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/></svg>Pin</div>`;
    positionMenu(menu, bubble);
    showBackdrop(true);
    menu.classList.add('show');
    bubble.classList.add('selected-flash');
    menu.querySelectorAll('button[data-em]').forEach(b=>{
      b.addEventListener('click', ()=>{
        msg.reactions = msg.reactions||[]; msg.reactions.push({emoji:b.dataset.em});
        closeOverlay(); renderChat(); toast('Reaction added');
      });
    });
    menu.querySelectorAll('.ctx-item').forEach(it=>{
      it.addEventListener('click', ()=>{
        const act = it.dataset.act;
        closeOverlay();
        if(act==='reply') setReply(msg);
        else if(act==='save') saveMessageToMind(bubble, msg);
        else if(act==='copy') toast('Copied to clipboard');
        else if(act==='forward') toast('Choose a chat to forward to');
        else if(act==='pin') toast('Message pinned');
      });
    });
  }
  function guessCollection(text, source){
    const t = ((text||'') + ' ' + (source||'')).toLowerCase();
    if(/trip|flight|hotel|dates|travel|itinerary|lisbon|belém|belem|airport/.test(t)) return 'Trip GRP';
    if(/review|implementation|doc|requirement|deploy|bug|pull request|\bpr\b|client|changelog|spec/.test(t)) return 'Work';
    if(/dinner|family|birthday|weekend|movie|personal/.test(t)) return 'Personal';
    return collections[0] || 'Work';
  }
  function saveMessageToMind(bubble, msg){
    const snippet = msg.type==='text' ? msg.text : (msg.type==='file' ? msg.fname : 'Voice message');
    const source = 'Saved from ' + (state.activeChat==='group' ? (msg.who||'#General') : 'Charles · DM');
    const item = {
      id:'u'+Date.now(),
      kind: msg.type==='file' ? 'file' : 'note',
      tag: msg.type==='file' ? 'File' : 'Message',
      quote: snippet,
      title: snippet.length>34 ? snippet.slice(0,34)+'…' : snippet,
      source,
      who: state.activeChat==='group' ? (msg.who||'Charles') : 'Charles',
      whoAv: state.activeChat==='group' ? (msg.av||AV.charles) : AV.charles,
    };
    const guessed = guessCollection(snippet, source);
    flyToMind(bubble, snippet, ()=> showSavePopup(item, guessed));
  }
  function flyToMind(sourceEl, label, onDone){
    const target = document.querySelector('.tab-btn[data-tab="mind"]');
    if(!sourceEl || !target){ if(onDone) onDone(); return; }
    const sr = sourceEl.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'fly-chip';
    chip.textContent = '🔖 ' + (label && label.length<40 ? label : 'Saved');
    chip.style.left = sr.left+'px';
    chip.style.top = sr.top+'px';
    chip.style.width = Math.min(sr.width,180)+'px';
    document.body.appendChild(chip);
    requestAnimationFrame(()=>{
      chip.style.transform = `translate(${tr.left+tr.width/2-sr.left-14}px, ${tr.top+tr.height/2-sr.top}px) scale(.35)`;
      chip.style.opacity='0';
      chip.style.width='40px';
      chip.style.padding='6px';
    });
    setTimeout(()=>{
      chip.remove();
      target.style.transform='scale(1.18)';
      setTimeout(()=>target.style.transform='', 180);
      if(onDone) onDone();
    }, 640);
  }

  // ---------- save-to-mind confirmation popup ----------
  function showSavePopup(item, guessed){
    state.pendingSave = {item, guessed};
    renderPopupConfirm(item, guessed);
    $('#mind-popup-backdrop').classList.add('show');
    $('#mind-popup').classList.add('show');
  }
  function closePopup(){
    $('#mind-popup').classList.remove('show');
    $('#mind-popup-backdrop').classList.remove('show');
    state.pendingSave = null;
  }
  function renderPopupConfirm(item, guessed){
    const modal = $('#mind-popup');
    modal.innerHTML = `
      <div class="mp-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div class="mp-title">Saved to Mind</div>
      <div class="mp-sub">Auto-sorted into <b>${guessed}</b></div>
      <div class="mp-actions">
        <button class="mp-edit" id="mp-edit-btn">Edit</button>
        <button class="mp-ok" id="mp-ok-btn">OK</button>
      </div>`;
    $('#mp-ok-btn').addEventListener('click', ()=> confirmAssign(item, guessed));
    $('#mp-edit-btn').addEventListener('click', ()=> renderPopupEdit(item, guessed));
  }
  function renderPopupEdit(item, guessed){
    const modal = $('#mind-popup');
    modal.innerHTML = `
      <div class="mp-title" style="margin-bottom:4px;">Choose a collection</div>
      <div class="mp-sub">for "${item.title}"</div>
      <div class="mp-chip-list">
        ${collections.map(c=>`<button class="mp-chip ${c===guessed?'active':''}" data-c="${c}">${c}</button>`).join('')}
        <button class="mp-chip new" data-c="__new">+ New</button>
      </div>
      <div class="mp-unassigned-link"><button id="mp-unassigned-btn">Leave unassigned instead</button></div>`;
    modal.querySelectorAll('.mp-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        let name = chip.dataset.c;
        if(name==='__new'){
          name = 'New collection';
          collections.push(name);
          toast('Collection created');
        }
        confirmAssign(item, name);
      });
    });
    $('#mp-unassigned-btn').addEventListener('click', ()=>{
      unassigned.unshift(item);
      renderHero();
      closePopup();
      toast('Saved to Mind · Unassigned');
    });
  }
  function confirmAssign(item, category){
    mindCards.unshift({
      id:item.id, tag:item.tag, kind:item.kind, title:item.title, quote:item.quote,
      who:item.who, whoAv:item.whoAv, when:'Just now', date:'Today', collection:category,
    });
    closePopup();
    applyMindFilter();
    toast('Saved to ' + category);
  }
  $('#mind-popup-backdrop').addEventListener('click', ()=>{
    if(state.pendingSave){ confirmAssign(state.pendingSave.item, state.pendingSave.guessed); }
    else closePopup();
  });
  function positionMenu(menu, anchor){
    const r = anchor.getBoundingClientRect();
    const pr = app.getBoundingClientRect();
    let top = r.top - pr.top - 8;
    let left = r.left - pr.left;
    menu.style.top = Math.max(60, top-70)+'px';
    left = Math.min(left, pr.width-210);
    menu.style.left = Math.max(14,left)+'px';
  }
  function showBackdrop(on){ $('#ctx-backdrop').classList.toggle('show', on); }
  function closeOverlay(){
    $('#ctx-menu').classList.remove('show');
    showBackdrop(false);
    document.querySelectorAll('.bubble.selected-flash').forEach(b=>b.classList.remove('selected-flash'));
  }
  $('#ctx-backdrop').addEventListener('click', closeOverlay);

  // voice playback tap
  chatBody.addEventListener('click', e=>{
    const v = e.target.closest('.msg-voice');
    if(!v) return;
    if(v.dataset.played==='1') return;
    v.dataset.played='1';
    const bars = v.querySelectorAll('.voice-wave i');
    let i=0;
    const t = setInterval(()=>{
      if(i>=bars.length){ clearInterval(t); v.dataset.played='0'; return; }
      bars[i].classList.add('played'); i++;
    }, 45);
  });

  // ---------- mention autocomplete ----------
  function handleMentionTyping(){
    const val = input.value;
    const isGroup = state.activeChat==='group';
    const pop = $('#mention-pop');
    if(!isGroup){ pop.style.display='none'; return; }
    const m = val.match(/@([A-Za-z]*)$/);
    if(!m){ pop.style.display='none'; return; }
    const q = m[1].toLowerCase();
    const matches = members.filter(mm=>mm.name.toLowerCase().startsWith(q));
    if(!matches.length){ pop.style.display='none'; return; }
    pop.innerHTML = matches.map(mm=>`<div class="mention-item" data-name="${mm.name}"><img class="avatar avatar-sm" style="width:26px;height:26px;" src="${mm.avatar}"><span>${mm.name}</span></div>`).join('');
    pop.style.display='block';
    pop.querySelectorAll('.mention-item').forEach(it=>{
      it.addEventListener('click', ()=>{
        input.value = val.replace(/@([A-Za-z]*)$/, '@'+it.dataset.name+' ');
        pop.style.display='none';
        input.focus();
        updateSendBtn();
      });
    });
  }

  // ---------- voice recording ----------
  const micBtn = sendBtn;
  const overlay = $('#record-overlay');
  const waveEl = $('#rec-wave');
  let recTimer=null, recSecs=0, recBars=[];
  function startRecording(){
    if(sendBtn.classList.contains('arrow')) return;
    overlay.style.display='flex';
    recSecs=0; recBars=[];
    waveEl.innerHTML='';
    $('#rec-time').textContent='0:00';
    recTimer = setInterval(()=>{
      recSecs++;
      const m=Math.floor(recSecs/60), s=recSecs%60;
      $('#rec-time').textContent = m+':'+String(s).padStart(2,'0');
      const h = 4+Math.round(Math.random()*20);
      recBars.push(h);
      const bar = document.createElement('i'); bar.style.height=h+'px';
      waveEl.appendChild(bar);
      waveEl.scrollLeft = waveEl.scrollWidth;
    }, 220);
  }
  function stopRecording(commit){
    overlay.style.display='none';
    clearInterval(recTimer);
    if(commit && recSecs>0){
      const thread = currentThread();
      thread.forEach(m=>{ if(m.from==='me') delete m.status; });
      const msg = {id:'v'+Date.now(), from:'me', type:'voice', dur:'0:'+String(recSecs).padStart(2,'0'), status:'sent'};
      thread.push(msg);
      const el = renderMessage(msg);
      el.querySelector('.msg-stack')?.classList.add('msg-enter');
      $('#chat-body').appendChild(el);
      $('#chat-body').scrollTop = 999999;
      setTimeout(()=>{ msg.status='delivered'; refreshStatusLine(msg); }, 600);
      setTimeout(()=>{ msg.status='read'; refreshStatusLine(msg); }, 1600);
    }
  }
  let pressTimer=null;
  micBtn.addEventListener('pointerdown', e=>{
    if(sendBtn.classList.contains('arrow')) return;
    pressTimer = setTimeout(startRecording, 160);
  });
  micBtn.addEventListener('pointerup', ()=>{
    clearTimeout(pressTimer);
    if(overlay.style.display==='flex') stopRecording(true);
  });
  micBtn.addEventListener('pointerleave', ()=>{
    clearTimeout(pressTimer);
    if(overlay.style.display==='flex') stopRecording(false);
  });

  // ---------- MIND ----------
  function typeIconSvg(kind, size, muted){
    size = size||12;
    const stroke = muted ? '#78716c' : '#44403c';
    const icons = {
      photo: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
      link: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
      poll: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`,
      note: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      file: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
      location: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.2"/></svg>`,
      ticket: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a2 2 0 0 1 0-4h18a2 2 0 0 1 0 4 2 2 0 0 0 0 4 2 2 0 0 1 0 4H3a2 2 0 0 1 0-4 2 2 0 0 0 0-4z"/></svg>`,
      checklist: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    };
    return icons[kind] || icons.file;
  }
  function pinIconSvg(){
    return `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  }
  function heightFor(c){
    const heights = [138,164,190,216];
    let seed = 0;
    const s = String(c.id);
    for(let i=0;i<s.length;i++) seed = (seed*31 + s.charCodeAt(i)) % 997;
    return heights[seed % heights.length];
  }
  function mediaFor(c){
    let mediaClass = 'mc-media';
    let mediaStyle = `height:${heightFor(c)}px;`;
    let inner = '';
    if(c.kind==='photo'){
      inner = `<img src="${c.img}">`;
    } else if(c.kind==='location'){
      mediaClass += ' map';
      inner = `<div class="mc-icon-fill"><div class="mc-pin">${typeIconSvg('location',13)}</div></div>`;
    } else if(c.kind==='poll'){
      mediaStyle += 'background:#fff;';
      inner = `<div class="mc-bars">${c.poll.map((p,i)=>`<div class="bar-track"><div class="bar-fill ${i>0?'alt':''}" style="transform:scaleX(${p.pct/100})"></div></div>`).join('')}</div>`;
    } else if(c.kind==='checklist'){
      mediaStyle += 'background:#fff;';
      inner = `<div class="mc-bars" style="padding:0 16px;">${c.items.slice(0,3).map(()=>`<div class="bar-track" style="height:9px;"><div class="bar-fill alt" style="transform:scaleX(${(40+Math.random()*40)/100})"></div></div>`).join('')}</div>`;
    } else if(c.kind==='note'){
      mediaStyle += 'background:#fff;';
      inner = `<div class="mc-quote">"${(c.quote||'').slice(0,90)}${(c.quote||'').length>90?'…':''}"</div>`;
    } else if(c.kind==='file'){
      mediaStyle += 'background:#fff;';
      inner = `<div class="mc-icon-fill">${typeIconSvg('file',26)}</div>`;
    } else if(c.kind==='link'){
      mediaStyle += 'background:#eef2fb;';
      inner = `<div class="mc-icon-fill">${typeIconSvg('link',24)}</div>`;
    } else {
      mediaStyle += 'background:#eeeceb;';
      inner = `<div class="mc-icon-fill">${typeIconSvg('ticket',24)}</div>`;
    }
    return {mediaClass, mediaStyle, inner};
  }
  function cardHtml(c){
    const {mediaClass, mediaStyle, inner} = mediaFor(c);
    const isPinned = state.pinnedIds.has(c.id);
    return `<div class="mind-card${isPinned?' pinned-item':''}" data-id="${c.id}">
      <div class="${mediaClass}" style="${mediaStyle}">
        ${inner}
        <div class="mc-overlay-top">
          <span class="mc-type-badge">${typeIconSvg(c.kind,12)}</span>
          <button class="mc-pin-btn${isPinned?' pinned':''}" data-pin="${c.id}">${pinIconSvg()}</button>
        </div>
      </div>
      <div class="select-check"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div class="mc-caption">
        <div class="mc-title">${c.title||c.tag}</div>
        <div class="mc-meta"><img src="${c.whoAv}"><span>${c.who}</span><span class="dot">·</span><span>${c.collection||c.date}</span></div>
      </div>
    </div>`;
  }
  function listRowHtml(c){
    const isPinned = state.pinnedIds.has(c.id);
    const thumb = c.kind==='photo' ? `<img src="${c.img}">` : typeIconSvg(c.kind, 18, true);
    return `<div class="mind-card list-row" data-id="${c.id}">
      <div class="select-check"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div class="list-thumb">${thumb}</div>
      <div class="list-info">
        <div class="list-title">${c.title||c.tag}</div>
        <div class="list-meta">${c.collection ? c.collection+' · ' : ''}${c.who} · ${c.when}</div>
      </div>
      <button class="mc-pin-btn${isPinned?' pinned':''}" data-pin="${c.id}">${pinIconSvg()}</button>
    </div>`;
  }
  function sortWithPinned(list){
    const pinned = list.filter(c=>state.pinnedIds.has(c.id));
    const rest = list.filter(c=>!state.pinnedIds.has(c.id));
    return [...pinned, ...rest];
  }
  function matchesSearch(c, q){
    if(!q) return true;
    return (c.title||'').toLowerCase().includes(q) || (c.tag||'').toLowerCase().includes(q) ||
      (c.who||'').toLowerCase().includes(q) || (c.collection||'').toLowerCase().includes(q);
  }
  function matchesType(c){ return state.mindFilter==='all' || c.kind===state.mindFilter; }

  function bucketForCard(c){
    if(c.when==='Just now') return 'Today';
    const m = (c.when||'').match(/^(\d+)d ago/);
    if(m) return (+m[1] <= 6) ? 'This week' : 'Earlier';
    return 'Earlier';
  }
  function renderTimelineInto(body, list){
    const order = ['Today','This week','Earlier'];
    const groups = {Today:[], 'This week':[], Earlier:[]};
    list.forEach(c=> groups[bucketForCard(c)].push(c));
    let html = '';
    order.forEach(k=>{
      if(!groups[k].length) return;
      html += `<div class="timeline-section"><div class="timeline-label">${k}</div><div class="timeline-rail">${groups[k].map(cardHtml).join('')}</div></div>`;
    });
    body.innerHTML = html;
    body.querySelectorAll('.mind-card').forEach((el,i)=>{ el.style.animationDelay=(i*30)+'ms'; });
  }

  // ---------- boards ----------
  function coverTile(c){
    if(c.kind==='photo') return `<img class="cover-tile" src="${c.img}">`;
    const bg = c.kind==='location' ? '#dde8de' : (c.kind==='link' ? '#eef2fb' : '#fff');
    return `<div class="cover-tile icon-fill" style="background:${bg};">${typeIconSvg(c.kind, 20, true)}</div>`;
  }
  function boardCoverHtml(items){
    const four = items.slice(0,4);
    if(!four.length) return `<div class="board-cover"><div class="cover-empty"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div></div>`;
    if(four.length===1) return `<div class="board-cover single">${coverTile(four[0])}</div>`;
    const pad = Array.from({length:Math.max(0,4-four.length)}).map(()=>`<div class="cover-tile" style="background:#eeeceb;"></div>`).join('');
    return `<div class="board-cover">${four.map(coverTile).join('')}${pad}</div>`;
  }
  function heroTileHtml(item){
    if(item.kind==='photo') return `<div><img src="${item.img}"></div>`;
    if(item.kind==='link') return `<div style="background:#eef2fb; display:flex; align-items:center; justify-content:center;">${typeIconSvg('link',20)}</div>`;
    if(item.kind==='file') return `<div style="background:#fff; display:flex; align-items:center; justify-content:center;">${typeIconSvg('file',20)}</div>`;
    return `<div style="background:#fff; padding:12px; display:flex; align-items:center; font-family:'Fraunces',serif; font-size:12px; color:#57534e; line-height:1.3;">"${(item.quote||'').slice(0,42)}${(item.quote||'').length>42?'…':''}"</div>`;
  }
  function renderBoardsView(){
    const body = $('#mind-view-body');
    const names = Array.from(new Set([...collections, ...mindCards.map(c=>c.collection).filter(Boolean)]));
    let html = `<div class="boards-grid">`;
    html += `<div class="board-card" data-board="__unassigned">
      ${boardCoverHtml(unassigned)}
      <div class="board-meta"><div class="board-name">Unassigned</div><div class="board-count">${unassigned.length} item${unassigned.length===1?'':'s'}</div></div>
    </div>`;
    names.forEach(name=>{
      const items = mindCards.filter(c=>c.collection===name);
      html += `<div class="board-card" data-board="${name}">
        ${boardCoverHtml(items)}
        <div class="board-meta"><div class="board-name">${name}</div><div class="board-count">${items.length} item${items.length===1?'':'s'}</div></div>
      </div>`;
    });
    html += `<div class="board-card new" data-board="__new">
      <div class="board-cover"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
      <div class="board-meta"><div class="board-name">New board</div></div>
    </div>`;
    html += `</div>`;
    body.innerHTML = html;
    body.querySelectorAll('.board-card').forEach((el,i)=>{ el.style.animationDelay=(i*40)+'ms'; });
  }
  function renderBoardDetail(name, q){
    const body = $('#mind-view-body');
    let items = mindCards.filter(c=>c.collection===name && matchesSearch(c,q) && matchesType(c));
    items = sortWithPinned(items);
    let html = `<div class="board-breadcrumb"><button id="board-back-btn"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Boards</button></div>
      <div class="section-label">${name}</div>`;
    if(!items.length){
      html += `<div class="empty-state"><div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2z"/><path d="M10 21h4"/></svg></div><h3>No items yet</h3><p>Items you save into ${name} will show up here.</p></div>`;
      body.innerHTML = html;
      $('#board-back-btn').addEventListener('click', ()=>{ state.mindBoard=null; applyMindFilter(); });
      return;
    }
    html += `<div class="mind-masonry">${items.map(cardHtml).join('')}</div>`;
    body.innerHTML = html;
    body.querySelectorAll('.mind-card').forEach((el,i)=>{ el.style.animationDelay=(i*40)+'ms'; });
    $('#board-back-btn').addEventListener('click', ()=>{ state.mindBoard=null; applyMindFilter(); });
  }
  function handleBoardTap(key){
    if(key==='__unassigned'){
      if(unassigned.length) openOrganize(); else toast('Nothing to organize');
      return;
    }
    if(key==='__new'){
      let base = 'New board', name = base, n = 2;
      while(collections.includes(name)){ name = base+' '+n; n++; }
      collections.push(name);
      toast('Board created');
      applyMindFilter();
      return;
    }
    state.mindBoard = key;
    applyMindFilter();
  }

  function renderMind(list){
    const body = $('#mind-view-body');
    if(!list.length){
      body.innerHTML = '';
      showMindEmpty(true, list._searchEmpty);
      return;
    }
    showMindEmpty(false);
    if(state.mindView==='list'){
      body.innerHTML = `<div class="mind-list">${list.map(listRowHtml).join('')}</div>`;
      body.querySelectorAll('.list-row').forEach((el,i)=>{ el.style.animationDelay=(i*30)+'ms'; });
    } else if(state.mindView==='timeline'){
      renderTimelineInto(body, list);
    } else {
      body.innerHTML = `<div class="mind-masonry">${list.map(cardHtml).join('')}</div>`;
      body.querySelectorAll('.mind-card').forEach((el,i)=>{ el.style.animationDelay=(i*40)+'ms'; });
    }
  }
  function showMindEmpty(on, isSearch){
    let ex = $('#mind-empty');
    if(on){
      if(!ex){
        ex = document.createElement('div');
        ex.id='mind-empty';
        ex.className='empty-state';
        $('#mind-scroll').insertBefore(ex, $('.demo-toggle'));
      }
      ex.innerHTML = isSearch ? `
        <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div>
        <h3>No matches</h3><p>Try a different search term.</p>` : `
        <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2z"/><path d="M10 21h4"/></svg></div>
        <h3>Nothing saved yet</h3><p>Long‑press anything in a chat — a message, photo, poll — and save it here to find it again fast.</p>
        <button class="empty-cta" id="empty-cta-save">Save something</button>`;
      if(!isSearch){
        setTimeout(()=>{
          const cta = document.getElementById('empty-cta-save');
          if(cta) cta.addEventListener('click', ()=>{ state.mindEmpty=false; applyMindFilter(); toast('Demo item saved'); });
        },0);
      }
    } else if(ex){ ex.remove(); }
  }
  function renderHero(){
    const hero = $('#collection-hero');
    const n = unassigned.length;
    if(n===0){
      hero.classList.add('collapsed');
      return;
    }
    hero.classList.remove('collapsed');
    const previewItems = unassigned.slice(0,3);
    const strip = `<div class="ch-strip">${previewItems.map(heroTileHtml).join('')}${
        Array.from({length:Math.max(0,3-previewItems.length)}).map(()=>`<div style="background:#f0efed;"></div>`).join('')
      }</div>`;
    hero.innerHTML = `
      <div class="ch-top">
        <div class="ch-top-left"><span class="ch-tag">Unassigned</span><span class="ch-meta">${n} item${n===1?'':'s'} to sort</span></div>
        <button class="organize-pill" id="organize-pill-btn"><span class="dot"></span>Organize</button>
      </div>
      ${strip}`;
    const btn = $('#organize-pill-btn');
    if(btn) btn.addEventListener('click', e=>{ e.stopPropagation(); openOrganize(); });
  }
  function renderFilterChips(){
    const row = $('#mind-filter-row');
    const FILTERS = [
      {key:'all', label:'All'}, {key:'photo', label:'Photos'}, {key:'link', label:'Links'},
      {key:'poll', label:'Polls'}, {key:'note', label:'Notes'}, {key:'location', label:'Places'}, {key:'ticket', label:'Tickets'},
    ];
    row.innerHTML = FILTERS.map(f=>`<button class="filter-chip${state.mindFilter===f.key?' active':''}" data-filter="${f.key}">${f.label}</button>`).join('');
    row.querySelectorAll('.filter-chip').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.mindFilter = btn.dataset.filter;
        row.querySelectorAll('.filter-chip').forEach(b=>b.classList.toggle('active', b===btn));
        applyMindFilter();
      });
    });
  }
  function renderViewSwitch(){
    const row = $('#mind-view-switch');
    const VIEWS = [
      {key:'masonry', icon:`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="10" rx="1.5"/><rect x="14" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="13" width="7" height="8" rx="1.5"/><rect x="3" y="17" width="7" height="4" rx="1.5"/></svg>`},
      {key:'boards', icon:`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>`},
      {key:'list', icon:`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`},
      {key:'timeline', icon:`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`},
    ];
    row.innerHTML = VIEWS.map(v=>`<button class="mvs-btn${state.mindView===v.key?' active':''}" data-view="${v.key}">${v.icon}</button>`).join('');
    row.querySelectorAll('.mvs-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.mindView = btn.dataset.view;
        state.mindBoard = null;
        row.querySelectorAll('.mvs-btn').forEach(b=>b.classList.toggle('active', b===btn));
        applyMindFilter();
      });
    });
  }
  function runMindEntrance(){
    renderFilterChips();
    renderViewSwitch();
    applyMindFilter();
    renderHero();
  }
  function applyMindFilter(){
    const q = $('#mind-search-input').value.trim().toLowerCase();
    if(state.mindEmpty){ renderMind([]); return; }
    if(state.mindBoard){ renderBoardDetail(state.mindBoard, q); return; }
    if(state.mindView==='boards'){ renderBoardsView(); showMindEmpty(false); return; }
    let list = mindCards.filter(c=> matchesSearch(c,q) && matchesType(c));
    list = sortWithPinned(list);
    list._searchEmpty = !!q;
    renderMind(list);
  }
  $('#mind-search-input').addEventListener('input', applyMindFilter);
  $('#empty-toggle').addEventListener('click', ()=>{
    state.mindEmpty = !state.mindEmpty;
    $('#empty-toggle').textContent = state.mindEmpty ? '← Back to items' : 'Preview empty state →';
    applyMindFilter();
  });
  $('#mind-add-btn').addEventListener('click', ()=>{
    const notes = ['Remember to check the venue capacity','Follow up on the vendor quote','Idea: weekly digest email for Mind'];
    const text = notes[Math.floor(Math.random()*notes.length)];
    const dest = collections[0] || 'Work';
    mindCards.unshift({id:'n'+Date.now(), tag:'Message', kind:'note', title:text.length>34?text.slice(0,34)+'…':text,
      quote:text, who:'You', whoAv:AV.me, when:'Just now', date:'Today', collection:dest});
    applyMindFilter();
    toast('Note added to '+dest);
  });
  function togglePin(id){
    if(state.pinnedIds.has(id)){ state.pinnedIds.delete(id); toast('Unpinned'); }
    else { state.pinnedIds.add(id); toast('Pinned to top'); }
    applyMindFilter();
  }

  // card interactions: tap -> sheet, swipe -> archive, long-press -> select mode
  let cardSwipe=null;
  const mindBody = $('#mind-view-body');
  mindBody.addEventListener('pointerdown', e=>{
    if(e.target.closest('.mc-pin-btn') || e.target.closest('.board-card')) return;
    const card = e.target.closest('.mind-card');
    if(!card) return;
    if(e.target.closest('.select-check')) return;
    cardSwipe = {card, startX:e.clientX, moved:false, longTimer:null};
    cardSwipe.longTimer = setTimeout(()=>{
      if(cardSwipe && !cardSwipe.moved) enterSelectMode(card.dataset.id);
      cardSwipe=null;
    }, 480);
  });
  mindBody.addEventListener('pointermove', e=>{
    if(!cardSwipe) return;
    const dx = e.clientX - cardSwipe.startX;
    if(Math.abs(dx)>6){ cardSwipe.moved=true; clearTimeout(cardSwipe.longTimer); }
    if(cardSwipe.moved && dx<0){
      // See the matching comment on the message-bubble swipe above — same fix,
      // same bug (.mind-card's base transition was fighting the live drag).
      cardSwipe.card.classList.add('dragging');
      cardSwipe.card.style.transform = `translateX(${Math.max(dx,-90)}px)`;
      cardSwipe.card.style.background = dx<-40 ? '#fff5f5' : '';
    }
  });
  function endCardSwipe(e){
    if(!cardSwipe) return;
    clearTimeout(cardSwipe.longTimer);
    cardSwipe.card.classList.remove('dragging');
    const t = cardSwipe.card.style.transform.match(/-?\d+/);
    const val = t?parseInt(t[0]):0;
    if(cardSwipe.moved && val < -60){
      const id = cardSwipe.card.dataset.id;
      cardSwipe.card.style.transition='transform .25s ease, opacity .25s ease, max-height .3s ease';
      cardSwipe.card.style.transform='translateX(-100%)';
      cardSwipe.card.style.opacity='0';
      setTimeout(()=>{
        const idx = mindCards.findIndex(c=>c.id===id);
        if(idx>-1) mindCards.splice(idx,1);
        applyMindFilter();
        toast('Removed from Mind');
      },240);
    } else if(!cardSwipe.moved){
      openSheet(cardSwipe.card.dataset.id);
    } else {
      cardSwipe.card.style.transform='';
      cardSwipe.card.style.background='';
    }
    cardSwipe=null;
  }
  mindBody.addEventListener('pointerup', endCardSwipe);
  mindBody.addEventListener('pointerleave', ()=>{ if(cardSwipe && cardSwipe.moved){ cardSwipe.card.classList.remove('dragging'); cardSwipe.card.style.transform=''; cardSwipe.card.style.background=''; cardSwipe=null; } });

  mindBody.addEventListener('click', e=>{
    const pinBtn = e.target.closest('.mc-pin-btn');
    if(pinBtn){ e.stopPropagation(); togglePin(pinBtn.dataset.pin); return; }
    const board = e.target.closest('.board-card');
    if(board){ handleBoardTap(board.dataset.board); return; }
    const check = e.target.closest('.select-check');
    if(check && state.selectMode){
      toggleSelect(check.closest('.mind-card').dataset.id);
    }
  });

  function enterSelectMode(firstId){
    state.selectMode = true;
    state.selectedIds = new Set([firstId]);
    document.querySelectorAll('.mind-card').forEach(c=>{
      c.classList.toggle('selected', state.selectedIds.has(c.dataset.id));
    });
    updateSelectBar();
  }
  function toggleSelect(id){
    if(state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id);
    const el = document.querySelector(`.mind-card[data-id="${id}"]`);
    if(el) el.classList.toggle('selected', state.selectedIds.has(id));
    if(state.selectedIds.size===0) exitSelectMode();
    else updateSelectBar();
  }
  function exitSelectMode(){
    state.selectMode=false; state.selectedIds=new Set();
    document.querySelectorAll('.mind-card').forEach(c=>c.classList.remove('selected'));
    $('#select-bar').classList.remove('show');
  }
  function updateSelectBar(){
    $('#sb-count').textContent = state.selectedIds.size+' selected';
    $('#select-bar').classList.add('show');
  }
  $('#sb-move').addEventListener('click', ()=>{
    const chosen = mindCards.find(c=>state.selectedIds.has(c.id));
    if(chosen) openMovePopup(chosen, Array.from(state.selectedIds));
    else exitSelectMode();
  });
  $('#sb-delete').addEventListener('click', ()=>{
    state.selectedIds.forEach(id=>{
      const idx = mindCards.findIndex(c=>c.id===id);
      if(idx>-1) mindCards.splice(idx,1);
    });
    exitSelectMode();
    applyMindFilter();
    toast('Items removed');
  });

  // ---------- move-to-collection popup (reuses the save-to-mind popup shell) ----------
  function openMovePopup(item, idsToMove){
    const modal = $('#mind-popup');
    modal.innerHTML = `
      <div class="mp-title" style="margin-bottom:4px;">Move to collection</div>
      <div class="mp-sub">for "${(item.title||item.tag)}"${idsToMove && idsToMove.length>1 ? ` +${idsToMove.length-1} more` : ''}</div>
      <div class="mp-chip-list">
        ${collections.map(c=>`<button class="mp-chip ${c===item.collection?'active':''}" data-c="${c}">${c}</button>`).join('')}
        <button class="mp-chip new" data-c="__new">+ New</button>
      </div>`;
    modal.querySelectorAll('.mp-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        let name = chip.dataset.c;
        if(name==='__new'){ name = 'New collection'; collections.push(name); toast('Collection created'); }
        const ids = idsToMove || [item.id];
        ids.forEach(id=>{
          const c = mindCards.find(x=>x.id===id);
          if(c) c.collection = name;
        });
        closePopup();
        if(state.selectMode) exitSelectMode();
        applyMindFilter();
        toast('Moved to '+name);
      });
    });
    $('#mind-popup-backdrop').classList.add('show');
    modal.classList.add('show');
  }

  // ---------- related items ----------
  function relatedItemsHtml(c){
    let related = mindCards.filter(x=>x.id!==c.id && x.collection && x.collection===c.collection);
    let label = 'More from ' + (c.collection||'Mind');
    if(!related.length){
      related = mindCards.filter(x=>x.id!==c.id).slice(0,4);
      label = 'More from Mind';
    }
    related = related.slice(0,4);
    if(!related.length) return '';
    return `<div class="sheet-related">
      <div class="sheet-related-label">${label}</div>
      <div class="sheet-related-row">${related.map(r=>`<div class="sr-card" data-related="${r.id}">
        <div class="sr-thumb">${r.kind==='photo'?`<img src="${r.img}">`:typeIconSvg(r.kind,16,true)}</div>
        <div class="sr-title">${r.title||r.tag}</div>
      </div>`).join('')}</div>
    </div>`;
  }

  // bottom sheet
  function openSheet(id){
    const c = mindCards.find(x=>x.id===id);
    if(!c) return;
    const sheet = $('#bottom-sheet');
    let media='';
    if(c.kind==='photo') media = `<div class="sheet-media"><img src="${c.img.replace('w=400','w=700')}"></div>`;
    else if(c.kind==='poll'){
      media = `<div class="sheet-poll">${c.poll.map((p,i)=>`<div class="poll-opt" data-i="${i}"><div class="po-fill" style="transform:scaleX(${p.pct/100})"></div><div class="po-row"><span>${p.label}</span><span class="po-pct">${p.pct}%</span></div></div>`).join('')}</div>`;
    } else if(c.kind==='checklist'){
      media = `<div class="sheet-poll">${c.items.map(it=>`<label class="poll-opt" style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" style="width:16px;height:16px;accent-color:#00359e;"><span style="position:relative;z-index:1;">${it}</span></label>`).join('')}</div>`;
    } else if(c.kind==='location'){
      media = `<div class="sheet-media" style="background:#dde8de; display:flex; align-items:center; justify-content:center; min-height:150px;"><div class="mc-pin" style="width:38px;height:38px;">${typeIconSvg('location',18)}</div></div>`;
    } else if(c.kind==='note'){
      media = `<div class="sheet-media" style="background:#fafaf9; min-height:100px; display:flex; align-items:center; padding:18px;"><div style="font-family:'Fraunces',serif; font-size:15px; color:#1c1917; line-height:1.5;">"${c.quote||''}"</div></div>`;
    } else if(c.kind==='file'){
      media = `<div class="sheet-media" style="background:#fafaf9; min-height:100px; display:flex; align-items:center; gap:10px; padding:18px;"><div class="file-icon" style="width:38px;height:38px;">${typeIconSvg('file',18)}</div><span style="font-family:'Fraunces',serif; font-size:14px; color:#1c1917;">${c.quote||c.title}</span></div>`;
    } else if(c.kind==='link'){
      media = `<div class="sheet-media" style="background:#eef2fb; min-height:100px; display:flex; align-items:center; gap:10px; padding:18px;">${typeIconSvg('link',22)}<span style="font-family:'Fraunces',serif; font-size:14px; color:#1c1917;">${c.quote}</span></div>`;
    } else {
      media = `<div class="sheet-media" style="min-height:100px; display:flex; align-items:center; justify-content:center; color:#a8a29e; font-size:13px;">Ticket details</div>`;
    }
    const isPinned = state.pinnedIds.has(c.id);
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div><h3>${c.title||c.tag}</h3><p>Saved by ${c.who} · ${c.date}</p></div>
        <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
          <button class="sheet-close" id="sheet-pin-btn" style="color:${isPinned?'#1c1917':'#57534e'};"><svg viewBox="0 0 24 24" width="14" height="14" style="margin:auto; stroke:${isPinned?'#1c1917':'#57534e'}; fill:${isPinned?'#1c1917':'none'};" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
          <button class="sheet-close" id="sheet-close-btn"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" width="14" height="14" style="margin:auto;stroke:#57534e;"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </div>
      ${media}
      ${relatedItemsHtml(c)}
      <div class="sheet-actions">
        <div class="sheet-action-item" data-act="open"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>Open in original chat</div>
        <div class="sheet-action-item" data-act="move"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Move to collection</div>
        <div class="sheet-action-item" data-act="share"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Share</div>
        <div class="sheet-action-item danger" data-act="remove"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>Remove from Mind</div>
      </div>`;
    $('#sheet-backdrop').classList.add('show');
    requestAnimationFrame(()=>sheet.classList.add('show'));
    $('#sheet-close-btn').addEventListener('click', closeSheet);
    $('#sheet-pin-btn').addEventListener('click', ()=>{ togglePin(c.id); closeSheet(); });
    sheet.querySelectorAll('.sr-card').forEach(el=>{
      el.addEventListener('click', ()=> openSheet(el.dataset.related));
    });
    if(c.kind==='poll'){
      sheet.querySelectorAll('.poll-opt[data-i]').forEach(opt=>{
        opt.addEventListener('click', ()=>{
          const i = +opt.dataset.i;
          c.poll.forEach((p,j)=> p.pct = j===i ? p.pct+8 : Math.max(0,p.pct-4));
          const total = c.poll.reduce((a,p)=>a+p.pct,0);
          c.poll.forEach(p=> p.pct = Math.round(p.pct/total*100));
          sheet.querySelectorAll('.poll-opt[data-i]').forEach((el,j)=>{
            el.querySelector('.po-fill').style.transform = `scaleX(${c.poll[j].pct/100})`;
            el.querySelector('.po-pct').textContent = c.poll[j].pct+'%';
          });
          toast('Vote updated');
        });
      });
    }
    sheet.querySelectorAll('.sheet-action-item').forEach(it=>{
      it.addEventListener('click', ()=>{
        const act = it.dataset.act;
        if(act==='remove'){
          closeSheet();
          const idx = mindCards.findIndex(x=>x.id===id);
          if(idx>-1) mindCards.splice(idx,1);
          applyMindFilter();
          toast('Removed from Mind');
        } else if(act==='open'){
          closeSheet();
          showTab('chats'); openChat('group');
        } else if(act==='move'){
          closeSheet();
          openMovePopup(c);
        }
        else if(act==='share'){ closeSheet(); toast('Share sheet opened'); }
      });
    });
  }
  function closeSheet(){
    $('#bottom-sheet').classList.remove('show');
    $('#sheet-backdrop').classList.remove('show');
  }
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  $('#collection-hero').addEventListener('click', ()=>{ if(unassigned.length) openOrganize(); });

  // ---------- organize unassigned flow ----------
  function openOrganize(){
    $('#screen-organize').classList.remove('push-in');
    $('#screen-mind').classList.add('push-out');
    renderOrganize();
  }
  function closeOrganize(){
    $('#screen-organize').classList.add('push-in');
    $('#screen-mind').classList.remove('push-out');
    renderHero();
    applyMindFilter();
  }
  $('#org-back').addEventListener('click', closeOrganize);

  function orgVisualHtml(item){
    if(item.kind==='photo') return `<div class="org-visual"><img src="${item.img}"></div>`;
    if(item.kind==='link') return `<div class="org-visual"><div class="org-quote">🔗 ${item.quote}</div></div>`;
    if(item.kind==='file') return `<div class="org-visual"><div class="org-quote">📎 ${item.quote}</div></div>`;
    return `<div class="org-visual"><div class="org-quote">"${item.quote}"</div></div>`;
  }
  function renderOrganize(){
    const body = $('#org-body');
    $('#org-subtitle').textContent = unassigned.length ? `${unassigned.length} left to sort` : 'All sorted';
    if(!unassigned.length){
      body.innerHTML = `<div class="org-done">
        <div class="od-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <h3>All caught up</h3>
        <p>Everything you've saved now lives in a collection instead of sitting in Unassigned.</p>
        <button id="org-done-back">Back to Mind</button>
      </div>`;
      $('#org-done-back').addEventListener('click', closeOrganize);
      return;
    }
    const item = unassigned[0];
    const nextItem = unassigned[1];
    body.innerHTML = `
      <div class="org-stack">
        ${nextItem ? `<div class="org-empty-slot" style="transform:scale(.95) translateY(10px); opacity:.6;"></div>` : ''}
        <div class="org-card" id="org-top-card">
          <span class="swipe-tag like" id="org-tag-like">ASSIGN</span>
          <span class="swipe-tag skip" id="org-tag-skip">LATER</span>
          <div class="org-kind">${item.tag}</div>
          ${orgVisualHtml(item)}
          <div class="org-source">${item.source}</div>
        </div>
      </div>
      <div class="org-chips" id="org-chips">
        ${collections.map(c=>`<button class="org-chip" data-c="${c}">${c}</button>`).join('')}
        <button class="org-chip new" data-c="__new">+ New collection</button>
      </div>
      <div class="org-skip-link"><button id="org-skip-btn">Decide later</button></div>`;

    const card = $('#org-top-card');
    let drag = null;
    card.addEventListener('pointerdown', e=>{
      drag = {startX:e.clientX, dx:0};
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', e=>{
      if(!drag) return;
      drag.dx = e.clientX - drag.startX;
      card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx/18}deg)`;
      $('#org-tag-like').style.opacity = Math.max(0, Math.min(1, drag.dx/70));
      $('#org-tag-skip').style.opacity = Math.max(0, Math.min(1, -drag.dx/70));
    });
    function releaseDrag(){
      if(!drag) return;
      card.style.transition = '';
      if(drag.dx > 90){ assignCurrent(collections[0], card, 1); }
      else if(drag.dx < -90){ skipCurrent(card); }
      else { card.style.transform=''; $('#org-tag-like').style.opacity=0; $('#org-tag-skip').style.opacity=0; }
      drag = null;
    }
    card.addEventListener('pointerup', releaseDrag);
    card.addEventListener('pointerleave', ()=>{ if(drag){ releaseDrag(); } });

    body.querySelectorAll('.org-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        let name = chip.dataset.c;
        if(name==='__new'){
          name = 'New collection';
          collections.push(name);
          toast('Collection created');
        }
        assignCurrent(name, card, 1);
      });
    });
    $('#org-skip-btn').addEventListener('click', ()=>skipCurrent(card, -1));
  }
  function deriveWho(item){
    if(item.who) return {name:item.who, av:item.whoAv||AV.charles};
    const m = (item.source||'').match(/from ([A-Za-z]+)/);
    return {name: m ? m[1] : 'You', av:AV.charles};
  }
  function assignCurrent(collectionName, cardEl, dir){
    const item = unassigned.shift();
    if(cardEl){
      cardEl.style.transform = `translateX(${dir*420}px) rotate(${dir*18}deg)`;
      cardEl.style.opacity = '0';
    }
    const who = deriveWho(item);
    const kind = item.kind==='message' ? 'note' : item.kind;
    mindCards.unshift({
      id:item.id, tag:item.tag, kind, title: item.title || (item.quote ? (item.quote.length>34 ? item.quote.slice(0,34)+'…' : item.quote) : item.tag),
      quote:item.quote, img:item.img, who:who.name, whoAv:who.av, when:'Just now', date:'Today', collection:collectionName,
    });
    toast(`Moved to ${collectionName}`);
    setTimeout(()=>{ renderOrganize(); applyMindFilter(); }, 260);
  }
  function skipCurrent(cardEl){
    const item = unassigned.shift();
    unassigned.push(item);
    if(cardEl){
      cardEl.style.transform = `translateX(-420px) rotate(-14deg)`;
      cardEl.style.opacity = '0';
    }
    setTimeout(()=>{ renderOrganize(); }, 240);
  }

  // ---------- notes panel ----------
  $('#notes-toggle').addEventListener('click', ()=>{
    $('#notes-panel').classList.toggle('show');
  });

  // ---------- init ----------
  renderInbox();
  updateSendBtn();
  applyMindFilter();
  showTab('chats');

  return () => {};
}
