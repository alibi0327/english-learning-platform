(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const statusBox = document.getElementById('examStatus');
  const examArea = document.getElementById('examArea');

  const { data: progress, error: progressError } = await sb.from('lesson_progress')
    .select('lesson_key,completed')
    .eq('user_id', currentUser.id)
    .eq('completed', true);

  if (progressError) {
    statusBox.className = 'message error';
    statusBox.textContent = 'Не удалось загрузить прогресс.';
    return;
  }

  const completed = new Set((progress || []).map(x => x.lesson_key));
  const doneCount = A1_DATA.lessons.filter(l => completed.has(l.key)).length;
  const canTakeExam = doneCount === A1_DATA.lessons.length || profile.role === 'admin';
  const alreadyPassed = completed.has('a1-final');

  if (!canTakeExam) {
    statusBox.className = 'message error';
    statusBox.innerHTML = `Экзамен пока закрыт. Завершено <strong>${doneCount}/${A1_DATA.lessons.length}</strong> уроков. Сначала пройдите все уроки A1.`;
    examArea.innerHTML = `<a class="btn primary" href="courses.html">Вернуться к курсу</a>`;
    return;
  }

  if (alreadyPassed) {
    statusBox.className = 'message success';
    statusBox.innerHTML = `A1 Final Exam уже пройден. Вы можете пересдать его или открыть <a href="certificate.html"><strong>сертификат</strong></a>.`;
  }

  const exam = A1_DATA.finalExam;
  examArea.innerHTML = `
    <form id="finalExamForm">
      ${exam.map((q, qi) => `
        <div class="question final-question">
          <strong>${qi + 1}. ${q.q}</strong>
          ${q.options.map((o, oi) => `
            <label><input required type="radio" name="q${qi}" value="${oi}"> ${o}</label>
          `).join('')}
        </div>
      `).join('')}
      <div class="exam-submit-bar">
        <button class="btn primary" type="submit">Завершить A1 Final Exam</button>
        <span class="muted">Нужно минимум ${APP_CONFIG.PASS_SCORE}%</span>
      </div>
      <div id="finalResult" class="message"></div>
    </form>
  `;

  document.getElementById('finalExamForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = new FormData(e.target);
    let correct = 0;
    exam.forEach((q, qi) => {
      if (Number(form.get(`q${qi}`)) === q.answer) correct++;
    });

    const score = Math.round(correct / exam.length * 100);
    const passed = score >= APP_CONFIG.PASS_SCORE;
    const result = document.getElementById('finalResult');

    const { data: course, error: courseError } = await sb.from('courses')
      .select('id').eq('code','A1').single();

    if (courseError || !course) {
      result.className = 'message error';
      result.textContent = 'Не удалось определить курс A1.';
      return;
    }

    const { data: attempts } = await sb.from('quiz_results')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('lesson_key', 'a1-final');

    const attemptNumber = (attempts?.length || 0) + 1;

    const { error: quizError } = await sb.from('quiz_results').insert({
      user_id: currentUser.id,
      course_id: course.id,
      lesson_key: 'a1-final',
      score,
      passed,
      attempt: attemptNumber
    });

    if (quizError) {
      result.className = 'message error';
      result.textContent = 'Не удалось сохранить результат экзамена: ' + quizError.message;
      return;
    }

    if (passed) {
      const completedAt = new Date().toISOString();

      const { error: progressSaveError } = await sb.from('lesson_progress').upsert({
        user_id: currentUser.id,
        course_id: course.id,
        lesson_key: 'a1-final',
        completed: true,
        completed_at: completedAt,
        updated_at: completedAt
      }, { onConflict: 'user_id,course_id,lesson_key' });

      if (progressSaveError) {
        result.className = 'message error';
        result.textContent = 'Экзамен пройден, но статус не сохранился: ' + progressSaveError.message;
        return;
      }

      result.className = 'message success final-success';
      result.innerHTML = `
        <h3>🎉 A1 завершён!</h3>
        <p>Результат: <strong>${score}%</strong> (${correct}/${exam.length}). Попытка №${attemptNumber}.</p>
        <p>Вы успешно завершили первый этап обучения и разблокировали сертификат.</p>
        <a class="btn primary" href="certificate.html">🎓 Получить сертификат</a>
        <a class="btn ghost" href="courses.html">Вернуться к курсам</a>
      `;
    } else {
      result.className = 'message error';
      result.innerHTML = `
        Результат: <strong>${score}%</strong> (${correct}/${exam.length}). Попытка №${attemptNumber}.<br>
        Для завершения A1 нужно минимум ${APP_CONFIG.PASS_SCORE}%. Повторите темы и попробуйте ещё раз.
      `;
      result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
})();
