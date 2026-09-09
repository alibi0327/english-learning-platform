(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  if (!['teacher','admin'].includes(profile.role) || profile.status !== 'active') {
    location.href = 'dashboard.html';
    return;
  }

  if (profile.role === 'admin') {
    document.getElementById('adminLink')?.classList.remove('hidden');
  }

  const LEVELS = {
    'A1':{prefix:'a1',total:30,title:'English A1'},
    'A2':{prefix:'a2',total:30,title:'English A2'},
    'KZ-A1':{prefix:'kz-a1',total:30,title:'Қазақ тілі A1'},
    'KZ-A2':{prefix:'kz-a2',total:30,title:'Қазақ тілі A2'},
    'KZ-B1':{prefix:'kz-b1',total:30,title:'Қазақ тілі B1'},
    'KZ-B2':{prefix:'kz-b2',total:30,title:'Қазақ тілі B2'},
    'KZ-C1':{prefix:'kz-c1',total:30,title:'Қазақ тілі C1'}
  };

  let students = [];
  let selectedId = null;
  let chatTimer = null;

  const list = document.getElementById('teacherStudentList');
  const search = document.getElementById('studentSearch');
  const workspace = document.getElementById('teacherStudentWorkspace');
  const empty = document.getElementById('teacherEmptyState');

  function initials(name){
    const p=String(name||'').trim().split(/\s+/).filter(Boolean);
    return p.length?p.slice(0,2).map(x=>x[0]).join('').toUpperCase():'ST';
  }

  async function signedAvatar(path){
    if(!path) return null;
    const {data}=await sb.storage.from('avatars').createSignedUrl(path,3600);
    return data?.signedUrl||null;
  }

  async function loadStudents(){
    const {data,error}=await sb.rpc('teacher_get_my_students');
    if(error){
      console.error(error);
      list.innerHTML='<div class="message error">Не удалось загрузить учеников.</div>';
      return;
    }
    students=data||[];
    document.getElementById('teacherStudentCount').textContent=students.length;
    await renderStudents();
  }

  async function renderStudents(){
    const q=search.value.trim().toLowerCase();
    const filtered=students.filter(s=>`${s.full_name||''} ${s.email||''}`.toLowerCase().includes(q));
    if(!filtered.length){
      list.innerHTML='<p class="muted">Учеников пока нет.</p>';
      return;
    }

    const html=[];
    for(const s of filtered){
      const avatar=await signedAvatar(s.avatar_path);
      html.push(`<button class="teacher-student-item ${selectedId===s.student_id?'active':''}" data-student="${s.student_id}">
        <div class="teacher-avatar" ${avatar?`style="background-image:url('${avatar}')"`:''}>${avatar?'':initials(s.full_name)}</div>
        <div><strong>${s.full_name||'Без имени'}</strong><small>${s.email||''}</small></div>
        <span class="teacher-student-badge">Открыть →</span>
      </button>`);
    }
    list.innerHTML=html.join('');
    list.querySelectorAll('[data-student]').forEach(b=>b.onclick=()=>selectStudent(b.dataset.student));
  }

  document.getElementById('addStudentForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const email=document.getElementById('studentEmailInput').value.trim();
    const msg=document.getElementById('addStudentMessage');
    msg.className='message';
    msg.textContent='Добавляем...';

    const {data,error}=await sb.rpc('teacher_add_student_by_email',{p_email:email});
    if(error){
      msg.className='message error';
      msg.textContent=error.message.includes('Student not found')
        ? 'Ученик с такой почтой не найден. Сначала администратор должен создать ему аккаунт.'
        : error.message;
      return;
    }
    msg.className='message success';
    msg.textContent='✓ Ученик добавлен в ваш класс.';
    document.getElementById('studentEmailInput').value='';
    await loadStudents();
    if(data?.student_id) selectStudent(data.student_id);
  });

  search.addEventListener('input',renderStudents);

  async function selectStudent(id){
    selectedId=id;
    await renderStudents();
    empty.classList.add('hidden');
    workspace.classList.remove('hidden');

    const s=students.find(x=>x.student_id===id);
    if(!s)return;
    const avatar=await signedAvatar(s.avatar_path);
    const av=document.getElementById('studentWorkspaceAvatar');
    av.textContent=avatar?'':initials(s.full_name);
    av.style.backgroundImage=avatar?`url('${avatar}')`:'';
    document.getElementById('studentWorkspaceName').textContent=s.full_name||'Без имени';
    document.getElementById('studentWorkspaceEmail').textContent=s.email||'';
    document.getElementById('openFullChatBtn').href=`messages.html?student=${encodeURIComponent(id)}`;

    await Promise.all([loadStudentStats(id),loadMiniChat(id)]);
    if(chatTimer)clearInterval(chatTimer);
    chatTimer=setInterval(()=>{if(selectedId===id)loadMiniChat(id,true)},5000);
  }

  async function loadStudentStats(id){
    const [{data:progress},{data:quizzes},{data:access},{data:courses}]=await Promise.all([
      sb.from('lesson_progress').select('lesson_key,completed,completed_at').eq('user_id',id).eq('completed',true),
      sb.from('quiz_results').select('lesson_key,score,passed,created_at').eq('user_id',id).order('created_at',{ascending:false}).limit(100),
      sb.from('course_access').select('course_id,allowed').eq('user_id',id).eq('allowed',true),
      sb.from('courses').select('id,code,title')
    ]);

    const done=new Set((progress||[]).map(x=>x.lesson_key));
    const regular=(quizzes||[]).filter(q=>!String(q.lesson_key).endsWith('-final'));
    const avg=regular.length?Math.round(regular.reduce((s,q)=>s+Number(q.score||0),0)/regular.length):0;
    const best=regular.length?Math.max(...regular.map(q=>Number(q.score||0))):0;
    const last=(quizzes||[])[0]?.created_at || (progress||[]).sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at))[0]?.completed_at;

    let totalDone=0;
    Object.values(LEVELS).forEach(cfg=>{
      for(let i=1;i<=cfg.total;i++)if(done.has(`${cfg.prefix}-${String(i).padStart(2,'0')}`))totalDone++;
    });
    document.getElementById('metricLessons').textContent=totalDone;
    document.getElementById('metricAverage').textContent=`${avg}%`;
    document.getElementById('metricBest').textContent=`${best}%`;
    document.getElementById('metricLast').textContent=last?new Date(last).toLocaleDateString('ru-RU'):'—';

    const allowed=new Set((access||[]).map(x=>x.course_id));
    const codeById=Object.fromEntries((courses||[]).map(c=>[c.id,c.code]));
    const codes=[...allowed].map(id=>codeById[id]).filter(code=>LEVELS[code]);
    document.getElementById('studentCourseProgress').innerHTML=codes.length?codes.map(code=>{
      const cfg=LEVELS[code]; let n=0;
      for(let i=1;i<=cfg.total;i++)if(done.has(`${cfg.prefix}-${String(i).padStart(2,'0')}`))n++;
      const pct=Math.round(n/cfg.total*100);
      const final=done.has(`${cfg.prefix}-final`);
      return `<article class="teacher-course-card">
        <div class="teacher-course-card-head"><strong>${cfg.title}</strong><b>${pct}%</b></div>
        <div class="progressbar"><span style="width:${pct}%"></span></div>
        <small class="muted">${n}/${cfg.total} уроков · Final: ${final?'✓':'—'}</small>
      </article>`;
    }).join(''):'<p class="muted">Ученику пока не выданы курсы.</p>';

    document.getElementById('studentRecentQuizzes').innerHTML=(quizzes||[]).length?`
      <div class="teacher-quiz-list">${(quizzes||[]).slice(0,10).map(q=>`
        <div class="teacher-quiz-row">
          <strong>${q.lesson_key}</strong>
          <span class="badge ${q.passed?'active':'blocked'}">${q.score}%</span>
          <small class="muted">${new Date(q.created_at).toLocaleString('ru-RU')}</small>
        </div>`).join('')}</div>`:'<p class="muted">Тесты пока не проходились.</p>';
  }

  async function loadMiniChat(id, silent=false){
    const box=document.getElementById('teacherChatMessages');
    const {data,error}=await sb.rpc('get_teacher_student_messages',{
      p_other_user_id:id,
      p_limit:50
    });
    if(error){
      if(!silent) box.innerHTML='<p class="muted">Не удалось загрузить чат.</p>';
      return;
    }
    const rows=(data||[]).slice().reverse();
    box.innerHTML=rows.length?rows.map(m=>`
      <div class="teacher-msg ${m.sender_id===currentUser.id?'mine':''}">
        <div>${escapeHtml(m.body)}</div>
        <small>${new Date(m.created_at).toLocaleString('ru-RU')}</small>
      </div>`).join(''):'<p class="muted">Сообщений пока нет.</p>';
    box.scrollTop=box.scrollHeight;
    await sb.rpc('mark_teacher_student_messages_read',{p_other_user_id:id});
  }

  function escapeHtml(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  document.getElementById('teacherChatForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!selectedId)return;
    const input=document.getElementById('teacherChatInput');
    const body=input.value.trim(); if(!body)return;
    const {error}=await sb.rpc('send_teacher_student_message',{
      p_other_user_id:selectedId,
      p_body:body
    });
    if(error){alert(error.message);return}
    input.value='';
    await loadMiniChat(selectedId);
  });

  document.getElementById('removeStudentBtn').addEventListener('click',async()=>{
    if(!selectedId)return;
    const s=students.find(x=>x.student_id===selectedId);
    if(!confirm(`Убрать ${s?.full_name||'ученика'} из вашего класса? История сообщений сохранится, но чат станет недоступен до повторного добавления.`))return;
    const {error}=await sb.rpc('teacher_remove_student',{p_student_id:selectedId});
    if(error){alert(error.message);return}
    selectedId=null;
    workspace.classList.add('hidden');
    empty.classList.remove('hidden');
    if(chatTimer)clearInterval(chatTimer);
    await loadStudents();
  });

  await loadStudents();

  const wanted=new URLSearchParams(location.search).get('student');
  if(wanted && students.some(x=>x.student_id===wanted))selectStudent(wanted);
})();