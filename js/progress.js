(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const { data: progress } = await sb.from('lesson_progress')
    .select('*').eq('user_id', currentUser.id).eq('completed', true);

  const { data: quizzes } = await sb.from('quiz_results')
    .select('*').eq('user_id', currentUser.id)
    .order('created_at', {ascending:false}).limit(100);

  const doneKeys = new Set((progress || []).map(x => x.lesson_key));
  const doneA1 = A1_DATA.lessons.filter(l => doneKeys.has(l.key)).length;
  const finalPassed = doneKeys.has('a1-final');
  const lessonsPercent = Math.round(doneA1 / A1_DATA.lessons.length * 100);

  const regularQuizzes = (quizzes || []).filter(q => q.lesson_key !== 'a1-final');
  const best = regularQuizzes.length ? Math.max(...regularQuizzes.map(q => Number(q.score))) : 0;
  const avg = regularQuizzes.length ? Math.round(regularQuizzes.reduce((a,q)=>a+Number(q.score),0)/regularQuizzes.length) : 0;

  const finalScores = (quizzes || []).filter(q => q.lesson_key === 'a1-final' && q.passed);
  const finalBest = finalScores.length ? Math.max(...finalScores.map(q => Number(q.score))) : 0;

  const names = Object.fromEntries(A1_DATA.lessons.map((l,i)=>[l.key, `${i+1}. ${l.title}`]));
  names['a1-final'] = 'A1 Final Exam';

  document.getElementById('progressSummary').innerHTML = `
    <div class="metric"><span>Уроки A1</span><strong>${doneA1}/${A1_DATA.lessons.length}</strong></div>
    <div class="metric"><span>Учебный прогресс</span><strong>${lessonsPercent}%</strong></div>
    <div class="metric"><span>Средний балл</span><strong>${avg}%</strong></div>
    <div class="metric"><span>Final Exam</span><strong>${finalPassed ? `${finalBest}% ✓` : 'Не пройден'}</strong></div>
    <div style="grid-column:1/-1"><div class="progress-line"><div style="width:${lessonsPercent}%"></div></div></div>
    ${finalPassed ? `
      <div class="certificate-progress-card" style="grid-column:1/-1">
        <div><strong>🎓 A1 завершён</strong><br><span class="muted">Сертификат разблокирован.</span></div>
        <a class="btn primary" href="certificate.html">Открыть сертификат</a>
      </div>` : ''}
  `;

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
