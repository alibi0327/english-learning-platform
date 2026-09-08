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
    row.className = 'course-row course-accordion';

    let detailsHtml = '';

    if (c.code === 'A1' && ok) {
      const doneA1 = A1_DATA.lessons.filter(l => completed.has(l.key)).length;
      const percent = Math.round(doneA1 / A1_DATA.lessons.length * 100);

      detailsHtml = `
        <div class="course-accordion-body" id="courseBody-${c.code}">
          <div style="margin:14px 0">
            <strong>Прогресс A1: ${doneA1} / ${A1_DATA.lessons.length} уроков — ${percent}%</strong>
            <div class="progress-line"><div style="width:${percent}%"></div></div>
          </div>
          <div class="lesson-items">
            ${A1_DATA.lessons.map((l, i) => {
              const unlocked = i === 0 || completed.has(A1_DATA.lessons[i-1].key) || profile.role === 'admin';
              const status = completed.has(l.key) ? '✓' : (unlocked ? '→' : '🔒');
              return unlocked
                ? `<a class="lesson-link" href="lesson.html?lesson=${encodeURIComponent(l.key)}">
                     <span>${i+1}. ${l.title}<small>${l.ru}</small></span><strong>${status}</strong>
                   </a>`
                : `<div class="lesson-link locked">
                     <span>${i+1}. ${l.title}<small>${l.ru}</small></span><strong>${status}</strong>
                   </div>`;
            }).join('')}
          </div>
        </div>
      `;
    } else if (ok) {
      detailsHtml = `
        <div class="course-accordion-body" id="courseBody-${c.code}">
          <p class="muted">Материалы уровня ${c.code} будут добавлены после завершения A1.</p>
        </div>
      `;
    }

    row.innerHTML = `
      <button class="course-accordion-head" type="button" ${ok ? '' : 'disabled'}>
        <div class="level-badge">${c.code}</div>
        <div class="course-accordion-title">
          <h2>${c.title}</h2>
          <p class="muted">${c.description || ''}</p>
        </div>
        <div class="course-accordion-status">
          ${ok ? '<span class="badge active">Доступ открыт</span>' : '<span class="badge blocked">Закрыт</span>'}
          ${ok ? '<span class="accordion-chevron">⌄</span>' : '<span>🔒</span>'}
        </div>
      </button>
      ${detailsHtml}
    `;

    box.appendChild(row);

    if (ok) {
      const head = row.querySelector('.course-accordion-head');
      const body = row.querySelector('.course-accordion-body');
      head.addEventListener('click', () => {
        const isOpen = row.classList.toggle('open');
        head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // A1 раскрываем автоматически при первом входе на страницу курсов.
      if (c.code === 'A1') {
        row.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
      }
    }
  });
})();
