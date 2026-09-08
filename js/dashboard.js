(async () => {
  const profile = await bootGuard();
  if (!profile) return;
  document.getElementById('welcomeTitle').textContent = `Добро пожаловать, ${profile.full_name || profile.email}`;

  const { data: courses } = await sb.from('courses').select('*').order('sort_order');
  const { data: access } = await sb.from('course_access').select('course_id,allowed').eq('user_id', currentUser.id);
  const { data: progress } = await sb.from('lesson_progress').select('*').eq('user_id', currentUser.id).eq('completed', true);

  const allowed = new Set((access || []).filter(x => x.allowed).map(x => x.course_id));
  if (profile.role === 'admin') (courses || []).forEach(c => allowed.add(c.id));

  const cards = document.getElementById('courseCards');
  let completed = (progress || []).length;
  document.getElementById('overallProgress').textContent = `${Math.min(100, completed * 20)}%`;

  (courses || []).forEach(c => {
    const ok = allowed.has(c.id);
    const el = document.createElement('div');
    el.className = `course-card ${ok ? '' : 'locked'}`;
    el.innerHTML = `
      <div class="eyebrow">${c.code}</div>
      <h3>${c.title}</h3>
      <p class="muted">${c.description || ''}</p>
      <div class="progressbar"><span style="width:${c.code === 'A1' ? Math.min(100, completed*20) : 0}%"></span></div>
      ${ok ? `<a class="btn primary" href="courses.html">Открыть курс</a>` : `<span class="badge">Доступ закрыт</span>`}
    `;
    cards.appendChild(el);
  });
})();
