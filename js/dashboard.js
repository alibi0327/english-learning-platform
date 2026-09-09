(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const welcome = document.getElementById('welcomeTitle');
  if (welcome) {
    welcome.textContent = `Добро пожаловать, ${profile.full_name || profile.email}`;
  }

  const [{ data: courses, error: courseError },
         { data: access, error: accessError },
         { data: progress, error: progressError }] = await Promise.all([
    sb.from('courses').select('*').order('sort_order'),
    sb.from('course_access').select('course_id,allowed').eq('user_id', currentUser.id),
    sb.from('lesson_progress').select('lesson_key,completed').eq('user_id', currentUser.id).eq('completed', true)
  ]);

  const box = document.getElementById('languageCards');

  if (courseError || accessError || progressError) {
    if (box) {
      box.innerHTML = `
        <div class="panel">
          <div class="message error">
            Не удалось загрузить курсы. Обновите страницу.
          </div>
        </div>`;
    }
    return;
  }

  const allowed = new Set(
    (access || []).filter(x => x.allowed).map(x => x.course_id)
  );

  if (profile.role === 'admin') {
    (courses || []).forEach(c => allowed.add(c.id));
  }

  const completed = new Set(
    (progress || []).filter(x => x.completed).map(x => x.lesson_key)
  );

  const countLessons = prefix =>
    [...Array(30)].filter((_, i) =>
      completed.has(`${prefix}-${String(i + 1).padStart(2, '0')}`)
    ).length;

  const englishA1 = countLessons('a1');
  const englishA2 = countLessons('a2');
  const kazakhA1  = countLessons('kz-a1');

  const activeEnglish = (courses || []).filter(c =>
    !String(c.code).startsWith('KZ-') && allowed.has(c.id)
  );

  const activeKazakh = (courses || []).filter(c =>
    String(c.code).startsWith('KZ-') && allowed.has(c.id)
  );

  const englishPercent = Math.round(((englishA1 + englishA2) / 60) * 100);
  const kazakhPercent = Math.round((kazakhA1 / 30) * 100);

  const availableProgress = [];
  if (activeEnglish.length) availableProgress.push(englishPercent);
  if (activeKazakh.length) availableProgress.push(kazakhPercent);

  const overall = availableProgress.length
    ? Math.round(availableProgress.reduce((a,b)=>a+b,0) / availableProgress.length)
    : 0;

  const overallEl = document.getElementById('overallProgress');
  if (overallEl) overallEl.textContent = `${Math.min(100, overall)}%`;

  const card = ({flag,title,subtitle,levels,available,percent,extra}) => `
    <article class="language-dashboard-card">
      <div class="language-dashboard-top">
        <div class="language-flag large">${flag}</div>
        <div>
          <div class="eyebrow">${subtitle}</div>
          <h3>${title}</h3>
        </div>
      </div>

      <div class="language-level-pills">
        ${levels.map(l => `<span>${l}</span>`).join('')}
      </div>

      <p class="muted">${extra}</p>

      <div class="language-progress-row">
        <span>Прогресс</span>
        <strong>${percent}%</strong>
      </div>

      <div class="progressbar">
        <span style="width:${Math.max(0, Math.min(100, percent))}%"></span>
      </div>

      <div class="language-card-footer">
        <strong>
          ${available
            ? `Доступных уровней: ${available}`
            : 'Доступ пока не выдан'}
        </strong>

        <a class="btn ${available ? 'primary' : 'ghost'}" href="courses.html">
          ${available ? 'Открыть курсы' : 'Посмотреть'}
        </a>
      </div>
    </article>
  `;

  if (box) {
    box.innerHTML =
      card({
        flag: '🇬🇧',
        title: 'Английский язык',
        subtitle: 'ENGLISH',
        levels: ['A1','A2','B1','B2','C1'],
        available: activeEnglish.length,
        percent: englishPercent,
        extra: `A1: ${englishA1}/30 уроков · A2: ${englishA2}/30 уроков`
      }) +
      card({
        flag: '🇰🇿',
        title: 'Қазақ тілі',
        subtitle: 'ҚАЗАҚ ТІЛІ',
        levels: ['A1','A2','B1','B2','C1'],
        available: activeKazakh.length,
        percent: kazakhPercent,
        extra: `A1: ${kazakhA1}/30 уроков · A2–C1 добавлены как уровни`
      });
  }
})();