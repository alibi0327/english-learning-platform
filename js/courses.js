(async () => {
  // Подгружаем новые уровни казахского, если они ещё не подключены в courses.html.
  async function ensureScript(globalName, src) {
    if (window[globalName]) return;
    await new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src && s.src.includes(src));
      if (existing) {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        // Если скрипт уже был загружен раньше.
        if (window[globalName]) resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src + '?v=20260909-1';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Не удалось загрузить ' + src));
      document.head.appendChild(s);
    });
  }

  try {
    await Promise.all([
      ensureScript('KZ_A2_DATA', 'data/kz-a2.js'),
      ensureScript('KZ_B1_DATA', 'data/kz-b1.js'),
      ensureScript('KZ_B2_DATA', 'data/kz-b2.js'),
      ensureScript('KZ_C1_DATA', 'data/kz-c1.js')
    ]);
  } catch (e) {
    console.error(e);
  }

  const profile = await bootGuard();
  if (!profile) return;

  const { data: courses } = await sb.from('courses').select('*').order('sort_order');
  const { data: access } = await sb.from('course_access')
    .select('course_id,allowed')
    .eq('user_id', currentUser.id);

  const { data: prog } = await sb.from('lesson_progress')
    .select('lesson_key,completed')
    .eq('user_id', currentUser.id)
    .eq('completed', true);

  const allowed = new Set((access || []).filter(x => x.allowed).map(x => x.course_id));
  if (profile.role === 'admin') (courses || []).forEach(c => allowed.add(c.id));

  const completed = new Set((prog || []).map(x => x.lesson_key));
  const root = document.getElementById('coursesList');

  const renderLevel = (c, data, prefix, lessonPage, finalPage, certPage) => {
    if (!data || !Array.isArray(data.lessons)) {
      return `<div class="course-accordion-body">
        <div class="coming-soon-card">
          <div class="eyebrow">ҚАЗАҚ ТІЛІ</div>
          <h3>${c.title}</h3>
          <p class="muted">Файлы учебного уровня не найдены. Проверьте папки data/ и js/ в GitHub.</p>
        </div>
      </div>`;
    }

    const done = data.lessons.filter(l => completed.has(l.key)).length;
    const percent = Math.round(done / data.lessons.length * 100);
    const allDone = done === data.lessons.length;
    const finalPassed = completed.has(`${prefix}-final`);

    return `<div class="course-accordion-body">
      <div class="a1-progress">
        <strong>Прогресс ${c.code.replace('KZ-','')}: ${done} / ${data.lessons.length} уроков — ${percent}%</strong>
        <div class="progress-line"><div style="width:${percent}%"></div></div>
      </div>

      <div class="lesson-items">${data.lessons.map((l, i) => {
        const unlocked = i === 0 || completed.has(data.lessons[i - 1].key) || profile.role === 'admin';
        const status = completed.has(l.key) ? '✓' : (unlocked ? '→' : '🔒');

        return unlocked
          ? `<a class="lesson-link" href="${lessonPage}?lesson=${l.key}">
               <span><b>${i + 1}. ${l.title}</b><small>${l.ru || ''}</small></span>
               <strong>${status}</strong>
             </a>`
          : `<div class="lesson-link locked">
               <span><b>${i + 1}. ${l.title}</b><small>${l.ru || ''}</small></span>
               <strong>${status}</strong>
             </div>`;
      }).join('')}</div>

      <div class="final-exam-box ${allDone || profile.role === 'admin' ? '' : 'locked'}">
        <div>
          <div class="eyebrow">ФИНАЛЬНАЯ ПРОВЕРКА</div>
          <h3>${c.code.replace('KZ-','')} Final Exam</h3>
          <p class="muted">40 вопросов. Проходной балл — ${APP_CONFIG.PASS_SCORE}%.</p>
        </div>
        ${allDone || profile.role === 'admin'
          ? `<a class="btn primary" href="${finalPage}">${finalPassed ? 'Пересдать экзамен' : 'Начать экзамен'}</a>`
          : `<span class="badge blocked">🔒 Сначала завершите ${data.lessons.length} уроков</span>`}
      </div>

      ${finalPassed
        ? `<div class="certificate-unlock">
             <div>
               <div class="eyebrow">${c.code.replace('KZ-','')} ЗАВЕРШЁН</div>
               <h3>🎓 Сертификат разблокирован</h3>
             </div>
             <a class="btn primary" href="${certPage}">Открыть сертификат</a>
           </div>`
        : ''}
    </div>`;
  };

  const levelMap = {
    'A1': {
      data: () => window.A1_DATA,
      prefix: 'a1',
      lesson: 'lesson.html',
      final: 'final-exam.html',
      cert: 'certificate.html'
    },
    'A2': {
      data: () => window.A2_DATA,
      prefix: 'a2',
      lesson: 'a2-lesson.html',
      final: 'a2-final-exam.html',
      cert: 'a2-certificate.html'
    },
    'KZ-A1': {
      data: () => window.KZ_A1_DATA,
      prefix: 'kz-a1',
      lesson: 'kz-a1-lesson.html',
      final: 'kz-a1-final-exam.html',
      cert: 'kz-a1-certificate.html'
    },
    'KZ-A2': {
      data: () => window.KZ_A2_DATA,
      prefix: 'kz-a2',
      lesson: 'kz-a2-lesson.html',
      final: 'kz-a2-final-exam.html',
      cert: 'kz-a2-certificate.html'
    },
    'KZ-B1': {
      data: () => window.KZ_B1_DATA,
      prefix: 'kz-b1',
      lesson: 'kz-b1-lesson.html',
      final: 'kz-b1-final-exam.html',
      cert: 'kz-b1-certificate.html'
    },
    'KZ-B2': {
      data: () => window.KZ_B2_DATA,
      prefix: 'kz-b2',
      lesson: 'kz-b2-lesson.html',
      final: 'kz-b2-final-exam.html',
      cert: 'kz-b2-certificate.html'
    },
    'KZ-C1': {
      data: () => window.KZ_C1_DATA,
      prefix: 'kz-c1',
      lesson: 'kz-c1-lesson.html',
      final: 'kz-c1-final-exam.html',
      cert: 'kz-c1-certificate.html'
    }
  };

  function renderCourse(c) {
    const ok = allowed.has(c.id);
    const row = document.createElement('section');
    row.className = 'course-row course-accordion';

    let body = '';

    if (ok && levelMap[c.code]) {
      const cfg = levelMap[c.code];
      body = renderLevel(
        c,
        cfg.data(),
        cfg.prefix,
        cfg.lesson,
        cfg.final,
        cfg.cert
      );
    } else if (ok) {
      body = `<div class="course-accordion-body">
        <p class="muted">Материалы уровня ${c.code} будут добавлены позже.</p>
      </div>`;
    }

    const displayCode = String(c.code).startsWith('KZ-')
      ? String(c.code).replace('KZ-', '')
      : c.code;

    row.innerHTML = `<button class="course-accordion-head" type="button" ${ok ? '' : 'disabled'}>
      <div class="level-badge">${displayCode}</div>
      <div class="course-accordion-title">
        <h2>${c.title}</h2>
        <p class="muted">${c.description || ''}</p>
      </div>
      <div class="course-accordion-status">
        ${ok
          ? '<span class="badge active">Доступ открыт</span>'
          : '<span class="badge blocked">Закрыт</span>'}
        ${ok
          ? '<span class="accordion-chevron">⌄</span>'
          : '<span>🔒</span>'}
      </div>
    </button>${body}`;

    if (ok) {
      const head = row.querySelector('.course-accordion-head');
      head.addEventListener('click', () => {
        const open = row.classList.toggle('open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    return row;
  }

  function addLanguageSection(title, subtitle, flag, list, className) {
    const section = document.createElement('section');
    section.className = `language-course-section ${className || ''}`;
    section.innerHTML = `
      <div class="language-section-head">
        <div class="language-flag">${flag}</div>
        <div>
          <div class="eyebrow">ЯЗЫКОВОЕ НАПРАВЛЕНИЕ</div>
          <h2>${title}</h2>
          <p class="muted">${subtitle}</p>
        </div>
      </div>
      <div class="language-level-list"></div>
    `;

    const listBox = section.querySelector('.language-level-list');
    list.forEach(c => listBox.appendChild(renderCourse(c)));
    root.appendChild(section);
  }

  const english = (courses || []).filter(c => !String(c.code).startsWith('KZ-'));
  const kazakh = (courses || []).filter(c => String(c.code).startsWith('KZ-'));

  addLanguageSection(
    'Английский язык',
    'English · A1 Beginner → C1 Advanced',
    '🇬🇧',
    english,
    'english-section'
  );

  addLanguageSection(
    'Қазақ тілі',
    'Қазақ тілі · A1 Бастауыш → C1 Жоғары',
    '🇰🇿',
    kazakh,
    'kazakh-section'
  );
})();