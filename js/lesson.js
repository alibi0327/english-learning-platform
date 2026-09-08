(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const key = new URLSearchParams(location.search).get('lesson') || A1_DATA.lessons[0].key;
  const idx = A1_DATA.lessons.findIndex(x => x.key === key);
  if (idx < 0) { location.href = 'courses.html'; return; }

  const { data: prog } = await sb.from('lesson_progress').select('lesson_key,completed').eq('user_id', currentUser.id).eq('completed', true);
  const completed = new Set((prog || []).map(x => x.lesson_key));
  const unlocked = idx === 0 || completed.has(A1_DATA.lessons[idx-1].key) || profile.role === 'admin';
  if (!unlocked) { location.href = 'courses.html'; return; }

  const lesson = A1_DATA.lessons[idx];
  document.title = `English Path — ${lesson.title}`;

  document.getElementById('lessonNav').innerHTML = A1_DATA.lessons.map((l, i) => {
    const isUnlocked = i === 0 || completed.has(A1_DATA.lessons[i-1].key) || profile.role === 'admin';
    return isUnlocked
      ? `<a class="${l.key===key?'active':''}" href="lesson.html?lesson=${l.key}">${i+1}. ${l.title}</a>`
      : `<a style="opacity:.45;pointer-events:none">🔒 ${i+1}. ${l.title}</a>`;
  }).join('');

  const vocab = lesson.vocab.map(v => `<tr><td><strong>${v[0]}</strong></td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`).join('');
  const examples = lesson.examples.map(e => `<div class="example"><strong>${e[0]}</strong><br><span class="muted">${e[1]}</span></div>`).join('');

  document.getElementById('lessonBody').innerHTML = `
    <div class="eyebrow">Урок ${idx+1}</div>
    <h1>${lesson.title}</h1>
    <p class="muted">${lesson.ru}</p>
    <h2>Объяснение</h2>
    ${lesson.theory.map(p=>`<p>${p}</p>`).join('')}
    <h2>Примеры</h2>${examples}
    <h2>Слова урока</h2>
    <table class="vocab-table"><thead><tr><th>English</th><th>Транскрипция</th><th>Перевод</th><th>Пример</th></tr></thead><tbody>${vocab}</tbody></table>
  `;

  const qa = document.getElementById('quizArea');
  qa.innerHTML = `
    <div class="eyebrow">Обязательный тест</div>
    <h2>Проверка знаний</h2>
    <p class="muted">Для открытия следующего урока необходимо набрать минимум ${APP_CONFIG.PASS_SCORE}%.</p>
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
    let correct = 0;
    lesson.quiz.forEach((q, qi) => {
      const chosen = Number(new FormData(e.target).get(`q${qi}`));
      if (chosen === q.answer) correct++;
    });
    const score = Math.round(correct / lesson.quiz.length * 100);
    const passed = score >= APP_CONFIG.PASS_SCORE;
    const result = document.getElementById('quizResult');

    const { data: attempts } = await sb.from('quiz_results').select('id').eq('user_id', currentUser.id).eq('lesson_key', lesson.key);
    await sb.from('quiz_results').insert({
      user_id: currentUser.id,
      course_id: (await sb.from('courses').select('id').eq('code','A1').single()).data.id,
      lesson_key: lesson.key,
      score, passed,
      attempt: (attempts?.length || 0) + 1
    });

    if (passed) {
      const course = (await sb.from('courses').select('id').eq('code','A1').single()).data;
      await sb.from('lesson_progress').upsert({
        user_id: currentUser.id,
        course_id: course.id,
        lesson_key: lesson.key,
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,course_id,lesson_key' });

      result.className = 'message success';
      const next = A1_DATA.lessons[idx+1];
      result.innerHTML = `Результат: <strong>${score}%</strong>. Тест пройден. ${next ? `<a href="lesson.html?lesson=${next.key}">Перейти к следующему уроку →</a>` : 'Уровень завершён.'}`;
    } else {
      result.className = 'message error';
      result.textContent = `Результат: ${score}%. Нужно минимум ${APP_CONFIG.PASS_SCORE}%. Повторите материал и попробуйте ещё раз.`;
    }
  });
})();
