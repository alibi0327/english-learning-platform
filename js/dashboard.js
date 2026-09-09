(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const LEVELS = {
    'A1':    { lang:'en', total:30, prefix:'a1',    lesson:'lesson.html',       final:'final-exam.html',       cert:'certificate.html',       label:'English A1' },
    'A2':    { lang:'en', total:30, prefix:'a2',    lesson:'a2-lesson.html',    final:'a2-final-exam.html',    cert:'a2-certificate.html',    label:'English A2' },
    'KZ-A1': { lang:'kz', total:30, prefix:'kz-a1', lesson:'kz-a1-lesson.html', final:'kz-a1-final-exam.html', cert:'kz-a1-certificate.html', label:'Қазақ тілі A1' },
    'KZ-A2': { lang:'kz', total:30, prefix:'kz-a2', lesson:'kz-a2-lesson.html', final:'kz-a2-final-exam.html', cert:'kz-a2-certificate.html', label:'Қазақ тілі A2' },
    'KZ-B1': { lang:'kz', total:30, prefix:'kz-b1', lesson:'kz-b1-lesson.html', final:'kz-b1-final-exam.html', cert:'kz-b1-certificate.html', label:'Қазақ тілі B1' },
    'KZ-B2': { lang:'kz', total:30, prefix:'kz-b2', lesson:'kz-b2-lesson.html', final:'kz-b2-final-exam.html', cert:'kz-b2-certificate.html', label:'Қазақ тілі B2' },
    'KZ-C1': { lang:'kz', total:30, prefix:'kz-c1', lesson:'kz-c1-lesson.html', final:'kz-c1-final-exam.html', cert:'kz-c1-certificate.html', label:'Қазақ тілі C1' }
  };

  const welcome = document.getElementById('welcomeTitle');
  welcome.textContent = `Добро пожаловать, ${profile.full_name || profile.email}`;

  const [
    {data:courses, error:courseError},
    {data:access, error:accessError},
    {data:progress, error:progressError},
    {data:quizzes, error:quizError}
  ] = await Promise.all([
    sb.from('courses').select('*').order('sort_order'),
    sb.from('course_access').select('course_id,allowed').eq('user_id', currentUser.id),
    sb.from('lesson_progress').select('lesson_key,completed,completed_at').eq('user_id', currentUser.id).eq('completed', true),
    sb.from('quiz_results').select('lesson_key,score,passed,created_at').eq('user_id', currentUser.id).order('created_at',{ascending:false}).limit(300)
  ]);

  if (courseError || accessError || progressError || quizError) {
    document.getElementById('nextLessonCard').innerHTML = '<div class="message error">Не удалось загрузить данные. Обновите страницу.</div>';
    return;
  }

  const allowedIds = new Set((access||[]).filter(x=>x.allowed).map(x=>x.course_id));
  if (profile.role === 'admin') (courses||[]).forEach(c=>allowedIds.add(c.id));

  const courseByCode = Object.fromEntries((courses||[]).map(c=>[c.code,c]));
  const accessibleCodes = Object.keys(LEVELS).filter(code => courseByCode[code] && allowedIds.has(courseByCode[code].id));
  const completed = new Set((progress||[]).map(x=>x.lesson_key));

  function countLevel(cfg) {
    let n=0;
    for(let i=1;i<=cfg.total;i++){
      if(completed.has(`${cfg.prefix}-${String(i).padStart(2,'0')}`)) n++;
    }
    return n;
  }

  const totalPossible = accessibleCodes.reduce((s,c)=>s+LEVELS[c].total,0);
  const totalDone = accessibleCodes.reduce((s,c)=>s+countLevel(LEVELS[c]),0);
  const overall = totalPossible ? Math.round(totalDone/totalPossible*100) : 0;
  document.getElementById('overallProgress').textContent = `${overall}%`;
  document.getElementById('overallProgressBar').style.width = `${overall}%`;
  document.getElementById('lessonsValue').textContent = totalDone;

  const regular = (quizzes||[]).filter(q=>!String(q.lesson_key).endsWith('-final'));
  const avg = regular.length ? Math.round(regular.reduce((s,q)=>s+Number(q.score||0),0)/regular.length) : 0;
  document.getElementById('avgScoreValue').textContent = `${avg}%`;

  const certCount = accessibleCodes.filter(code=>completed.has(`${LEVELS[code].prefix}-final`)).length;
  document.getElementById('certValue').textContent = certCount;

  function localDateKey(value) {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const activeDays = new Set((quizzes||[]).map(q=>localDateKey(q.created_at)));
  let streak=0;
  let cursor=new Date();
  // Если сегодня активности нет, разрешаем считать серию от вчера.
  if(!activeDays.has(localDateKey(cursor))){
    cursor.setDate(cursor.getDate()-1);
  }
  while(activeDays.has(localDateKey(cursor))){
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  document.getElementById('streakValue').textContent = `${streak} ${streak===1?'день':(streak>=2&&streak<=4?'дня':'дней')}`;

  function nextForLevel(code) {
    const cfg=LEVELS[code];
    const done=countLevel(cfg);
    if(done < cfg.total){
      const i=done+1;
      const key=`${cfg.prefix}-${String(i).padStart(2,'0')}`;
      // если есть пропуски, ищем первый незавершённый, для которого предыдущий завершён
      for(let x=1;x<=cfg.total;x++){
        const k=`${cfg.prefix}-${String(x).padStart(2,'0')}`;
        const prev=x===1 || completed.has(`${cfg.prefix}-${String(x-1).padStart(2,'0')}`);
        if(!completed.has(k) && prev) return {code,cfg,index:x,key};
      }
      return {code,cfg,index:i,key};
    }
    if(!completed.has(`${cfg.prefix}-final`)) return {code,cfg,final:true};
    return null;
  }

  let next=null;
  for(const code of accessibleCodes){
    next=nextForLevel(code);
    if(next) break;
  }

  const nextBox=document.getElementById('nextLessonCard');
  const continueBtn=document.getElementById('continueBtn');
  if(next){
    const href=next.final ? next.cfg.final : `${next.cfg.lesson}?lesson=${next.key}`;
    continueBtn.href=href;
    continueBtn.textContent=next.final?'Перейти к Final Exam':'Продолжить урок';
    nextBox.innerHTML = `
      <div class="next-lesson-card">
        <div>
          <div class="eyebrow">${next.cfg.lang==='kz'?'ҚАЗАҚ ТІЛІ':'ENGLISH'} · ${next.code.replace('KZ-','')}</div>
          <h3>${next.final ? `${next.code.replace('KZ-','')} Final Exam` : `Урок ${next.index} из ${next.cfg.total}`}</h3>
          <p class="muted">${next.final ? 'Все уроки уровня завершены. Итоговая проверка уже доступна.' : 'Продолжите с первого доступного незавершённого урока.'}</p>
        </div>
        <a class="btn primary" href="${href}">${next.final?'Начать экзамен':'Открыть урок →'}</a>
      </div>`;
  } else if(accessibleCodes.length){
    continueBtn.href='progress.html';
    continueBtn.textContent='Посмотреть достижения';
    nextBox.innerHTML='<div class="next-lesson-card"><div><div class="eyebrow">ГОТОВО</div><h3>🎉 Все доступные курсы завершены</h3><p class="muted">Проверьте сертификаты и историю результатов.</p></div><a class="btn primary" href="progress.html">Открыть прогресс</a></div>';
  } else {
    continueBtn.href='courses.html';
    continueBtn.textContent='Посмотреть курсы';
    nextBox.innerHTML='<div class="message">Доступ к курсам пока не выдан. Обратитесь к администратору.</div>';
  }

  function langCard(lang, flag, title, subtitle){
    const codes=accessibleCodes.filter(c=>LEVELS[c].lang===lang);
    const possible=codes.reduce((s,c)=>s+LEVELS[c].total,0);
    const done=codes.reduce((s,c)=>s+countLevel(LEVELS[c]),0);
    const pct=possible?Math.round(done/possible*100):0;
    const allCodes=lang==='en'?['A1','A2','B1','B2','C1']:['KZ-A1','KZ-A2','KZ-B1','KZ-B2','KZ-C1'];
    const pills=allCodes.map(c=>{
      const label=c.replace('KZ-','');
      const enabled=codes.includes(c);
      const finished=LEVELS[c] && completed.has(`${LEVELS[c].prefix}-final`);
      return `<span class="${enabled?'available':''} ${finished?'finished':''}">${finished?'✓ ':''}${label}</span>`;
    }).join('');
    return `<article class="language-dashboard-card">
      <div class="language-dashboard-top"><div class="language-flag large">${flag}</div><div><div class="eyebrow">${subtitle}</div><h3>${title}</h3></div></div>
      <div class="language-level-pills">${pills}</div>
      <div class="language-progress-row"><span>${done} из ${possible||0} уроков</span><strong>${pct}%</strong></div>
      <div class="progressbar"><span style="width:${pct}%"></span></div>
      <div class="language-card-footer"><strong>${codes.length?`Доступных уровней: ${codes.length}`:'Доступ пока не выдан'}</strong><a class="btn ${codes.length?'primary':'ghost'}" href="courses.html">${codes.length?'Открыть':'Посмотреть'}</a></div>
    </article>`;
  }
  document.getElementById('languageCards').innerHTML =
    langCard('en','🇬🇧','Английский язык','ENGLISH') +
    langCard('kz','🇰🇿','Қазақ тілі','ҚАЗАҚ ТІЛІ');

  const perfect=(quizzes||[]).some(q=>Number(q.score)===100);
  const achievements=[
    {icon:'🌱',name:'Первый шаг',desc:'Завершить 1 урок',ok:totalDone>=1},
    {icon:'📘',name:'В ритме',desc:'Завершить 10 уроков',ok:totalDone>=10},
    {icon:'🏁',name:'30 уроков',desc:'Завершить 30 уроков',ok:totalDone>=30},
    {icon:'🔥',name:'Серия 3 дня',desc:'Учиться 3 дня подряд',ok:streak>=3},
    {icon:'⚡',name:'Серия 7 дней',desc:'Учиться 7 дней подряд',ok:streak>=7},
    {icon:'💯',name:'Идеальный тест',desc:'Получить 100%',ok:perfect},
    {icon:'🎓',name:'Первый сертификат',desc:'Завершить один уровень',ok:certCount>=1},
    {icon:'🏆',name:'Мастер пути',desc:'Завершить 100 уроков',ok:totalDone>=100}
  ];
  document.getElementById('achievementGrid').innerHTML=achievements.map(a=>`
    <article class="achievement ${a.ok?'unlocked':'locked'}">
      <div class="achievement-icon">${a.ok?a.icon:'🔒'}</div>
      <div><strong>${a.name}</strong><small>${a.desc}</small></div>
    </article>`).join('');

  const recent=(quizzes||[]).slice(0,6);
  document.getElementById('recentActivity').innerHTML=recent.length?`
    <div class="recent-list">${recent.map(q=>`
      <div class="recent-row">
        <div><strong>${q.lesson_key}</strong><small>${new Date(q.created_at).toLocaleString('ru-RU')}</small></div>
        <span class="badge ${q.passed?'active':'blocked'}">${q.score}%</span>
      </div>`).join('')}</div>
    <a class="btn ghost wide" href="progress.html">Вся история</a>`:
    '<p class="muted">Тесты пока не проходились.</p>';
})();