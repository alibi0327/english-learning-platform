(async () => {
  const profile = await bootGuard();
  if(!profile)return;

  const isTeacher=['teacher','admin'].includes(profile.role);
  if(isTeacher)document.getElementById('teacherLink')?.classList.remove('hidden');
  if(profile.role==='admin')document.getElementById('adminLink')?.classList.remove('hidden');

  document.getElementById('conversationTitle').textContent=isTeacher?'Мои ученики':'Мои преподаватели';
  document.getElementById('messagesSubtitle').textContent=isTeacher
    ? 'Общайтесь с учениками вашего класса.'
    : 'Здесь можно задать вопрос своему преподавателю.';

  let contacts=[], selected=null, poll=null;
  const list=document.getElementById('conversationList');
  const search=document.getElementById('conversationSearch');

  function initials(name){
    const p=String(name||'').trim().split(/\s+/).filter(Boolean);
    return p.length?p.slice(0,2).map(x=>x[0]).join('').toUpperCase():'LP';
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  async function signed(path){
    if(!path)return null;
    const {data}=await sb.storage.from('avatars').createSignedUrl(path,3600);
    return data?.signedUrl||null;
  }

  async function loadContacts(){
    const fn=isTeacher?'teacher_get_my_students':'student_get_my_teachers';
    const {data,error}=await sb.rpc(fn);
    if(error){list.innerHTML='<div class="message error">Не удалось загрузить контакты.</div>';return}
    contacts=(data||[]).map(x=>({
      id:isTeacher?x.student_id:x.teacher_id,
      name:x.full_name,
      email:x.email,
      avatar_path:x.avatar_path,
      role:isTeacher?'Ученик':'Преподаватель'
    }));
    await renderContacts();

    const qs=new URLSearchParams(location.search);
    const wanted=qs.get(isTeacher?'student':'teacher');
    if(wanted && contacts.some(c=>c.id===wanted))selectContact(wanted);
  }

  async function renderContacts(){
    const q=search.value.trim().toLowerCase();
    const filtered=contacts.filter(c=>`${c.name||''} ${c.email||''}`.toLowerCase().includes(q));
    if(!filtered.length){list.innerHTML='<p class="muted">Контактов пока нет.</p>';return}
    const rows=[];
    for(const c of filtered){
      const avatar=await signed(c.avatar_path);
      const {data:unread}=await sb.rpc('count_unread_teacher_student_messages',{p_other_user_id:c.id});
      rows.push(`<button class="conversation-item ${selected===c.id?'active':''}" data-id="${c.id}">
        <div class="chat-avatar" ${avatar?`style="background-image:url('${avatar}');background-size:cover;background-position:center;color:transparent"`:''}>${avatar?'':initials(c.name)}</div>
        <div><strong>${esc(c.name||'Без имени')}</strong><small>${esc(c.email||'')}</small></div>
        ${Number(unread||0)>0?`<span class="conversation-unread">${unread}</span>`:'<span></span>'}
      </button>`);
    }
    list.innerHTML=rows.join('');
    list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectContact(b.dataset.id));
  }

  search.addEventListener('input',renderContacts);

  async function selectContact(id){
    selected=id;
    await renderContacts();
    const c=contacts.find(x=>x.id===id); if(!c)return;
    document.getElementById('chatEmpty').classList.add('hidden');
    document.getElementById('chatWorkspace').classList.remove('hidden');
    document.getElementById('chatName').textContent=c.name||'Без имени';
    document.getElementById('chatRole').textContent=c.role;
    const avatar=await signed(c.avatar_path);
    const av=document.getElementById('chatAvatar');
    av.textContent=avatar?'':initials(c.name);
    av.style.backgroundImage=avatar?`url('${avatar}')`:'';
    av.style.backgroundSize='cover';av.style.backgroundPosition='center';
    await loadMessages();
    if(poll)clearInterval(poll);
    poll=setInterval(()=>{if(selected===id)loadMessages(true)},4000);
  }

  async function loadMessages(silent=false){
    if(!selected)return;
    const {data,error}=await sb.rpc('get_teacher_student_messages',{
      p_other_user_id:selected,
      p_limit:100
    });
    const box=document.getElementById('chatMessages');
    if(error){if(!silent)box.innerHTML='<p class="muted">Не удалось загрузить сообщения.</p>';return}
    const rows=(data||[]).slice().reverse();
    box.innerHTML=rows.length?rows.map(m=>`
      <div class="chat-message ${m.sender_id===currentUser.id?'mine':''}">
        <p>${esc(m.body)}</p>
        <small>${new Date(m.created_at).toLocaleString('ru-RU')}</small>
      </div>`).join(''):'<p class="muted">Сообщений пока нет. Напишите первым.</p>';
    box.scrollTop=box.scrollHeight;
    await sb.rpc('mark_teacher_student_messages_read',{p_other_user_id:selected});
    if(!silent)await renderContacts();
  }

  document.getElementById('chatForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!selected)return;
    const input=document.getElementById('chatInput');
    const body=input.value.trim();if(!body)return;
    const {error}=await sb.rpc('send_teacher_student_message',{
      p_other_user_id:selected,
      p_body:body
    });
    if(error){alert(error.message);return}
    input.value='';
    await loadMessages();
  });

  await loadContacts();
})();