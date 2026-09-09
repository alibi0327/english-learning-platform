(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  if (!['teacher','admin'].includes(profile.role) || profile.status !== 'active') {
    location.href = 'dashboard.html';
    return;
  }
  if (profile.role === 'admin') document.getElementById('adminLink')?.classList.remove('hidden');

  let rows = [];
  const tbody = document.getElementById('journalTableBody');
  const search = document.getElementById('journalSearch');
  const sort = document.getElementById('journalSort');

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  function lastText(v) {
    return v ? new Date(v).toLocaleString('ru-RU', {
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    }) : '—';
  }

  async function load() {
    const { data, error } = await sb.rpc('teacher_get_class_journal');
    if (error) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="message error">${esc(error.message)}</div></td></tr>`;
      return;
    }
    rows = data || [];
    document.getElementById('journalStudents').textContent = rows.length;
    const withScores = rows.filter(x => Number(x.total_quizzes || 0) > 0);
    const classAvg = withScores.length
      ? Math.round(withScores.reduce((s,x)=>s+Number(x.average_score||0),0)/withScores.length)
      : 0;
    document.getElementById('journalAverage').textContent = `${classAvg}%`;
    document.getElementById('journalReview').textContent =
      rows.reduce((s,x)=>s+Number(x.homework_submitted||0),0);
    render();
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    let data = rows.filter(x => `${x.full_name||''} ${x.email||''}`.toLowerCase().includes(q));

    const mode = sort.value;
    data = [...data].sort((a,b) => {
      if (mode === 'activity') return new Date(b.last_activity||0) - new Date(a.last_activity||0);
      if (mode === 'progress') return Number(b.completed_lessons||0) - Number(a.completed_lessons||0);
      if (mode === 'score') return Number(b.average_score||0) - Number(a.average_score||0);
      if (mode === 'review') return Number(b.homework_submitted||0) - Number(a.homework_submitted||0);
      return String(a.full_name||a.email||'').localeCompare(String(b.full_name||b.email||''),'ru');
    });

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted">Учеников не найдено.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(x => `
      <tr>
        <td>
          <div class="journal-student">
            <strong>${esc(x.full_name || 'Без имени')}</strong>
            <small>${esc(x.email || '')}</small>
          </div>
        </td>
        <td><strong>${Number(x.completed_lessons||0)}</strong></td>
        <td><strong>${Math.round(Number(x.average_score||0))}%</strong></td>
        <td>${Math.round(Number(x.best_score||0))}%</td>
        <td>${Number(x.passed_quizzes||0)} / ${Number(x.total_quizzes||0)}</td>
        <td>
          <div class="journal-homework">
            <span title="К выполнению">📝 ${Number(x.homework_open||0)}</span>
            <span class="${Number(x.homework_submitted||0)>0?'attention':''}" title="На проверке">⏳ ${Number(x.homework_submitted||0)}</span>
            <span title="Принято">✅ ${Number(x.homework_accepted||0)}</span>
          </div>
        </td>
        <td>${lastText(x.last_activity)}</td>
        <td><a class="btn ghost compact" href="teacher.html?student=${encodeURIComponent(x.student_id)}">Открыть</a></td>
      </tr>
    `).join('');
  }

  search.addEventListener('input',render);
  sort.addEventListener('change',render);
  await load();
})();