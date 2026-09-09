(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const isTeacher = ['teacher','admin'].includes(profile.role) && profile.status === 'active';

  const labels = {
    assigned: ['Назначено','assigned'],
    submitted: ['На проверке','submitted'],
    revision: ['Нужно исправить','revision'],
    accepted: ['Проверено','accepted']
  };

  const reviewLabels = {
    checked: ['✅ Проверено','checked'],
    fix: ['✏️ Исправить','fix'],
    incorrect: ['❌ Не правильно','incorrect']
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
      .createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  }

  async function markRead(homeworkId) {
    const { error } = await sb.rpc('mark_homework_notification_read', {
      p_homework_id: homeworkId
    });
    if (error) console.warn('mark homework read:', error);
  }

  if (isTeacher) await teacherMode();
  else await studentMode();

  // ======================================================
  // TEACHER
  // ======================================================
  async function teacherMode() {
    document.getElementById('teacherHomeworkWorkspace').classList.remove('hidden');
    document.getElementById('homeworkPageTitle').textContent = 'Домашние задания преподавателя';
    document.getElementById('homeworkHeroText').textContent =
      'Создавайте задания, получайте ответы и проверяйте их прямо во вкладке ДЗ.';
    document.getElementById('statOneLabel').textContent = 'Назначено';
    document.getElementById('statTwoLabel').textContent = 'На проверке';
    document.getElementById('statThreeLabel').textContent = 'Проверено';

    let students = [];
    let rows = [];
    let unreadOnly = false;
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
    const notificationPanel = document.getElementById('teacherHomeworkNotifications');
    const unreadButton = document.getElementById('showTeacherUnreadOnly');

    const { data: studentRows, error: studentError } = await sb.rpc('teacher_get_my_students');
    if (studentError) {
      studentSelect.innerHTML = '<option value="">Не удалось загрузить учеников</option>';
    } else {
      students = studentRows || [];
      studentSelect.innerHTML =
        '<option value="">Выберите ученика</option>' +
        students.map(s =>
          `<option value="${s.student_id}">${esc(s.full_name || 'Без имени')} — ${esc(s.email || '')}</option>`
        ).join('');
    }

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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();

      const studentId = studentSelect.value;
      const title = document.getElementById('teacherHomeworkTitle').value.trim();
      const description = document.getElementById('teacherHomeworkDescription').value.trim();
      const deadlineRaw = document.getElementById('teacherHomeworkDeadline').value;
      const button = document.getElementById('createHomeworkBtn');

      if (!studentId) return studentSelect.focus();

      button.disabled = true;
      button.textContent = 'Создаём...';
      msg.className = 'message';
      msg.textContent = '';

      let imagePath = null;

      try {
        if (pendingImage) {
          const ext = pendingImage.type === 'image/png' ? 'png'
            : pendingImage.type === 'image/webp' ? 'webp' : 'jpg';
          imagePath = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await sb.storage
            .from('homework-images')
            .upload(imagePath, pendingImage, {
              upsert:false,
              contentType:pendingImage.type,
              cacheControl:'3600'
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
          if (imagePath) await sb.storage.from('homework-images').remove([imagePath]);
          throw error;
        }

        form.reset();
        pendingImage = null;
        preview.src = '';
        previewWrap.classList.add('hidden');
        removeImage.classList.add('hidden');
        msg.className = 'message success';
        msg.textContent = '✓ Задание назначено. Ученик увидит уведомление во вкладке ДЗ.';
        await loadTeacherRows();
      } catch (err) {
        msg.className = 'message error';
        msg.textContent = err.message || 'Не удалось создать задание.';
      } finally {
        button.disabled = false;
        button.textContent = 'Назначить задание';
      }
    });

    listFilter.addEventListener('change', renderTeacherRows);

    unreadButton.addEventListener('click', () => {
      unreadOnly = !unreadOnly;
      unreadButton.textContent = unreadOnly ? 'Показать все' : 'Показать новые';
      renderTeacherRows();
    });

    async function loadTeacherRows() {
      const { data, error } = await sb.rpc('teacher_get_my_homework');
      if (error) {
        list.innerHTML = `<div class="panel"><div class="message error">${esc(error.message)}</div></div>`;
        return;
      }
      rows = data || [];

      const unread = rows.filter(x => x.teacher_unread).length;
      document.getElementById('hwUnreadCount').textContent = unread;
      document.getElementById('hwOpenCount').textContent =
        rows.filter(x => x.status === 'assigned').length;
      document.getElementById('hwReviewCount').textContent =
        rows.filter(x => x.status === 'submitted').length;
      document.getElementById('hwAcceptedCount').textContent =
        rows.filter(x => x.status === 'accepted').length;

      notificationPanel.classList.toggle('hidden', unread === 0);
      document.getElementById('teacherNotificationText').textContent =
        unread === 1 ? 'Получен 1 новый ответ ученика.'
          : `Получено новых ответов: ${unread}.`;

      await renderTeacherRows();
    }

    async function renderTeacherRows() {
      const wanted = listFilter.value;
      let data = rows.filter(x => wanted === 'all' || x.status === wanted);
      if (unreadOnly) data = data.filter(x => x.teacher_unread);

      if (!data.length) {
        list.innerHTML = `<div class="panel homework-empty"><div>📝</div>
          <h2>Заданий здесь пока нет</h2><p class="muted">Измените фильтр или создайте новое задание.</p></div>`;
        return;
      }

      const cards = [];
      for (const row of data) {
        const [label, cls] = labels[row.status] || [row.status,''];
        const isLate = overdue(row.due_at, row.status);
        const imgUrl = await signedHomeworkImage(row.image_path);
        const review = reviewLabels[row.review_result];

        cards.push(`<article class="panel homework-card teacher-homework-card ${isLate?'overdue':''} ${row.teacher_unread?'unread-card':''}" data-card="${row.id}">
          ${imgUrl ? `<div class="homework-card-image"><img src="${imgUrl}" alt="Фото задания"></div>` : ''}
          <div class="homework-card-main">
            <div class="homework-card-top">
              ${row.teacher_unread ? '<span class="new-notification-badge">🔔 Новый ответ</span>' : ''}
              <span class="homework-status ${cls}">${isLate?'Просрочено':label}</span>
              <span class="muted">${dueText(row.due_at)}</span>
            </div>

            <h2>${esc(row.title)}</h2>
            <p>${esc(row.description)}</p>
            <div class="homework-card-teacher">Ученик: <strong>${esc(row.student_name || row.student_email || '—')}</strong></div>

            ${row.student_answer ? `<div class="teacher-answer-preview">
              <span>Ответ ученика</span>
              <p>${esc(row.student_answer)}</p>
              ${row.submitted_at ? `<small class="muted">Отправлено: ${dueText(row.submitted_at)}</small>` : ''}
            </div>` : ''}

            ${review ? `<div class="review-result-box ${review[1]}">
              <strong>${review[0]}</strong>
              ${row.teacher_comment ? `<p>${esc(row.teacher_comment)}</p>` : ''}
            </div>` : ''}

            ${row.status === 'submitted' ? `
              <div class="teacher-review-box">
                <div class="eyebrow">ПРОВЕРКА ОТВЕТА</div>
                <h3>Рекомендация преподавателя</h3>

                <div class="review-options">
                  <label>
                    <input type="radio" name="review-${row.id}" value="checked">
                    <span>✅ Проверено</span>
                  </label>
                  <label>
                    <input type="radio" name="review-${row.id}" value="fix">
                    <span>✏️ Исправить</span>
                  </label>
                  <label>
                    <input type="radio" name="review-${row.id}" value="incorrect">
                    <span>❌ Не правильно</span>
                  </label>
                </div>

                <textarea data-comment="${row.id}" maxlength="3000" rows="3"
                  placeholder="Напишите комментарий или рекомендацию ученику..."></textarea>

                <button class="btn primary" type="button" data-review-submit="${row.id}">
                  Отправить результат ученику
                </button>
              </div>` : ''}
          </div>

          <div class="homework-card-side">
            <a class="btn ghost" href="messages.html?student=${encodeURIComponent(row.student_id)}">Написать ученику</a>
          </div>
        </article>`);
      }

      list.innerHTML = cards.join('');

      list.querySelectorAll('[data-review-submit]').forEach(btn => {
        btn.onclick = async () => {
          const id = Number(btn.dataset.reviewSubmit);
          const selected = document.querySelector(`input[name="review-${id}"]:checked`);
          const comment = document.querySelector(`[data-comment="${id}"]`)?.value.trim() || '';

          if (!selected) {
            alert('Выберите результат: Проверено, Исправить или Не правильно.');
            return;
          }

          if (['fix','incorrect'].includes(selected.value) && !comment) {
            alert('Напишите комментарий, что ученику нужно исправить.');
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Отправляем...';

          const { error } = await sb.rpc('teacher_review_homework_v2', {
            p_homework_id: id,
            p_review_result: selected.value,
            p_comment: comment || null
          });

          if (error) {
            alert(error.message);
            btn.disabled = false;
            btn.textContent = 'Отправить результат ученику';
            return;
          }

          await markRead(id);
          await loadTeacherRows();
        };
      });

      // Открытие/клик по карточке убирает уведомление у учителя.
      list.querySelectorAll('[data-card]').forEach(card => {
        card.addEventListener('click', async e => {
          if (e.target.closest('button,input,textarea,a,label')) return;
          const id = Number(card.dataset.card);
          const row = rows.find(x => Number(x.id) === id);
          if (row?.teacher_unread) {
            await markRead(id);
            row.teacher_unread = false;
            loadTeacherRows();
          }
        });
      });
    }

    await loadTeacherRows();
    setInterval(loadTeacherRows, 10000);
  }

  // ======================================================
  // STUDENT
  // ======================================================
  async function studentMode() {
    document.getElementById('studentHomeworkWorkspace').classList.remove('hidden');
    document.getElementById('homeworkPageTitle').textContent = 'Мои домашние задания';
    document.getElementById('homeworkHeroText').textContent =
      'Задания, дедлайны, ответы и рекомендации преподавателя.';

    let rows = [];
    let selected = null;
    let unreadOnly = false;
    const list = document.getElementById('homeworkList');
    const filter = document.getElementById('homeworkFilter');
    const notificationPanel = document.getElementById('studentHomeworkNotifications');
    const unreadButton = document.getElementById('showStudentUnreadOnly');

    unreadButton.addEventListener('click', () => {
      unreadOnly = !unreadOnly;
      unreadButton.textContent = unreadOnly ? 'Показать все' : 'Показать новые';
      render();
    });

    async function load() {
      const { data, error } = await sb.rpc('student_get_my_homework');
      if (error) {
        list.innerHTML = `<div class="panel"><div class="message error">${esc(error.message)}</div></div>`;
        return;
      }

      rows = data || [];
      const unread = rows.filter(x => x.student_unread).length;

      document.getElementById('hwUnreadCount').textContent = unread;
      document.getElementById('hwOpenCount').textContent =
        rows.filter(x => ['assigned','revision'].includes(x.status)).length;
      document.getElementById('hwReviewCount').textContent =
        rows.filter(x => x.status === 'submitted').length;
      document.getElementById('hwAcceptedCount').textContent =
        rows.filter(x => x.status === 'accepted').length;

      notificationPanel.classList.toggle('hidden', unread === 0);
      document.getElementById('studentNotificationText').textContent =
        unread === 1 ? 'У вас 1 новое уведомление по домашнему заданию.'
          : `У вас новых уведомлений: ${unread}.`;

      await render();
    }

    async function render() {
      const wanted = filter.value;
      let data = rows.filter(x => wanted === 'all' || x.status === wanted);
      if (unreadOnly) data = data.filter(x => x.student_unread);

      if (!data.length) {
        list.innerHTML = `<div class="panel homework-empty"><div>📚</div>
          <h2>Заданий здесь пока нет</h2><p class="muted">Новые задания и результаты проверки появятся здесь.</p></div>`;
        return;
      }

      const cards = [];
      for (const row of data) {
        const [label, cls] = labels[row.status] || [row.status,''];
        const isLate = overdue(row.due_at,row.status);
        const imgUrl = await signedHomeworkImage(row.image_path);
        const review = reviewLabels[row.review_result];

        cards.push(`<article class="panel homework-card ${isLate?'overdue':''} ${row.student_unread?'unread-card':''}">
          ${imgUrl ? `<div class="homework-card-image"><img src="${imgUrl}" alt="Фото задания"></div>` : ''}
          <div class="homework-card-main">
            <div class="homework-card-top">
              ${row.student_unread ? '<span class="new-notification-badge">🔔 Новое</span>' : ''}
              <span class="homework-status ${cls}">${isLate?'Просрочено':label}</span>
              <span class="muted">${dueText(row.due_at)}</span>
            </div>

            <h2>${esc(row.title)}</h2>
            <p>${esc(row.description).slice(0,240)}${String(row.description||'').length>240?'…':''}</p>

            ${review ? `<div class="review-result-box ${review[1]} compact-review">
              <strong>${review[0]}</strong>
              ${row.teacher_comment ? `<p>${esc(row.teacher_comment)}</p>` : ''}
            </div>` : ''}

            <div class="homework-card-teacher">Преподаватель: <strong>${esc(row.teacher_name || row.teacher_email || '—')}</strong></div>
          </div>

          <div class="homework-card-side">
            <button class="btn ${row.status==='accepted'?'ghost':'primary'}" data-open="${row.id}">
              ${row.status==='accepted'?'Посмотреть результат':row.status==='submitted'?'Открыть ответ':'Выполнить'}
            </button>
          </div>
        </article>`);
      }

      list.innerHTML = cards.join('');
      list.querySelectorAll('[data-open]').forEach(btn => btn.onclick = () => openHomework(Number(btn.dataset.open)));
    }

    async function openHomework(id) {
      const row = rows.find(x => Number(x.id) === Number(id));
      if (!row) return;
      selected = row;

      if (row.student_unread) {
        await markRead(id);
        row.student_unread = false;
      }

      const [label] = labels[row.status] || [row.status];
      document.getElementById('homeworkModalStatus').textContent = label.toUpperCase();
      document.getElementById('homeworkModalTitle').textContent = row.title;
      document.getElementById('homeworkTeacher').textContent = row.teacher_name || row.teacher_email || '—';
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
      const review = reviewLabels[row.review_result];

      if (review || row.teacher_comment) {
        reviewBox.classList.remove('hidden');
        document.getElementById('teacherReviewText').innerHTML =
          `${review ? `<strong class="student-review-title ${review[1]}">${review[0]}</strong>` : ''}
           ${row.teacher_comment ? `<span>${esc(row.teacher_comment)}</span>` : ''}`;
      } else {
        reviewBox.classList.add('hidden');
      }

      const textarea = document.getElementById('studentHomeworkAnswer');
      const submit = document.getElementById('submitHomeworkBtn');
      const locked = row.status === 'accepted' || row.status === 'submitted';

      textarea.disabled = locked;
      submit.classList.toggle('hidden',locked);
      submit.textContent =
        row.status === 'revision' ? 'Отправить исправленный ответ' : 'Отправить преподавателю';

      document.getElementById('studentHomeworkMessage').textContent = '';
      document.getElementById('homeworkModal').classList.remove('hidden');

      await load();
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
      if (!answer) return;

      const msg = document.getElementById('studentHomeworkMessage');
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
      msg.textContent = '✓ Ответ отправлен. Преподаватель получил уведомление.';
      await load();
      document.getElementById('studentHomeworkAnswer').disabled = true;
      document.getElementById('submitHomeworkBtn').classList.add('hidden');
      document.getElementById('homeworkModalStatus').textContent = 'НА ПРОВЕРКЕ';
    });

    filter.addEventListener('change', render);
    await load();
    setInterval(load, 10000);
  }
})();