let courses = [];
let users = [];
let accessRows = [];

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
      <td><button class="btn ghost" onclick="openAccess('${u.id}')">Изменить</button></td>
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

(async () => {
  const profile = await bootGuard(true);
  if (!profile) return;

  await reloadData();

  document.getElementById('userSearch').addEventListener('input', e => drawUsers(e.target.value));
  document.getElementById('openCreateUser').onclick = () => document.getElementById('createUserModal').classList.remove('hidden');
  document.getElementById('closeCreateUser').onclick = () => document.getElementById('createUserModal').classList.add('hidden');
  document.getElementById('closeAccess').onclick = () => document.getElementById('accessModal').classList.add('hidden');

  document.getElementById('createUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('createUserMessage');
    m.className='message'; m.textContent='Создаём пользователя...';
    const selected = [...document.querySelectorAll('#newCourseChecks input:checked')].map(x=>x.value);
    const { data: { session } } = await sb.auth.getSession();

    const res = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/admin-create-user`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`,
        'apikey':APP_CONFIG.SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify({
        full_name:document.getElementById('newFullName').value.trim(),
        email:document.getElementById('newEmail').value.trim(),
        password:document.getElementById('newPassword').value,
        role:document.getElementById('newRole').value,
        course_ids:selected
      })
    });

    const body = await res.json().catch(()=>({}));
    if (!res.ok) {
      m.className='message error'; m.textContent=body.error || 'Не удалось создать пользователя. Проверьте, развернута ли Edge Function.';
      return;
    }
    m.className='message success'; m.textContent='Пользователь создан.';
    e.target.reset();
    await reloadData();
  });

  document.getElementById('accessForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('accessMessage');
    m.className='message'; m.textContent='Сохраняем...';
    const selected = [...document.querySelectorAll('#editCourseChecks input:checked')].map(x=>x.value);
    const { data: { session } } = await sb.auth.getSession();

    const res = await fetch(`${APP_CONFIG.SUPABASE_URL}/functions/v1/admin-set-access`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`,
        'apikey':APP_CONFIG.SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify({
        user_id:document.getElementById('accessUserId').value,
        role:document.getElementById('editRole').value,
        status:document.getElementById('editStatus').value,
        course_ids:selected
      })
    });

    const body = await res.json().catch(()=>({}));
    if (!res.ok) {
      m.className='message error'; m.textContent=body.error || 'Не удалось сохранить.';
      return;
    }
    m.className='message success'; m.textContent='Доступ обновлён.';
    await reloadData();
    setTimeout(()=>document.getElementById('accessModal').classList.add('hidden'), 500);
  });
})();
