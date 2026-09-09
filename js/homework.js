(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const isTeacher = ['teacher','admin'].includes(profile.role) && profile.status === 'active';
  const labels = {
    assigned: ['Назначено','assigned'],
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
    if (!v) return 'Без дедлайна';
    return new Date(v).toLocaleString('ru-RU', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }

  function overdue(v, status) {
    return !!v && new Date(v) < new Date() && !['submitted','accepted'].includes(status);
  }

  async function signedHomeworkImage(path) {
    if (!path) return null;
    const { data, error } = await sb.storage
      .from('homework-images')
      .createSignedUrl(path, 60 * 60);
    if (error) {
      console.warn('homework image:', error);
      return null;
    }
    return data?.signedUrl || null;
  }

  if (isTeacher) {
    await bootTeacherMode();
  } else {
    await bootStudentMode();
  }

  // ======================================================
  // TEACHER MODE
  // ======================================================
  async function bootTeacherMode() {
    document.getElementById('teacherHomeworkWorkspace').classList.remove('hidden');
    document.getElementById('homeworkPageTitle').textContent = 'Домашние задания преподавателя';
    document.getElementById('homeworkHeroText').textContent =
      'Создавайте задания ученикам, прикрепляйте фотографии и устанавливайте дедлайны.';
    document.getElementById('statOneLabel').textContent = 'Назначено';
    document.getElementById('statTwoLabel').textContent = 'На проверке';
    document.getElementById('statThreeLabel').textContent = 'Принято';

    let students = [];
    let teacherRows = [];
    let pendingImage = null;
    let previewUrl = null;

    const studentSelect = document.getElementById('teacherHomeworkStudent');
    const imageInput = document.getElementById('teacherHomeworkImage');
    const previewWrap = document.getElementById('homeworkImagePreviewWrap');
    const preview = document.getElementById('homeworkImagePreview');
    const removeImage = document.getElementById('removeHomeworkImage');
    const form = document.getElementById('teacherCreateHomeworkForm');
    const msg = document.getElementById('teacherCreateHomeworkMessage');
    const list = document.getElementById('teacherHomeworkList');
    const listFilter = document.getElementById('teacherHomeworkListFilter');

    const { data: studentRows, error: studentError } = await sb.rpc('teacher_get_my_students');
    if (studentError) {
      studentSelect.innerHTML = '<option value="">Не удалось загрузить учеников</option>';
      msg.className = 'message error';
      msg.textContent = studentError.message;
      return;
    }

    students = studentRows || [];
    studentSelect.innerHTML =
      '<option value="">Выберите ученика</option>' +
      students.map(s =>
        `<option value="${s.student_id}">${esc(s.full_name || 'Без имени')} — ${esc(s.email || '')}</option>`
      ).join('');

    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      if (!file) return;

      const allowed = ['image/jpeg','image/png','image/webp'];
      if (!allowed.includes(file.type)) {
        imageInput.value = '';
        alert('Можно загружать только JPG, PNG или WEBP.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        imageInput.value = '';
        alert('Фото должно быть не больше 5 МБ.');
        return;
      }

      pendingImage = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      previewWrap.classList.remove('hidden');
      removeImage.classList.remove('hidden');
    });

    removeImage.addEventListener('click', () => {
      pendingImage = null;
      imageInput.value = '';
      preview.src = '';
      previewWrap.classList.add('hidden');
      removeImage.classList.add('hidden');
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();

      const studentId = studentSelect.value;
      const title = document.getElementById('teacherHomeworkTitle').value.trim();
      const description = document.getElementById('teacherHomeworkDescription').value.trim();
      const deadlineRaw = document.getElementById('teacherHomeworkDeadline').value;
      const button = document.getElementById('createHomeworkBtn');

      if (!studentId) {
        studentSelect.focus();
        return;
      }

      button.disabled = true;
      button.textContent = 'Создаём...';
      msg.className = 'message';
      msg.textContent = '';

      let imagePath = null;

      try {
        if (pendingImage) {
          const ext = pendingImage.type === 'image/png'
            ? 'png'
            : pendingImage.type === 'image/webp' ? 'webp' : 'jpg';

          imagePath = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await sb.storage
            .from('homework-images')
            .upload(imagePath, pendingImage, {
              upsert: false,
              contentType: pendingImage.type,
              cacheControl: '3600'
            });

          if (uploadError) throw uploadError;
        }

        const { error } = await sb.rpc('teacher_create_homework', {
          p_student_id: studentId,
          p_title: title,
          p_description: description,
          p_due_at: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
          p_image_path: imagePath
        });

        if (error) {
          if (imagePath) {
            await sb.storage.from('homework-images').remove([imagePath]);
          }
          throw error;
        }

        form.reset();
        pendingImage = null;
        preview.src = '';
        previewWrap.classList.add('hidden');
        removeImage.classList.add('hidden');
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }

        msg.className = 'message success';
        msg.textContent = '✓ Домашнее задание назначено ученику.';
        await loadTeacherHomework();
      } catch (err) {
        console.error(err);
        msg.className = 'message error';
        msg.textContent = err.message || 'Не удалось создать задание.';
      } finally {
        button.disabled = false;
        button.textContent = 'Назначить задание';
      }
    });

    listFilter.addEventListener('change', renderTeacherHomework);

    async function loadTeacherHomework() {
      const { data, error } = await sb.rpc('teacher_get_my_homework');
      if (error) {
        list.innerHTML = `<div class="panel"><div class="message error">${esc(error.message)}</div></div>`;
        return;
      }
      teacherRows = data || [];
      document.getElementById('hwOpenCount').textContent =
        teacherRows.filter(x => x.status === 'assigned').length;
      document.getElementById('hwReviewCount').textContent =
        teacherRows.filter(x => x.status === 'submitted').length;
      document.getElementById('hwAcceptedCount').textContent =
        teacherRows.filter(x => x.status === 'accepted').length;
      await renderTeacherHomework();
    }

    async function renderTeacherHomework() {
      const wanted = listFilter.value;
      const data = teacherRows.filter(x => wanted === 'all' || x.status === wanted);

      if (!data.length) {
        list.innerHTML = `<div class="panel homework-empty">
          <div>📝</div>
          <h2>Заданий пока нет</h2>
          <p class="muted">Создайте первое домашнее задание выше.</p>
        </div>`;
        return;
      }

      const cards = [];
      for (const row of data) {
        const [label, cls] = labels[row.status] || [row.status,''];
        const isLate = overdue(row.due_at, row.status);
        const imgUrl = await signedHomeworkImage(row.image_path);

        cards.push(`<article class="panel homework-card teacher-homework-card ${isLate ? 'overdue' : ''}">
          ${imgUrl ? `<div class="homework-card-image"><img src="${imgUrl}" alt="Фото задания"></div>` : ''}
          <div class="homework-card-main">
            <div class="homework-card-top">
              <span class="homework-status ${cls}">${isLate ? 'Просрочено' : label}</span>
              <span class="muted">${dueText(row.due_at)}</span>
            </div>
            <h2>${esc(row.title)}</h2>
            <p>${esc(row.description)}</p>
            <div class="homework-card-teacher">
              Ученик: <strong>${esc(row.student_name || row.student_email || '—')}</strong>
            </div>
            ${row.student_answer ? `<div class="teacher-answer-preview"><span>Ответ ученика</span><p>${esc(row.student_answer)}</p></div>` : ''}
          </div>
          <div class="homework-card-side">
            ${row.status === 'submitted' ? `<a class="btn primary" href="teacher.html?student=${encodeURIComponent(row.student_id)}">Проверить</a>` : ''}
            <a class="btn ghost" href="teacher.html?student=${encodeURIComponent(row.student_id)}">Открыть ученика</a>
          </div>
        </article>`);
      }
      list.innerHTML = cards.join('');
    }

    await loadTeacherHomework();
  }

  // ======================================================
  // STUDENT MODE
  // ======================================================
  async function bootStudentMode() {
    document.getElementById('studentHomeworkWorkspace').classList.remove('hidden');
    document.getElementById('homeworkPageTitle').textContent = 'Мои домашние задания';
    document.getElementById('homeworkHeroText').textContent =
      'Задания от преподавателя, фотографии, дедлайны и результаты проверки.';

    let rows = [];
    let selected = null;
    const list = document.getElementById('homeworkList');
    const filter = document.getElementById('homeworkFilter');

    async function load() {
      const { data, error } = await sb.rpc('student_get_my_homework');
      if (error) {
        list.innerHTML = `<div class="panel"><div class="message error">${esc(error.message)}</div></div>`;
        return;
      }
      rows = data || [];
      document.getElementById('hwOpenCount').textContent =
        rows.filter(x => ['assigned','revision'].includes(x.status)).length;
      document.getElementById('hwReviewCount').textContent =
        rows.filter(x => x.status === 'submitted').length;
      document.getElementById('hwAcceptedCount').textContent =
        rows.filter(x => x.status === 'accepted').length;
      await render();
    }

    async function render() {
      const wanted = filter.value;
      const data = rows.filter(x => wanted === 'all' || x.status === wanted);

      if (!data.length) {
        list.innerHTML = `<div class="panel homework-empty">
          <div>📚</div>
          <h2>Заданий здесь пока нет</h2>
          <p class="muted">Новые задания от преподавателя появятся автоматически.</p>
        </div>`;
        return;
      }

      const cards = [];
      for (const row of data) {
        const [label, cls] = labels[row.status] || [row.status,''];
        const isLate = overdue(row.due_at, row.status);
        const imgUrl = await signedHomeworkImage(row.image_path);

        cards.push(`<article class="panel homework-card ${isLate ? 'overdue' : ''}">
          ${imgUrl ? `<div class="homework-card-image"><img src="${imgUrl}" alt="Фото задания"></div>` : ''}
          <div class="homework-card-main">
            <div class="homework-card-top">
              <span class="homework-status ${cls}">${isLate ? 'Просрочено' : label}</span>
              <span class="muted">${dueText(row.due_at)}</span>
            </div>
            <h2>${esc(row.title)}</h2>
            <p>${esc(row.description).slice(0,240)}${String(row.description||'').length > 240 ? '…' : ''}</p>
            <div class="homework-card-teacher">Преподаватель: <strong>${esc(row.teacher_name || row.teacher_email || '—')}</strong></div>
          </div>
          <div class="homework-card-side">
            <button class="btn ${row.status === 'accepted' ? 'ghost' : 'primary'}" data-open="${row.id}">
              ${row.status === 'accepted' ? 'Посмотреть' : row.status === 'submitted' ? 'Открыть ответ' : 'Выполнить'}
            </button>
          </div>
        </article>`);
      }
      list.innerHTML = cards.join('');
      list.querySelectorAll('[data-open]').forEach(btn => {
        btn.onclick = () => openHomework(Number(btn.dataset.open));
      });
    }

    async function openHomework(id) {
      const row = rows.find(x => Number(x.id) === Number(id));
      if (!row) return;
      selected = row;

      const [label] = labels[row.status] || [row.status];
      document.getElementById('homeworkModalStatus').textContent = label.toUpperCase();
      document.getElementById('homeworkModalTitle').textContent = row.title;
      document.getElementById('homeworkTeacher').textContent =
        row.teacher_name || row.teacher_email || '—';
      document.getElementById('homeworkDue').textContent = dueText(row.due_at);
      document.getElementById('homeworkDescriptionText').textContent = row.description || '';
      document.getElementById('studentHomeworkAnswer').value = row.student_answer || '';

      const imageBox = document.getElementById('studentHomeworkImageBox');
      const image = document.getElementById('studentHomeworkImage');
      const imgUrl = await signedHomeworkImage(row.image_path);
      if (imgUrl) {
        image.src = imgUrl;
        imageBox.classList.remove('hidden');
      } else {
        image.src = '';
        imageBox.classList.add('hidden');
      }

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
      submit.textContent =
        row.status === 'revision'
          ? 'Отправить исправленный ответ'
          : 'Отправить преподавателю';

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
      document.getElementById('studentHomeworkAnswer').disabled = true;
      document.getElementById('submitHomeworkBtn').classList.add('hidden');
      document.getElementById('homeworkModalStatus').textContent = 'НА ПРОВЕРКЕ';
    });

    filter.addEventListener('change', render);
    await load();
  }
})();