(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const key = new URLSearchParams(location.search).get('lesson') || A2_DATA.lessons[0].key;
  const idx = A2_DATA.lessons.findIndex(x => x.key === key);
  if (idx < 0) { location.href = 'courses.html'; return; }

  const { data: prog } = await sb.from('lesson_progress')
    .select('lesson_key,completed')
    .eq('user_id', currentUser.id)
    .eq('completed', true);

  const completed = new Set((prog || []).map(x => x.lesson_key));
  const unlocked = idx === 0 || completed.has(A2_DATA.lessons[idx-1].key) || profile.role === 'admin';
  if (!unlocked) { location.href = 'courses.html'; return; }

  const lesson = A2_DATA.lessons[idx];
  document.title = `English Path — A2 — ${lesson.title}`;

  document.getElementById('lessonNav').innerHTML = A2_DATA.lessons.map((l, i) => {
    const isUnlocked = i === 0 || completed.has(A2_DATA.lessons[i-1].key) || profile.role === 'admin';
    const done = completed.has(l.key);
    return isUnlocked
      ? `<a class="${l.key===key?'active':''}" href="a2-lesson.html?lesson=${l.key}">${done?'✓ ':''}${i+1}. ${l.title}</a>`
      : `<a style="opacity:.45;pointer-events:none">🔒 ${i+1}. ${l.title}</a>`;
  }).join('');

  const vocab = lesson.vocab.map(v =>
    `<tr><td><strong>${v[0]}</strong></td><td>${v[1] || '—'}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`
  ).join('');

  const examples = lesson.examples.map(e =>
    `<div class="example"><strong>${e[0]}</strong><br><span class="muted">${e[1]}</span></div>`
  ).join('');

  const grammar = lesson.grammar?.length
    ? `<h2>Правило в таблице</h2>
       <div class="table-wrap"><table class="vocab-table">
       <thead><tr>${lesson.grammar[0].map(x=>`<th>${x}</th>`).join('')}</tr></thead>
       <tbody>${lesson.grammar.slice(1).map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody>
       </table></div>` : '';

  const practice = lesson.practice?.length
    ? `<h2>Практика перед тестом</h2>
       <div class="practice-list">${lesson.practice.map((p,i)=>`
         <div class="question">
           <strong>${i+1}. ${p.q}</strong>
           <p class="muted">${p.hint || ''}</p>
           <button class="btn ghost practice-answer-btn" type="button" data-answer="${encodeURIComponent(p.a)}">Показать ответ</button>
           <div class="practice-answer message" style="display:none"></div>
         </div>`).join('')}</div>` : '';

  document.getElementById('lessonBody').innerHTML = `
    <div class="eyebrow">A2 ELEMENTARY · УРОК ${idx+1} ИЗ ${A2_DATA.lessons.length}</div>
    <h1>${lesson.title}</h1>
    <p class="muted">${lesson.ru}</p>
    <div class="progress-line"><div style="width:${Math.round((idx+1)/A2_DATA.lessons.length*100)}%"></div></div>
    <h2>Объяснение</h2>
    ${lesson.theory.map(p=>`<p>${p}</p>`).join('')}
    ${grammar}
    <h2>Примеры</h2>${examples}
    <h2>Слова урока</h2>
    <div class="table-wrap"><table class="vocab-table">
      <thead><tr><th>English</th><th>Транскрипция</th><th>Перевод</th><th>Пример</th></tr></thead>
      <tbody>${vocab}</tbody>
    </table></div>
    ${practice}
  `;

  document.querySelectorAll('.practice-answer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.nextElementSibling;
      box.style.display = 'block';
      box.className = 'practice-answer message success';
      box.textContent = `Ответ: ${decodeURIComponent(btn.dataset.answer)}`;
      btn.style.display = 'none';
    });
  });

  const qa = document.getElementById('quizArea');
  qa.innerHTML = `
    <div class="eyebrow">ОБЯЗАТЕЛЬНЫЙ ТЕСТ</div>
    <h2>Проверка знаний</h2>
    <p class="muted">Следующий урок откроется после результата не ниже ${APP_CONFIG.PASS_SCORE}%.</p>
    <form id="quizForm">
      ${lesson.quiz.map((q, qi)=>`
        <div class="question"><strong>${qi+1}. ${q.q}</strong>
          ${q.options.map((o, oi)=>`<label><input required type="radio" name="q${qi}" value="${oi}"> ${o}</label>`).join('')}
        </div>`).join('')}
      <button class="btn primary" type="submit">Завершить тест</button>
      <div id="quizResult" class="message"></div>
    </form>
  `;

  document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    let correct = 0;
    lesson.quiz.forEach((q, qi) => { if (Number(form.get(`q${qi}`)) === q.answer) correct++; });
    const score = Math.round(correct / lesson.quiz.length * 100);
    const passed = score >= APP_CONFIG.PASS_SCORE;
    const result = document.getElementById('quizResult');

    const { data: course, error: courseError } = await sb.from('courses').select('id').eq('code','A2').single();
    if (courseError || !course) {
      result.className = 'message error';
      result.textContent = 'Не удалось определить курс A2.';
      return;
    }

    const { data: attempts } = await sb.from('quiz_results')
      .select('id').eq('user_id', currentUser.id).eq('lesson_key', lesson.key);

    await sb.from('quiz_results').insert({
      user_id: currentUser.id, course_id: course.id, lesson_key: lesson.key,
      score, passed, attempt: (attempts?.length || 0)+1
    });

    if (passed) {
      await sb.from('lesson_progress').upsert({
        user_id: currentUser.id, course_id: course.id, lesson_key: lesson.key,
        completed:true, completed_at:new Date().toISOString(), updated_at:new Date().toISOString()
      }, { onConflict:'user_id,course_id,lesson_key' });

      const next = A2_DATA.lessons[idx+1];
      result.className='message success';
      result.innerHTML = `Результат: <strong>${score}%</strong>. Тест пройден. ${
        next ? `<a class="btn primary" style="margin-left:10px" href="a2-lesson.html?lesson=${next.key}">Следующий урок →</a>`
             : `<a class="btn primary" style="margin-left:10px" href="a2-final-exam.html">Перейти к A2 Final Exam →</a>`
      }`;
    } else {
      result.className='message error';
      result.innerHTML=`Результат: <strong>${score}%</strong>. Нужно минимум ${APP_CONFIG.PASS_SCORE}%.`;
    }
  });
})();
