(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const { data: progress } = await sb.from('lesson_progress').select('*').eq('user_id', currentUser.id).eq('completed', true);
  const { data: quizzes } = await sb.from('quiz_results').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false}).limit(50);

  const doneKeys = new Set((progress || []).map(x => x.lesson_key));
  const doneA1 = A1_DATA.lessons.filter(l => doneKeys.has(l.key)).length;
  const percentA1 = Math.round(doneA1 / A1_DATA.lessons.length * 100);
  const best = quizzes?.length ? Math.max(...quizzes.map(q=>Number(q.score))) : 0;
  const avg = quizzes?.length ? Math.round(quizzes.reduce((a,q)=>a+Number(q.score),0)/quizzes.length) : 0;
  const names = Object.fromEntries(A1_DATA.lessons.map((l,i)=>[l.key, `${i+1}. ${l.title}`]));

  document.getElementById('progressSummary').innerHTML = `
    <div class="metric"><span>A1 пройдено</span><strong>${doneA1}/${A1_DATA.lessons.length}</strong></div>
    <div class="metric"><span>Прогресс A1</span><strong>${percentA1}%</strong></div>
    <div class="metric"><span>Средний балл</span><strong>${avg}%</strong></div>
    <div class="metric"><span>Лучший результат</span><strong>${best}%</strong></div>
    <div style="grid-column:1/-1"><div class="progress-line"><div style="width:${percentA1}%"></div></div></div>`;

  document.getElementById('quizHistory').innerHTML = quizzes?.length ? `
    <div class="table-wrap"><table><thead><tr><th>Урок</th><th>Результат</th><th>Статус</th><th>Попытка</th><th>Дата</th></tr></thead>
    <tbody>${quizzes.map(q=>`<tr>
      <td>${names[q.lesson_key] || q.lesson_key}</td>
      <td>${q.score}%</td>
      <td><span class="badge ${q.passed?'active':'blocked'}">${q.passed?'Пройден':'Не пройден'}</span></td>
      <td>${q.attempt || '—'}</td>
      <td>${new Date(q.created_at).toLocaleString('ru-RU')}</td>
    </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Тесты пока не проходились.</p>';
})();
