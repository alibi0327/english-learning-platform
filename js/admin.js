let courses = [];
let users = [];
let accessRows = [];
let currentAdminId = null;

function courseChecks(targetId, selected = new Set()) {
  document.getElementById(targetId).innerHTML = courses.map(c => `
    <label><input type="checkbox" value="${c.id}" ${selected.has(c.id)?'checked':''}> ${c.code}</label>
  `).join('');
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
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
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
  const [c,u,a] = await Promise.all([
    sb.from('courses').select('*').order('sort_order'),
    sb.from('profiles').select('*').order('created_at'),
    sb.from('course_access').select('*')
  ]);
  courses = c.data || []; users = u.data || []; accessRows = a.data || [];
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
