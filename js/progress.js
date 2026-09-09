(async()=>{
  const profile=await bootGuard(); if(!profile)return;

  const LEVELS={
    'A1':{prefix:'a1',lesson:'lesson.html',final:'final-exam.html',cert:'certificate.html',title:'English A1'},
    'A2':{prefix:'a2',lesson:'a2-lesson.html',final:'a2-final-exam.html',cert:'a2-certificate.html',title:'English A2'},
    'KZ-A1':{prefix:'kz-a1',lesson:'kz-a1-lesson.html',final:'kz-a1-final-exam.html',cert:'kz-a1-certificate.html',title:'Қазақ тілі A1'},
    'KZ-A2':{prefix:'kz-a2',lesson:'kz-a2-lesson.html',final:'kz-a2-final-exam.html',cert:'kz-a2-certificate.html',title:'Қазақ тілі A2'},
    'KZ-B1':{prefix:'kz-b1',lesson:'kz-b1-lesson.html',final:'kz-b1-final-exam.html',cert:'kz-b1-certificate.html',title:'Қазақ тілі B1'},
    'KZ-B2':{prefix:'kz-b2',lesson:'kz-b2-lesson.html',final:'kz-b2-final-exam.html',cert:'kz-b2-certificate.html',title:'Қазақ тілі B2'},
    'KZ-C1':{prefix:'kz-c1',lesson:'kz-c1-lesson.html',final:'kz-c1-final-exam.html',cert:'kz-c1-certificate.html',title:'Қазақ тілі C1'}
  };

  const [{data:courses},{data:access},{data:progress},{data:quizzes}]=await Promise.all([
    sb.from('courses').select('*').order('sort_order'),
    sb.from('course_access').select('course_id,allowed').eq('user_id',currentUser.id),
    sb.from('lesson_progress').select('lesson_key,completed,completed_at').eq('user_id',currentUser.id).eq('completed',true),
    sb.from('quiz_results').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(500)
  ]);

  const allowed=new Set((access||[]).filter(x=>x.allowed).map(x=>x.course_id));
  if(profile.role==='admin')(courses||[]).forEach(c=>allowed.add(c.id));
  const byCode=Object.fromEntries((courses||[]).map(c=>[c.code,c]));
  const codes=Object.keys(LEVELS).filter(c=>byCode[c]&&allowed.has(byCode[c].id));
  const done=new Set((progress||[]).map(x=>x.lesson_key));

  function count(cfg){let n=0;for(let i=1;i<=30;i++)if(done.has(`${cfg.prefix}-${String(i).padStart(2,'0')}`))n++;return n}
  const totalDone=codes.reduce((s,c)=>s+count(LEVELS[c]),0), total=codes.length*30;
  const regular=(quizzes||[]).filter(q=>!String(q.lesson_key).endsWith('-final'));
  const avg=regular.length?Math.round(regular.reduce((s,q)=>s+Number(q.score||0),0)/regular.length):0;
  const best=regular.length?Math.max(...regular.map(q=>Number(q.score||0))):0;
  const certs=codes.filter(c=>done.has(`${LEVELS[c].prefix}-final`));

  document.getElementById('progressSummary').innerHTML=`
    <article class="progress-metric"><span>Уроки</span><strong>${totalDone}/${total||0}</strong></article>
    <article class="progress-metric"><span>Общий прогресс</span><strong>${total?Math.round(totalDone/total*100):0}%</strong></article>
    <article class="progress-metric"><span>Средний балл</span><strong>${avg}%</strong></article>
    <article class="progress-metric"><span>Лучший балл</span><strong>${best}%</strong></article>
  `;

  document.getElementById('levelProgress').innerHTML=codes.length?codes.map(code=>{
    const cfg=LEVELS[code],n=count(cfg),pct=Math.round(n/30*100),final=done.has(`${cfg.prefix}-final`);
    return `<article class="level-progress-card">
      <div class="level-progress-head"><div><div class="eyebrow">${code.startsWith('KZ-')?'ҚАЗАҚ ТІЛІ':'ENGLISH'}</div><h3>${cfg.title}</h3></div><strong>${pct}%</strong></div>
      <div class="progressbar"><span style="width:${pct}%"></span></div>
      <p class="muted">${n}/30 уроков · Final Exam: ${final?'✓ пройден':'не пройден'}</p>
      <a class="btn ghost" href="courses.html">Открыть курс</a>
    </article>`;
  }).join(''):'<div class="panel"><p class="muted">Нет доступных курсов.</p></div>';

  function routeFor(key){
    for(const [code,cfg] of Object.entries(LEVELS)){
      if(key===`${cfg.prefix}-final`)return cfg.final;
      if(key.startsWith(cfg.prefix+'-'))return `${cfg.lesson}?lesson=${key}`;
    }
    return 'courses.html';
  }

  // Последняя попытка по каждому уроку
  const latest=new Map();
  (quizzes||[]).forEach(q=>{if(!latest.has(q.lesson_key))latest.set(q.lesson_key,q)});
  const retry=[...latest.values()].filter(q=>!q.passed && !String(q.lesson_key).endsWith('-final')).slice(0,12);
  document.getElementById('retryList').innerHTML=retry.length?`
    <div class="retry-grid">${retry.map(q=>`
      <div class="retry-row">
        <div><strong>${q.lesson_key}</strong><small>Последний результат: ${q.score}% · ${new Date(q.created_at).toLocaleDateString('ru-RU')}</small></div>
        <a class="btn primary" href="${routeFor(q.lesson_key)}">Повторить</a>
      </div>`).join('')}</div>`:
      '<div class="message success">Отлично! Нет непройденных последних попыток.</div>';

  document.getElementById('certificateList').innerHTML=certs.length?certs.map(code=>{
    const cfg=LEVELS[code];
    return `<article class="cert-mini"><div class="cert-icon">🎓</div><div><div class="eyebrow">СЕРТИФИКАТ</div><h3>${cfg.title}</h3><p class="muted">Итоговый экзамен успешно пройден.</p></div><a class="btn primary" href="${cfg.cert}">Открыть</a></article>`;
  }).join(''):'<div class="panel"><p class="muted">Пока нет разблокированных сертификатов.</p></div>';

  document.getElementById('quizHistory').innerHTML=(quizzes||[]).length?`
    <div class="table-wrap"><table><thead><tr><th>Урок</th><th>Баллы</th><th>Статус</th><th>Попытка</th><th>Дата</th><th></th></tr></thead>
    <tbody>${(quizzes||[]).map(q=>`<tr>
      <td>${q.lesson_key}</td><td><strong>${q.score}%</strong></td>
      <td><span class="badge ${q.passed?'active':'blocked'}">${q.passed?'Пройден':'Не пройден'}</span></td>
      <td>${q.attempt||'—'}</td><td>${new Date(q.created_at).toLocaleString('ru-RU')}</td>
      <td><a href="${routeFor(q.lesson_key)}">Открыть</a></td>
    </tr>`).join('')}</tbody></table></div>`:'<div class="panel"><p class="muted">История тестов пуста.</p></div>';
})();