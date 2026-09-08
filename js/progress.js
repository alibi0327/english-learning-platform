(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const { data: progress } = await sb.from('lesson_progress').select('*').eq('user_id', currentUser.id).eq('completed', true);
  const { data: quizzes } = await sb.from('quiz_results').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false}).limit(20);

  const done = progress?.length || 0;
  const best = quizzes?.length ? Math.max(...quizzes.map(q=>Number(q.score))) : 0;
  const avg = quizzes?.length ? Math.round(quizzes.reduce((a,q)=>a+Number(q.score),0)/quizzes.length) : 0;

  document.getElementById('progressSummary').innerHTML = `
    <div class="metric"><span>Пройдено уроков</span><strong>${done}</strong></div>
    <div class="metric"><span>Попыток тестов</span><strong>${quizzes?.length || 0}</strong></div>
    <div class="metric"><span>Средний балл</span><strong>${avg}%</strong></div>
    <div class="metric"><span>Лучший результат</span><strong>${best}%</strong></div>`;

  document.getElementById('quizHistory').innerHTML = quizzes?.length ? `
    <div class="table-wrap"><table><thead><tr><th>Урок</th><th>Результат</th><th>Статус</th><th>Дата</th></tr></thead>
    <tbody>${quizzes.map(q=>`<tr><td>${q.lesson_key}</td><td>${q.score}%</td><td><span class="badge ${q.passed?'active':'blocked'}">${q.passed?'Пройден':'Не пройден'}</span></td><td>${new Date(q.created_at).toLocaleString('ru-RU')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Тесты пока не проходились.</p>';
})();
