(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const { data: courses } = await sb.from('courses').select('*').order('sort_order');
  const { data: access } = await sb.from('course_access').select('course_id,allowed').eq('user_id', currentUser.id);
  const { data: prog } = await sb.from('lesson_progress').select('lesson_key,completed').eq('user_id', currentUser.id).eq('completed', true);

  const allowed = new Set((access || []).filter(x => x.allowed).map(x => x.course_id));
  if (profile.role === 'admin') (courses || []).forEach(c => allowed.add(c.id));
  const completed = new Set((prog || []).map(x => x.lesson_key));
  const box = document.getElementById('coursesList');

  (courses || []).forEach(c => {
    const ok = allowed.has(c.id);
    const row = document.createElement('section');
    row.className = 'course-row';
    let lessonsHtml = '';

    if (c.code === 'A1' && ok) {
      const doneA1 = A1_DATA.lessons.filter(l => completed.has(l.key)).length;
      const percent = Math.round(doneA1 / A1_DATA.lessons.length * 100);

      lessonsHtml = `
        <div style="margin:14px 0">
          <strong>Прогресс A1: ${doneA1} / ${A1_DATA.lessons.length} уроков — ${percent}%</strong>
          <div class="progress-line"><div style="width:${percent}%"></div></div>
        </div>
        <div class="lesson-items">` + A1_DATA.lessons.map((l, i) => {
          const unlocked = i === 0 || completed.has(A1_DATA.lessons[i-1].key) || profile.role === 'admin';
          const status = completed.has(l.key) ? '✓' : (unlocked ? '→' : '🔒');
          return unlocked
            ? `<a class="lesson-link" href="lesson.html?lesson=${encodeURIComponent(l.key)}"><span>${i+1}. ${l.title} — ${l.ru}</span><strong>${status}</strong></a>`
            : `<div class="lesson-link locked"><span>${i+1}. ${l.title} — ${l.ru}</span><strong>${status}</strong></div>`;
        }).join('') + `</div>`;
    }

    row.innerHTML = `
      <div class="level-badge">${c.code}</div>
      <div><h2>${c.title}</h2><p class="muted">${c.description || ''}</p>${lessonsHtml}</div>
      <div>${ok ? '<span class="badge active">Доступ открыт</span>' : '<span class="badge blocked">Закрыт</span>'}</div>
    `;
    box.appendChild(row);
  });
})();
