let courses = [];
let users = [];
let accessRows = [];
let currentAdminId = null;
let progressRows = [];
let quizRows = [];

const COURSE_TOTALS = {
  A1: 30,
  A2: 30
};

function getCourseByCode(code) {
  return courses.find(c => c.code === code);
}

function userCourseProgress(userId, code) {
  const total = COURSE_TOTALS[code] || 0;
  const keys = new Set(
    progressRows
      .filter(p => p.user_id === userId && p.completed && String(p.lesson_key || '').startsWith(code.toLowerCase() + '-'))
      .map(p => p.lesson_key)
  );

  // Final exam is stored separately and must not count as one of the 30 lessons.
  keys.delete(`${code.toLowerCase()}-final`);

  const done = keys.size;
  const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  const finalPassed = progressRows.some(
    p => p.user_id === userId &&
         p.lesson_key === `${code.toLowerCase()}-final` &&
         p.completed
  );

  const courseQuizRows = quizRows.filter(
    q => q.user_id === userId &&
         String(q.lesson_key || '').startsWith(code.toLowerCase() + '-')
  );

  const regularQuizRows = courseQuizRows.filter(q => q.lesson_key !== `${code.toLowerCase()}-final`);
  const avg = regularQuizRows.length
    ? Math.round(regularQuizRows.reduce((sum, q) => sum + Number(q.score || 0), 0) / regularQuizRows.length)
    : 0;

  const finalResults = courseQuizRows
    .filter(q => q.lesson_key === `${code.toLowerCase()}-final`)
    .sort((a,b) => Number(b.score || 0) - Number(a.score || 0));

  return {
    total,
    done,
    percent,
    avg,
    finalPassed,
    finalScore: finalResults[0]?.score ?? null
  };
}

function getLastActivity(userId) {
  const dates = [];

  progressRows
    .filter(p => p.user_id === userId)
    .forEach(p => {
      if (p.updated_at) dates.push(new Date(p.updated_at));
      else if (p.completed_at) dates.push(new Date(p.completed_at));
    });

  quizRows
    .filter(q => q.user_id === userId && q.created_at)
    .forEach(q => dates.push(new Date(q.created_at)));

  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function trainingStatusHtml(userId) {
  const accessibleCodes = courses
    .filter(c => accessRows.some(a => a.user_id === userId && a.course_id === c.id && a.allowed))
    .map(c => c.code);

  if (!accessibleCodes.length) return '<span class="muted">Нет обучения</span>';

  const blocks = accessibleCodes.map(code => {
    if (!COURSE_TOTALS[code]) {
      const label = code.startsWith('KZ-') ? `Қазақ тілі ${code.replace('KZ-','')}` : code;
      return `<span class="badge">${label}: доступ</span>`;
    }
    const s = userCourseProgress(userId, code);

    if (s.finalPassed) {
      return `<span class="badge active">${code}: завершён ✓</span>`;
    }

    if (s.done === 0) {
      return `<span class="badge">${code}: 0%</span>`;
    }

    return `<span class="badge">${code}: ${s.percent}%</span>`;
  });

  return `<div class="course-tags">${blocks.join('')}</div>`;
}

function formatDateTime(date) {
  if (!date) return 'Нет активности';
  return date.toLocaleString('ru-RU', {
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  });
}

window.openStudentStatus = (id) => {
  const u = users.find(x => x.id === id);
  if (!u) return;

  const accessCodes = courses
    .filter(c => accessRows.some(a => a.user_id === id && a.course_id === c.id && a.allowed))
    .map(c => c.code);

  const userQuizzes = quizRows.filter(q => q.user_id === id);
  const passedQuizzes = userQuizzes.filter(q => q.passed);
  const avgAll = userQuizzes.length
    ? Math.round(userQuizzes.reduce((sum,q)=>sum+Number(q.score||0),0)/userQuizzes.length)
    : 0;
  const bestAll = userQuizzes.length
    ? Math.max(...userQuizzes.map(q=>Number(q.score||0)))
    : 0;

  document.getElementById('studentStatusName').textContent =
    `${u.full_name || 'Без имени'} — ${u.email || ''}`;

  const cards = [
    ['Статус аккаунта', u.status === 'active' ? 'Активен' : 'Заблокирован'],
    ['Доступные уровни', accessCodes.length ? accessCodes.join(', ') : 'Нет доступа'],
    ['Попыток тестов', userQuizzes.length],
    ['Средний балл', userQuizzes.length ? `${avgAll}%` : '—'],
    ['Лучший результат', userQuizzes.length ? `${bestAll}%` : '—'],
    ['Последняя активность', formatDateTime(getLastActivity(id))]
  ];

  document.getElementById('studentStatusSummary').innerHTML = cards.map(([label,value]) => `
    <div class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');

  const levels = ['A1','A2']
    .filter(code => accessCodes.includes(code) || progressRows.some(p => p.user_id === id && String(p.lesson_key||'').startsWith(code.toLowerCase() + '-')))
    .map(code => {
      const s = userCourseProgress(id, code);

      return `
        <div class="student-level-card">
          <div class="student-level-head">
            <div>
              <div class="eyebrow">${code}</div>
              <h3>${s.finalPassed ? 'Уровень завершён' : 'Обучение продолжается'}</h3>
            </div>
            <span class="badge ${s.finalPassed ? 'active' : ''}">
              ${s.finalPassed ? '✓ Завершён' : `${s.percent}%`}
            </span>
          </div>

          <div class="progress-line"><div style="width:${s.percent}%"></div></div>

          <div class="student-status-grid">
            <div><span>Уроков</span><strong>${s.done}/${s.total}</strong></div>
            <div><span>Средний балл</span><strong>${s.avg ? `${s.avg}%` : '—'}</strong></div>
            <div><span>Final Exam</span><strong>${s.finalPassed ? `${s.finalScore ?? 'Пройден'}%` : 'Не пройден'}</strong></div>
            <div><span>Сертификат</span><strong>${s.finalPassed ? 'Доступен' : 'Нет'}</strong></div>
          </div>
        </div>
      `;
    }).join('');

  document.getElementById('studentCourseStatus').innerHTML =
    levels || '<p class="muted">У ученика пока нет прогресса A1/A2.</p>';

  const recent = [...userQuizzes]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 12);

  document.getElementById('studentRecentTests').innerHTML = recent.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Тест</th><th>Баллы</th><th>Статус</th><th>Попытка</th><th>Дата</th></tr></thead>
        <tbody>
          ${recent.map(q => `
            <tr>
              <td>${String(q.lesson_key || '').replace('a1-final','A1 Final Exam').replace('a2-final','A2 Final Exam')}</td>
              <td><strong>${q.score}%</strong></td>
              <td><span class="badge ${q.passed ? 'active' : 'blocked'}">${q.passed ? 'Пройден' : 'Не пройден'}</span></td>
              <td>${q.attempt || '—'}</td>
              <td>${q.created_at ? new Date(q.created_at).toLocaleString('ru-RU') : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`
    : '<p class="muted">Ученик ещё не проходил тесты.</p>';

  document.getElementById('studentStatusModal').classList.remove('hidden');
};

function courseChecks(targetId, selected = new Set()) {
  const english = courses.filter(c => !String(c.code).startsWith('KZ-'));
  const kazakh = courses.filter(c => String(c.code).startsWith('KZ-'));

  const group = (title, flag, items) => `
    <div class="admin-course-group">
      <div class="admin-course-group-title">${flag} <strong>${title}</strong></div>
      <div class="admin-course-levels">
        ${items.map(c => `
          <label>
            <input type="checkbox" value="${c.id}" ${selected.has(c.id)?'checked':''}>
            <span>${c.code.startsWith('KZ-') ? c.code.replace('KZ-','') : c.code}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById(targetId).innerHTML =
    group('Английский язык', '🇬🇧', english) +
    group('Қазақ тілі', '🇰🇿', kazakh);
}

function tagsFor(userId) {
  const ids = new Set(accessRows.filter(a => a.user_id === userId && a.allowed).map(a => a.course_id));
  return courses.filter(c => ids.has(c.id)).map(c => `<span class="badge">${c.code}</span>`).join('') || '<span class="muted">нет</span>';
}

function drawUsers(filter='') {
  const q = filter.toLowerCase();
  const rows = users.filter(u => `${u.full_name||''} ${u.email||''}`.toLowerCase().includes(q));
  document.getElementById('usersTable').innerHTML = rows.map(u => `
    <tr>
      <td><strong>${u.full_name || 'Без имени'}</strong><br><span class="muted">${u.email || ''}</span></td>
      <td><span class="badge">${u.role}</span></td>
      <td><span class="badge ${u.status}">${u.status === 'active' ? 'Активен' : 'Заблокирован'}</span></td>
      <td><div class="course-tags">${tagsFor(u.id)}</div></td>
      <td>${trainingStatusHtml(u.id)}</td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${u.role === 'student' ? `<button class="btn primary" onclick="openStudentStatus('${u.id}')">Просмотр</button>` : ''}
          <button class="btn ghost" onclick="openAccess('${u.id}')">Изменить</button>
          ${u.id !== currentAdminId
            ? `<button class="btn danger" onclick="deleteUser('${u.id}')">Удалить</button>`
            : `<span class="muted" style="font-size:.82rem;align-self:center">Ваш аккаунт</span>`}
        </div>
      </td>
    </tr>`).join('');

  document.getElementById('statUsers').textContent = users.length;
  document.getElementById('statActive').textContent = users.filter(u=>u.status==='active').length;
  document.getElementById('statStudents').textContent = users.filter(u=>u.role==='student').length;
  document.getElementById('statAdmins').textContent = users.filter(u=>u.role==='admin').length;
}

async function reloadData() {
  const [c,u,a,p,q] = await Promise.all([
    sb.from('courses').select('*').order('sort_order'),
    sb.from('profiles').select('*').order('created_at'),
    sb.from('course_access').select('*'),
    sb.from('lesson_progress').select('user_id,course_id,lesson_key,completed,completed_at,updated_at'),
    sb.from('quiz_results').select('user_id,course_id,lesson_key,score,passed,attempt,created_at')
  ]);

  if (p.error) console.error('Не удалось загрузить прогресс учеников:', p.error);
  if (q.error) console.error('Не удалось загрузить результаты тестов:', q.error);

  courses = c.data || [];
  users = u.data || [];
  accessRows = a.data || [];
  progressRows = p.data || [];
  quizRows = q.data || [];
  courseChecks('newCourseChecks');
  drawUsers(document.getElementById('userSearch').value || '');
}

window.openAccess = (id) => {
  const u = users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('accessUserId').value = id;
  document.getElementById('accessUserName').textContent = `${u.full_name || ''} ${u.email || ''}`;
  document.getElementById('editRole').value = u.role;
  document.getElementById('editStatus').value = u.status;
  const selected = new Set(accessRows.filter(a => a.user_id === id && a.allowed).map(a=>a.course_id));
  courseChecks('editCourseChecks', selected);
  document.getElementById('accessModal').classList.remove('hidden');
};


window.deleteUser = async (id) => {
  const u = users.find(x => x.id === id);
  if (!u) return;

  if (id === currentAdminId) {
    alert('Нельзя удалить собственный аккаунт администратора.');
    return;
  }

  const label = u.full_name || u.email || 'этого пользователя';
  const confirmed = confirm(
    `Удалить пользователя "${label}"?\n\nБудут удалены его аккаунт, доступы, прогресс и результаты тестов. Это действие нельзя отменить.`
  );

  if (!confirmed) return;

  try {
    const { data: { session } } = await sb.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Сессия администратора истекла. Войдите снова.');
    }

    const res = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/smooth-handler`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': APP_CONFIG.SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          action: 'delete',
          user_id: id
        })
      }
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(body.error || `Ошибка сервера (${res.status})`);
    }

    await reloadData();
    alert('Пользователь удалён.');
  } catch (err) {
    console.error('Ошибка удаления пользователя:', err);
    alert(err?.message || 'Не удалось удалить пользователя.');
  }
};


(async () => {
  const profile = await bootGuard(true);
  if (!profile) return;

  currentAdminId = profile.id;

  await reloadData();

  document.getElementById('userSearch').addEventListener('input', e => drawUsers(e.target.value));
  document.getElementById('openCreateUser').onclick = () => document.getElementById('createUserModal').classList.remove('hidden');
  document.getElementById('closeCreateUser').onclick = () => document.getElementById('createUserModal').classList.add('hidden');
  document.getElementById('closeAccess').onclick = () => document.getElementById('accessModal').classList.add('hidden');
  document.getElementById('closeStudentStatus').onclick = () => document.getElementById('studentStatusModal').classList.add('hidden');

  document.getElementById('studentStatusModal').addEventListener('click', e => {
    if (e.target.id === 'studentStatusModal') {
      document.getElementById('studentStatusModal').classList.add('hidden');
    }
  });

  document.getElementById('createUserForm').addEventListener('submit', async e => {
    e.preventDefault();

    const m = document.getElementById('createUserMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const fullName = document.getElementById('newFullName').value.trim();
    const email = document.getElementById('newEmail').value.trim().toLowerCase();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    const selected = [...document.querySelectorAll('#newCourseChecks input:checked')]
      .map(x => x.value);

    if (!fullName) {
      m.className = 'message error';
      m.textContent = 'Укажите имя пользователя.';
      return;
    }

    if (!email) {
      m.className = 'message error';
      m.textContent = 'Укажите email.';
      return;
    }

    if (password.length < 8) {
      m.className = 'message error';
      m.textContent = 'Пароль должен содержать минимум 8 символов.';
      return;
    }

    m.className = 'message';
    m.textContent = 'Создаём пользователя...';
    submitBtn.disabled = true;

    try {
      const { data: { session } } = await sb.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Сессия администратора истекла. Войдите снова.');
      }

      // В Supabase функция была переименована, но её endpoint/slug остался smooth-handler.
      const res = await fetch(
        `${APP_CONFIG.SUPABASE_URL}/functions/v1/smooth-handler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': APP_CONFIG.SUPABASE_PUBLISHABLE_KEY
          },
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            role,
            course_ids: selected
          })
        }
      );

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || `Ошибка сервера (${res.status})`);
      }

      m.className = 'message success';
      m.textContent = 'Пользователь создан и может войти по email и паролю.';

      e.target.reset();
      courseChecks('newCourseChecks');
      await reloadData();

      setTimeout(() => {
        document.getElementById('createUserModal').classList.add('hidden');
        m.textContent = '';
      }, 1200);

    } catch (err) {
      console.error('Ошибка создания пользователя:', err);
      m.className = 'message error';

      const text = String(err?.message || '');

      if (/already|registered|exists/i.test(text)) {
        m.textContent = 'Пользователь с таким email уже существует.';
      } else {
        m.textContent = text || 'Не удалось создать пользователя.';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('accessForm').addEventListener('submit', async e => {
    e.preventDefault();

    const m = document.getElementById('accessMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    m.className = 'message';
    m.textContent = 'Сохраняем...';
    submitBtn.disabled = true;

    const userId = document.getElementById('accessUserId').value;
    const role = document.getElementById('editRole').value;
    const status = document.getElementById('editStatus').value;
    const selected = [...document.querySelectorAll('#editCourseChecks input:checked')]
      .map(x => x.value);

    try {
      const { error: profileError } = await sb
        .from('profiles')
        .update({
          role,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: deleteError } = await sb
        .from('course_access')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      if (selected.length > 0) {
        const rows = selected.map(courseId => ({
          user_id: userId,
          course_id: courseId,
          allowed: true
        }));

        const { error: insertError } = await sb
          .from('course_access')
          .insert(rows);

        if (insertError) throw insertError;
      }

      m.className = 'message success';
      m.textContent = 'Доступ успешно обновлён.';

      await reloadData();

      setTimeout(() => {
        document.getElementById('accessModal').classList.add('hidden');
      }, 700);

    } catch (err) {
      console.error('Ошибка сохранения доступа:', err);
      m.className = 'message error';
      m.textContent = err?.message || 'Не удалось сохранить доступ.';
    } finally {
      submitBtn.disabled = false;
    }
  });

})();
