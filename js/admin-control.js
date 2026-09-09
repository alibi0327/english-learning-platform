(async () => {
  const profile = await bootGuard(true);
  if (!profile || profile.role !== 'admin') return;

  let teachers = [];
  let selectedTeacherId = null;
  let selectedPair = null;
  let pairs = [];
  let homeworkRows = [];
  let statusRows = [];
  let chatTimer = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  const dateText = v => v ? new Date(v).toLocaleString('ru-RU', {
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }) : '—';

  const roleText = role => ({
    admin:'Администратор',teacher:'Преподаватель',student:'Ученик'
  })[role] || role || '—';

  const statusText = status => status === 'active' ? 'Активен' : 'Заблокирован';

  // Tabs
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.admin-tab-panel').forEach(x => x.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });

  async function loadAll() {
    await Promise.all([
      loadTeachers(),
      loadPairs(),
      loadHomework(),
      loadStatuses(),
      loadStats()
    ]);
  }

  // -------------------------------------------------------
  // Teachers / linked students
  // -------------------------------------------------------
  async function loadTeachers() {
    const { data, error } = await sb.rpc('admin_get_teachers_overview');
    if (error) {
      document.getElementById('adminTeacherList').innerHTML =
        `<div class="message error">${esc(error.message)}</div>`;
      return;
    }
    teachers = data || [];
    renderTeachers();
  }

  function renderTeachers() {
    const q = document.getElementById('teacherSearch').value.trim().toLowerCase();
    const rows = teachers.filter(t =>
      `${t.full_name||''} ${t.email||''}`.toLowerCase().includes(q)
    );

    document.getElementById('adminTeacherList').innerHTML = rows.length
      ? rows.map(t => `
        <button class="admin-teacher-item ${selectedTeacherId===t.teacher_id?'active':''}"
                data-teacher="${t.teacher_id}">
          <strong>${esc(t.full_name || 'Без имени')}</strong>
          <small>${esc(t.email || '')}</small>
          <div class="admin-teacher-meta">
            <span class="mini-pill">${statusText(t.status)}</span>
            <span class="mini-pill">Учеников: ${Number(t.student_count||0)}</span>
            ${Number(t.homework_submitted||0)>0
              ? `<span class="mini-pill attn">ДЗ на проверке: ${t.homework_submitted}</span>` : ''}
          </div>
        </button>`).join('')
      : '<p class="muted">Преподаватели не найдены.</p>';

    document.querySelectorAll('[data-teacher]').forEach(btn => {
      btn.onclick = () => openTeacher(btn.dataset.teacher);
    });
  }

  document.getElementById('teacherSearch').addEventListener('input', renderTeachers);

  async function openTeacher(id) {
    selectedTeacherId = id;
    renderTeachers();

    const t = teachers.find(x => x.teacher_id === id);
    if (!t) return;

    document.getElementById('teacherEmpty').classList.add('hidden');
    document.getElementById('teacherWorkspace').classList.remove('hidden');
    document.getElementById('selectedTeacherName').textContent = t.full_name || 'Без имени';
    document.getElementById('selectedTeacherEmail').textContent = t.email || '';

    const status = document.getElementById('selectedTeacherStatus');
    status.textContent = statusText(t.status);
    status.className = `status-pill ${t.status}`;

    await loadTeacherStudents(id);
  }

  async function loadTeacherStudents(teacherId) {
    const box = document.getElementById('selectedTeacherStudents');
    box.innerHTML = '<p class="muted">Загрузка...</p>';

    const { data, error } = await sb.rpc('admin_get_teacher_students', {
      p_teacher_id: teacherId
    });

    if (error) {
      box.innerHTML = `<div class="message error">${esc(error.message)}</div>`;
      return;
    }

    const rows = data || [];
    document.getElementById('selectedTeacherStudentCount').textContent = rows.length;

    box.innerHTML = rows.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Ученик</th><th>Статус</th><th>Телефон</th>
          <th>ДЗ</th><th>Последняя активность</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(s => `
            <tr>
              <td>
                <div class="admin-student-person">
                  <strong>${esc(s.full_name || 'Без имени')}</strong>
                  <small>${esc(s.email || '')}</small>
                </div>
              </td>
              <td><span class="status-pill ${s.status}">${statusText(s.status)}</span></td>
              <td>${esc(s.phone || '—')}</td>
              <td>
                <div class="status-grid">
                  <span class="mini-pill">Открыто: ${Number(s.homework_open||0)}</span>
                  <span class="mini-pill ${Number(s.homework_submitted||0)>0?'attn':''}">
                    На проверке: ${Number(s.homework_submitted||0)}
                  </span>
                  <span class="mini-pill">Проверено: ${Number(s.homework_accepted||0)}</span>
                </div>
              </td>
              <td>${dateText(s.last_activity)}</td>
              <td>
                <button class="btn danger compact" data-remove-student="${s.student_id}">
                  Убрать
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : '<p class="muted">У этого преподавателя пока нет учеников.</p>';

    box.querySelectorAll('[data-remove-student]').forEach(btn => {
      btn.onclick = () => removeStudentFromTeacher(btn.dataset.removeStudent);
    });
  }

  document.getElementById('adminAddStudentBtn').onclick = async () => {
    if (!selectedTeacherId) return;
    const input = document.getElementById('adminStudentEmail');
    const email = input.value.trim();
    const msg = document.getElementById('adminAddStudentMessage');

    if (!email) return input.focus();

    msg.className = 'message';
    msg.textContent = 'Добавляем...';

    const { error } = await sb.rpc('admin_add_student_to_teacher_by_email', {
      p_teacher_id: selectedTeacherId,
      p_email: email
    });

    if (error) {
      msg.className = 'message error';
      msg.textContent = error.message;
      return;
    }

    msg.className = 'message success';
    msg.textContent = '✓ Ученик добавлен преподавателю.';
    input.value = '';

    await Promise.all([loadTeachers(), loadTeacherStudents(selectedTeacherId), loadPairs(), loadStats()]);
  };

  async function removeStudentFromTeacher(studentId) {
    const t = teachers.find(x => x.teacher_id === selectedTeacherId);
    if (!confirm(`Убрать ученика из класса преподавателя "${t?.full_name || ''}"?`)) return;

    const { error } = await sb.rpc('admin_remove_student_from_teacher', {
      p_teacher_id: selectedTeacherId,
      p_student_id: studentId
    });

    if (error) return alert(error.message);

    await Promise.all([loadTeachers(), loadTeacherStudents(selectedTeacherId), loadPairs(), loadStats()]);
  }

  // -------------------------------------------------------
  // Messages
  // -------------------------------------------------------
  async function loadPairs() {
    const { data, error } = await sb.rpc('admin_get_all_teacher_student_pairs');
    if (error) {
      document.getElementById('adminPairList').innerHTML =
        `<div class="message error">${esc(error.message)}</div>`;
      return;
    }
    pairs = data || [];
    renderPairs();
  }

  function renderPairs() {
    const q = document.getElementById('pairSearch').value.trim().toLowerCase();
    const rows = pairs.filter(p =>
      `${p.teacher_name||''} ${p.teacher_email||''} ${p.student_name||''} ${p.student_email||''}`
      .toLowerCase().includes(q)
    );

    document.getElementById('adminPairList').innerHTML = rows.length
      ? rows.map(p => `
        <button class="admin-pair-item ${selectedPair &&
          selectedPair.teacher_id===p.teacher_id &&
          selectedPair.student_id===p.student_id ? 'active':''}"
          data-pair="${p.teacher_id}|${p.student_id}">
          <strong>${esc(p.teacher_name || 'Преподаватель')} ↔ ${esc(p.student_name || 'Ученик')}</strong>
          <small>${esc(p.teacher_email||'')} · ${esc(p.student_email||'')}</small>
          <div class="admin-pair-meta">
            <span class="mini-pill">Сообщений: ${Number(p.message_count||0)}</span>
            <span class="mini-pill">${p.relationship_status === 'active' ? 'Активная связь' : 'Неактивна'}</span>
          </div>
        </button>`).join('')
      : '<p class="muted">Диалоги не найдены.</p>';

    document.querySelectorAll('[data-pair]').forEach(btn => {
      btn.onclick = () => {
        const [teacherId, studentId] = btn.dataset.pair.split('|');
        openPair(teacherId, studentId);
      };
    });
  }

  document.getElementById('pairSearch').addEventListener('input', renderPairs);

  async function openPair(teacherId, studentId) {
    selectedPair = pairs.find(p => p.teacher_id===teacherId && p.student_id===studentId)
      || {teacher_id:teacherId,student_id:studentId};

    renderPairs();
    document.getElementById('adminChatEmpty').classList.add('hidden');
    document.getElementById('adminChatWorkspace').classList.remove('hidden');

    document.getElementById('adminChatTitle').textContent =
      `${selectedPair.teacher_name || 'Преподаватель'} ↔ ${selectedPair.student_name || 'Ученик'}`;
    document.getElementById('adminChatSubtitle').textContent =
      `${selectedPair.teacher_email || ''} · ${selectedPair.student_email || ''}`;

    await loadPairMessages();

    if (chatTimer) clearInterval(chatTimer);
    chatTimer = setInterval(loadPairMessages, 5000);
  }

  async function loadPairMessages() {
    if (!selectedPair) return;

    const box = document.getElementById('adminChatMessages');

    const { data, error } = await sb.rpc('admin_get_pair_messages', {
      p_teacher_id: selectedPair.teacher_id,
      p_student_id: selectedPair.student_id,
      p_limit: 200
    });

    if (error) {
      box.innerHTML = `<div class="message error">${esc(error.message)}</div>`;
      return;
    }

    const rows = (data || []).slice().reverse();

    box.innerHTML = rows.length ? rows.map(m => {
      const cls = m.sender_role === 'admin'
        ? 'admin'
        : m.sender_id === selectedPair.teacher_id ? 'teacher' : 'student';

      return `<div class="admin-message ${cls}">
        <div class="admin-message-head">
          <strong>${esc(m.sender_name || roleText(m.sender_role))}</strong>
          <span>${dateText(m.created_at)}</span>
        </div>
        <p>${esc(m.body)}</p>
      </div>`;
    }).join('') : '<p class="muted">Сообщений пока нет.</p>';

    box.scrollTop = box.scrollHeight;
  }

  document.getElementById('refreshAdminChat').onclick = loadPairMessages;

  document.getElementById('adminChatForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!selectedPair) return;

    const input = document.getElementById('adminChatInput');
    const body = input.value.trim();
    if (!body) return;

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;

    const { error } = await sb.rpc('admin_send_pair_message', {
      p_teacher_id: selectedPair.teacher_id,
      p_student_id: selectedPair.student_id,
      p_body: body
    });

    button.disabled = false;

    if (error) return alert(error.message);

    input.value = '';
    await Promise.all([loadPairMessages(), loadPairs(), loadStats()]);
  });

  // -------------------------------------------------------
  // Homework monitoring
  // -------------------------------------------------------
  async function loadHomework() {
    const { data, error } = await sb.rpc('admin_get_all_homework');
    if (error) {
      document.getElementById('adminHomeworkTable').innerHTML =
        `<div class="message error">${esc(error.message)}</div>`;
      return;
    }
    homeworkRows = data || [];
    renderHomework();
  }

  function renderHomework() {
    const q = document.getElementById('adminHomeworkSearch').value.trim().toLowerCase();
    const status = document.getElementById('adminHomeworkFilter').value;

    const rows = homeworkRows.filter(h => {
      if (status !== 'all' && h.status !== status) return false;
      return `${h.title||''} ${h.teacher_name||''} ${h.teacher_email||''} ${h.student_name||''} ${h.student_email||''}`
        .toLowerCase().includes(q);
    });

    document.getElementById('adminHomeworkTable').innerHTML = rows.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Задание</th><th>Преподаватель</th><th>Ученик</th>
          <th>Статус</th><th>Рекомендация</th><th>Дедлайн</th><th>Обновлено</th>
        </tr></thead>
        <tbody>
          ${rows.map(h => `
            <tr>
              <td>
                <div class="admin-homework-title">
                  <strong>${esc(h.title)}</strong>
                  <small>${esc(String(h.description||'').slice(0,100))}</small>
                </div>
              </td>
              <td>${esc(h.teacher_name || h.teacher_email || '—')}</td>
              <td>${esc(h.student_name || h.student_email || '—')}</td>
              <td><span class="review-badge ${h.status}">${
                h.status==='assigned'?'Назначено':
                h.status==='submitted'?'На проверке':
                h.status==='revision'?'Исправить':
                h.status==='accepted'?'Проверено':esc(h.status)
              }</span></td>
              <td>${esc(
                h.review_result==='checked'?'Проверено':
                h.review_result==='fix'?'Исправить':
                h.review_result==='incorrect'?'Не правильно':'—'
              )}</td>
              <td>${dateText(h.due_at)}</td>
              <td>${dateText(h.updated_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : '<p class="muted">Задания не найдены.</p>';
  }

  document.getElementById('adminHomeworkSearch').addEventListener('input', renderHomework);
  document.getElementById('adminHomeworkFilter').addEventListener('change', renderHomework);

  // -------------------------------------------------------
  // User statuses
  // -------------------------------------------------------
  async function loadStatuses() {
    const { data, error } = await sb.rpc('admin_get_all_user_statuses');
    if (error) {
      document.getElementById('adminStatusTable').innerHTML =
        `<div class="message error">${esc(error.message)}</div>`;
      return;
    }
    statusRows = data || [];
    renderStatuses();
  }

  function renderStatuses() {
    const q = document.getElementById('adminStatusSearch').value.trim().toLowerCase();
    const role = document.getElementById('adminStatusRole').value;

    const rows = statusRows.filter(u => {
      if (role !== 'all' && u.role !== role) return false;
      return `${u.full_name||''} ${u.email||''}`.toLowerCase().includes(q);
    });

    document.getElementById('adminStatusTable').innerHTML = rows.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Пользователь</th><th>Роль</th><th>Статус</th>
          <th>Класс</th><th>ДЗ</th><th>Последняя активность</th>
        </tr></thead>
        <tbody>
          ${rows.map(u => `
            <tr>
              <td><strong>${esc(u.full_name || 'Без имени')}</strong><br><span class="muted">${esc(u.email||'')}</span></td>
              <td>${roleText(u.role)}</td>
              <td><span class="status-pill ${u.status}">${statusText(u.status)}</span></td>
              <td>${
                u.role==='teacher' ? `Учеников: ${Number(u.linked_count||0)}` :
                u.role==='student' ? `Преподавателей: ${Number(u.linked_count||0)}` : '—'
              }</td>
              <td>
                ${u.role==='student'
                  ? `Открыто: ${Number(u.homework_open||0)} · На проверке: ${Number(u.homework_submitted||0)}`
                  : '—'}
              </td>
              <td>${dateText(u.last_activity)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : '<p class="muted">Пользователи не найдены.</p>';
  }

  document.getElementById('adminStatusSearch').addEventListener('input', renderStatuses);
  document.getElementById('adminStatusRole').addEventListener('change', renderStatuses);

  // -------------------------------------------------------
  // Top stats
  // -------------------------------------------------------
  async function loadStats() {
    const { data, error } = await sb.rpc('admin_get_control_stats');
    if (error) return console.warn(error);

    const s = Array.isArray(data) ? data[0] : data;
    if (!s) return;

    document.getElementById('statTeachers').textContent = Number(s.teachers||0);
    document.getElementById('statLinkedStudents').textContent = Number(s.linked_students||0);
    document.getElementById('statHomeworkReview').textContent = Number(s.homework_submitted||0);
    document.getElementById('statMessages').textContent = Number(s.messages||0);
  }

  await loadAll();
})();