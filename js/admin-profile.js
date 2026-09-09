(() => {
  const baseOpenStudentStatus = window.openStudentStatus;

  function initials(name) {
    const p=String(name||'').trim().split(/\s+/).filter(Boolean);
    return p.length?p.slice(0,2).map(x=>x[0]).join('').toLocaleUpperCase():'LP';
  }

  async function signedAvatar(path) {
    if(!path) return null;
    const {data,error}=await sb.storage.from('avatars').createSignedUrl(path,60*60);
    if(error){ console.warn(error); return null; }
    return data?.signedUrl||null;
  }

  window.openStudentStatus = async (id) => {
    baseOpenStudentStatus(id);

    const box=document.getElementById('studentPersonalData');
    if(!box) return;
    const u=users.find(x=>x.id===id);
    if(!u){
      box.innerHTML='<p class="muted">Профиль не найден.</p>';
      return;
    }

    box.innerHTML='<p class="muted">Загрузка личных данных...</p>';
    const avatarUrl=await signedAvatar(u.avatar_path);

    box.innerHTML=`
      <div class="admin-profile-card">
        <div class="admin-profile-avatar ${avatarUrl?'has-photo':''}" ${avatarUrl?`style="background-image:url('${avatarUrl}')"`:''}>
          ${avatarUrl?'':initials(u.full_name)}
        </div>
        <div class="admin-profile-main">
          <h3>${u.full_name || 'Без имени'}</h3>
          <span class="muted">ID: ${u.id}</span>
        </div>
        <div class="admin-profile-fields">
          <div><span>Телефон</span><strong>${u.phone || 'Не указан'}</strong></div>
          <div><span>Контактная почта</span><strong>${u.contact_email || 'Не указана'}</strong></div>
          <div><span>Почта для входа</span><strong>${u.email || 'Не указана'}</strong></div>
          <div><span>Роль</span><strong>${u.role || '—'}</strong></div>
        </div>
      </div>`;
  };
})();