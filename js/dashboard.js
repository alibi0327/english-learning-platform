(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  document.getElementById('welcomeTitle').textContent =
    `Добро пожаловать, ${profile.full_name || profile.email}`;

  const { data: courses } = await sb.from('courses').select('*').order('sort_order');
  const { data: access } = await sb.from('course_access').select('course_id,allowed').eq('user_id', currentUser.id);
  const { data: progress } = await sb.from('lesson_progress').select('lesson_key,completed').eq('user_id', currentUser.id).eq('completed', true);

  const allowed = new Set((access || []).filter(x => x.allowed).map(x => x.course_id));
  if (profile.role === 'admin') (courses || []).forEach(c => allowed.add(c.id));

  const completed = new Set((progress || []).filter(x=>x.completed).map(x=>x.lesson_key));
  const englishA1 = [...Array(30)].filter((_,i)=>completed.has(`a1-${String(i+1).padStart(2,'0')}`)).length;
  const englishA2 = [...Array(30)].filter((_,i)=>completed.has(`a2-${String(i+1).padStart(2,'0')}`)).length;

  const activeEnglish = (courses || []).filter(c => !String(c.code).startsWith('KZ-') && allowed.has(c.id));
  const activeKazakh = (courses || []).filter(c => String(c.code).startsWith('KZ-') && allowed.has(c.id));

  const englishPossible = 60;
  const englishDone = englishA1 + englishA2;
  const englishPercent = Math.round((englishDone / englishPossible) * 100);

  const totalPossible = activeEnglish.length ? englishPossible : 0;
  const overall = totalPossible ? englishPercent : 0;
  document.getElementById('overallProgress').textContent = `${Math.min(100, overall)}%`;

  const box = document.getElementById('languageCards');

  const card = ({flag,title,subtitle,levels,available,percent,extra}) => `
    <article class="language-dashboard-card">
      <div class="language-dashboard-top">
        <div class="language-flag large">${flag}</div>
        <div>
          <div class="eyebrow">${subtitle}</div>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="language-level-pills">${levels.map(l=>`<span>${l}</span>`).join('')}</div>
      <p class="muted">${extra}</p>
      <div class="progressbar"><span style="width:${percent}%"></span></div>
      <div class="language-card-footer">
        <strong>${available ? `Доступных уровней: ${available}` : 'Доступ пока не выдан'}</strong>
        <a class="btn ${available?'primary':'ghost'}" href="courses.html">${available?'Открыть':'Посмотреть'}</a>
      </div>
    </article>
  `;

  box.innerHTML =
    card({
      flag:'🇬🇧',
      title:'Английский язык',
      subtitle:'English courses',
      levels:['A1','A2','B1','B2','C1'],
      available:activeEnglish.length,
      percent:englishPercent,
      extra:'От Beginner до Advanced. A1 и A2 уже подключены к платформе.'
    }) +
    card({
      flag:'🇰🇿',
      title:'Қазақ тілі',
      subtitle:'Қазақ тілі курстары',
      levels:['A1','A2','B1','B2','C1'],
      available:activeKazakh.length,
      percent:0,
      extra:'Бастауыш деңгейден Жоғары деңгейге дейін. 5 уровней добавлены в систему.'
    });
})();