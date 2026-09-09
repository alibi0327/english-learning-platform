(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  let rows = [];
  let selected = null;
  const list = document.getElementById('homeworkList');
  const filter = document.getElementById('homeworkFilter');

  const labels = {
    assigned: ['К выполнению','assigned'],
    submitted: ['На проверке','submitted'],
    revision: ['Нужно исправить','revision'],
    accepted: ['Принято','accepted']
  };

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  function dueText(v) {
    if (!v) return 'Без срока';
    return new Date(v).toLocaleString('ru-RU', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }

  function isOverdue(row) {
    return row.due_at && new Date(row.due_at) < new Date() &&
      !['submitted','accepted'].includes(row.status);
  }

  async function load() {
    const { data, error } = await sb.rpc('student_get_my_homework');
    if (error) {
      console.error(error);
      list.innerHTML = `<div class="panel"><div class="message error">${esc(error.message)}</div></div>`;
      return;
    }
    rows = data || [];
    updateStats();
    render();
  }

  function updateStats() {
    document.getElementById('hwOpenCount').textContent =
      rows.filter(x => ['assigned','revision'].includes(x.status)).length;
    document.getElementById('hwReviewCount').textContent =
      rows.filter(x => x.status === 'submitted').length;
    document.getElementById('hwAcceptedCount').textContent =
      rows.filter(x => x.status === 'accepted').length;
  }

  function render() {
    const wanted = filter.value;
    const data = rows.filter(x => wanted === 'all' || x.status === wanted);

    if (!data.length) {
      list.innerHTML = `<div class="panel homework-empty">
        <div>📚</div><h2>Заданий здесь пока нет</h2>
        <p class="muted">Новые задания от преподавателя появятся автоматически.</p>
      </div>`;
      return;
    }

    list.innerHTML = data.map(row => {
      const [label, cls] = labels[row.status] || [row.status, ''];
      const overdue = isOverdue(row);
      return `<article class="panel homework-card ${overdue ? 'overdue' : ''}">
        <div class="homework-card-main">
          <div class="homework-card-top">
            <span class="homework-status ${cls}">${overdue ? 'Просрочено' : label}</span>
            <span class="muted">${dueText(row.due_at)}</span>
          </div>
          <h2>${esc(row.title)}</h2>
          <p>${esc(row.description).slice(0,240)}${String(row.description||'').length > 240 ? '…' : ''}</p>
          <div class="homework-card-teacher">Преподаватель: <strong>${esc(row.teacher_name || row.teacher_email || '—')}</strong></div>
        </div>
        <div class="homework-card-side">
          ${row.status === 'revision' && row.teacher_comment ? `<small>Есть комментарий преподавателя</small>` : ''}
          <button class="btn ${row.status === 'accepted' ? 'ghost' : 'primary'}" data-open="${row.id}">
            ${row.status === 'accepted' ? 'Посмотреть' : row.status === 'submitted' ? 'Открыть ответ' : 'Выполнить'}
          </button>
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('[data-open]').forEach(btn => {
      btn.onclick = () => openHomework(Number(btn.dataset.open));
    });
  }

  function openHomework(id) {
    const row = rows.find(x => Number(x.id) === Number(id));
    if (!row) return;
    selected = row;

    const [label] = labels[row.status] || [row.status];
    document.getElementById('homeworkModalStatus').textContent = label.toUpperCase();
    document.getElementById('homeworkModalTitle').textContent = row.title;
    document.getElementById('homeworkTeacher').textContent = row.teacher_name || row.teacher_email || '—';
    document.getElementById('homeworkDue').textContent = dueText(row.due_at);
    document.getElementById('homeworkDescriptionText').textContent = row.description || '';
    document.getElementById('studentHomeworkAnswer').value = row.student_answer || '';

    const reviewBox = document.getElementById('teacherReviewBox');
    if (row.teacher_comment) {
      reviewBox.classList.remove('hidden');
      document.getElementById('teacherReviewText').textContent = row.teacher_comment;
    } else {
      reviewBox.classList.add('hidden');
    }

    const textarea = document.getElementById('studentHomeworkAnswer');
    const submit = document.getElementById('submitHomeworkBtn');

    const locked = row.status === 'accepted' || row.status === 'submitted';
    textarea.disabled = locked;
    submit.classList.toggle('hidden', locked);
    submit.textContent = row.status === 'revision' ? 'Отправить исправленный ответ' : 'Отправить преподавателю';

    document.getElementById('studentHomeworkMessage').textContent = '';
    document.getElementById('homeworkModal').classList.remove('hidden');
  }

  document.getElementById('closeHomeworkModal').onclick =
    () => document.getElementById('homeworkModal').classList.add('hidden');

  document.getElementById('homeworkModal').addEventListener('click', e => {
    if (e.target.id === 'homeworkModal') e.currentTarget.classList.add('hidden');
  });

  document.getElementById('studentHomeworkForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!selected) return;

    const answer = document.getElementById('studentHomeworkAnswer').value.trim();
    const msg = document.getElementById('studentHomeworkMessage');
    if (!answer) return;

    msg.className = 'message';
    msg.textContent = 'Отправляем...';

    const { error } = await sb.rpc('student_submit_homework', {
      p_homework_id: selected.id,
      p_answer: answer
    });

    if (error) {
      msg.className = 'message error';
      msg.textContent = error.message;
      return;
    }

    msg.className = 'message success';
    msg.textContent = '✓ Ответ отправлен преподавателю.';
    await load();
    const fresh = rows.find(x => Number(x.id) === Number(selected.id));
    if (fresh) {
      selected = fresh;
      document.getElementById('studentHomeworkAnswer').disabled = true;
      document.getElementById('submitHomeworkBtn').classList.add('hidden');
      document.getElementById('homeworkModalStatus').textContent = 'НА ПРОВЕРКЕ';
    }
  });

  filter.addEventListener('change', render);
  await load();
})();