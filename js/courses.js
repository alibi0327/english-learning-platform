(async () => {
  const profile = await bootGuard();
  if (!profile) return;
  const {data:courses}=await sb.from('courses').select('*').order('sort_order');
  const {data:access}=await sb.from('course_access').select('course_id,allowed').eq('user_id',currentUser.id);
  const {data:prog}=await sb.from('lesson_progress').select('lesson_key,completed').eq('user_id',currentUser.id).eq('completed',true);
  const allowed=new Set((access||[]).filter(x=>x.allowed).map(x=>x.course_id));
  if(profile.role==='admin')(courses||[]).forEach(c=>allowed.add(c.id));
  const completed=new Set((prog||[]).map(x=>x.lesson_key)), box=document.getElementById('coursesList');

  const renderLevel=(c,data,prefix,lessonPage,finalPage,certPage)=>{
    const done=data.lessons.filter(l=>completed.has(l.key)).length;
    const percent=Math.round(done/data.lessons.length*100);
    const allDone=done===data.lessons.length;
    const finalPassed=completed.has(`${prefix}-final`);
    return `<div class="course-accordion-body">
      <div class="a1-progress"><strong>Прогресс ${c.code}: ${done} / ${data.lessons.length} уроков — ${percent}%</strong><div class="progress-line"><div style="width:${percent}%"></div></div></div>
      <div class="lesson-items">${data.lessons.map((l,i)=>{
        const unlocked=i===0||completed.has(data.lessons[i-1].key)||profile.role==='admin';
        const status=completed.has(l.key)?'✓':(unlocked?'→':'🔒');
        return unlocked?`<a class="lesson-link" href="${lessonPage}?lesson=${l.key}"><span><b>${i+1}. ${l.title}</b><small>${l.ru}</small></span><strong>${status}</strong></a>`
        :`<div class="lesson-link locked"><span><b>${i+1}. ${l.title}</b><small>${l.ru}</small></span><strong>${status}</strong></div>`;
      }).join('')}</div>
      <div class="final-exam-box ${allDone||profile.role==='admin'?'':'locked'}"><div><div class="eyebrow">ФИНАЛЬНАЯ ПРОВЕРКА</div><h3>${c.code} Final Exam</h3><p class="muted">40 вопросов. Проходной балл — ${APP_CONFIG.PASS_SCORE}%.</p></div>${allDone||profile.role==='admin'?`<a class="btn primary" href="${finalPage}">${finalPassed?'Пересдать экзамен':'Начать экзамен'}</a>`:`<span class="badge blocked">🔒 Сначала завершите ${data.lessons.length} уроков</span>`}</div>
      ${finalPassed?`<div class="certificate-unlock"><div><div class="eyebrow">${c.code} ЗАВЕРШЁН</div><h3>🎓 Сертификат разблокирован</h3></div><a class="btn primary" href="${certPage}">Открыть сертификат</a></div>`:''}
    </div>`;
  };

  (courses||[]).forEach(c=>{
    const ok=allowed.has(c.id), row=document.createElement('section'); row.className='course-row course-accordion';
    let body='';
    if(ok&&c.code==='A1') body=renderLevel(c,A1_DATA,'a1','lesson.html','final-exam.html','certificate.html');
    else if(ok&&c.code==='A2') body=renderLevel(c,A2_DATA,'a2','a2-lesson.html','a2-final-exam.html','a2-certificate.html');
    else if(ok) body=`<div class="course-accordion-body"><p class="muted">Материалы уровня ${c.code} будут добавлены позже.</p></div>`;
    row.innerHTML=`<button class="course-accordion-head" type="button" ${ok?'':'disabled'}><div class="level-badge">${c.code}</div><div class="course-accordion-title"><h2>${c.title}</h2><p class="muted">${c.description||''}</p></div><div class="course-accordion-status">${ok?'<span class="badge active">Доступ открыт</span>':'<span class="badge blocked">Закрыт</span>'}${ok?'<span class="accordion-chevron">⌄</span>':'<span>🔒</span>'}</div></button>${body}`;
    box.appendChild(row);
    if(ok){const head=row.querySelector('.course-accordion-head');head.addEventListener('click',()=>{const open=row.classList.toggle('open');head.setAttribute('aria-expanded',open?'true':'false');});}
  });
})();
