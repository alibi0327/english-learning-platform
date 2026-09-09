(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const els = {
    cardAvatar: document.getElementById('cabinetAvatar'),
    cardInitials: document.getElementById('cabinetInitials'),
    cardName: document.getElementById('cabinetName'),
    cardRole: document.getElementById('cabinetRole'),
    cardPhone: document.getElementById('cabinetPhone'),
    cardEmail: document.getElementById('cabinetEmail'),
    open: document.getElementById('openProfileCabinet'),
    modal: document.getElementById('profileCabinetModal'),
    close: document.getElementById('closeProfileCabinet'),
    form: document.getElementById('profileCabinetForm'),
    fullName: document.getElementById('profileFullName'),
    phone: document.getElementById('profilePhone'),
    contactEmail: document.getElementById('profileContactEmail'),
    loginEmail: document.getElementById('profileLoginEmail'),
    file: document.getElementById('profileAvatarFile'),
    preview: document.getElementById('profileAvatarPreview'),
    previewInitials: document.getElementById('profileAvatarInitials'),
    remove: document.getElementById('removeProfilePhoto'),
    save: document.getElementById('saveProfileCabinet'),
    message: document.getElementById('profileCabinetMessage')
  };

  let currentProfile = null;
  let pendingFile = null;
  let previewObjectUrl = null;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'LP';
    return parts.slice(0,2).map(x => x[0]).join('').toLocaleUpperCase();
  }

  function roleLabel(role) {
    return ({student:'Ученик', teacher:'Преподаватель', admin:'Администратор'})[role] || role || 'Пользователь';
  }

  async function signedAvatar(path) {
    if (!path) return null;
    const { data, error } = await sb.storage.from('avatars').createSignedUrl(path, 60 * 60);
    if (error) {
      console.warn('Avatar signed URL:', error);
      return null;
    }
    return data?.signedUrl || null;
  }

  function setAvatar(el, initialsEl, name, url) {
    el.style.backgroundImage = url ? `url("${url}")` : '';
    el.classList.toggle('has-photo', !!url);
    initialsEl.textContent = initials(name);
    initialsEl.style.display = url ? 'none' : '';
  }

  async function loadProfile() {
    const { data, error } = await sb
      .from('profiles')
      .select('id,full_name,email,role,status,phone,contact_email,avatar_path')
      .eq('id', currentUser.id)
      .single();

    if (error) {
      console.error(error);
      els.message.textContent = 'Не удалось загрузить данные кабинета.';
      els.message.className = 'message error';
      return;
    }

    currentProfile = data;
    const avatarUrl = await signedAvatar(data.avatar_path);

    els.cardName.textContent = data.full_name || 'Без имени';
    els.cardRole.textContent = roleLabel(data.role);
    els.cardPhone.textContent = data.phone || 'Не указан';
    els.cardEmail.textContent = data.contact_email || data.email || 'Не указана';
    setAvatar(els.cardAvatar, els.cardInitials, data.full_name, avatarUrl);

    els.fullName.value = data.full_name || '';
    els.phone.value = data.phone || '';
    els.contactEmail.value = data.contact_email || data.email || '';
    els.loginEmail.value = data.email || currentUser.email || '';
    setAvatar(els.preview, els.previewInitials, data.full_name, avatarUrl);
    els.remove.classList.toggle('hidden', !data.avatar_path);
  }

  function openModal() {
    els.message.textContent = '';
    els.message.className = 'message';
    pendingFile = null;
    els.file.value = '';
    els.modal.classList.remove('hidden');
  }

  function closeModal() {
    els.modal.classList.add('hidden');
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  els.open?.addEventListener('click', openModal);
  els.close?.addEventListener('click', closeModal);
  els.modal?.addEventListener('click', e => {
    if (e.target === els.modal) closeModal();
  });

  els.file?.addEventListener('change', () => {
    const file = els.file.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) {
      els.file.value = '';
      alert('Можно загрузить только JPG, PNG или WEBP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      els.file.value = '';
      alert('Размер фото должен быть не больше 3 МБ.');
      return;
    }

    pendingFile = file;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    setAvatar(els.preview, els.previewInitials, els.fullName.value, previewObjectUrl);
  });

  els.remove?.addEventListener('click', async () => {
    if (!currentProfile?.avatar_path) {
      pendingFile = null;
      setAvatar(els.preview, els.previewInitials, els.fullName.value, null);
      return;
    }

    els.remove.disabled = true;
    const { error: removeError } = await sb.storage.from('avatars').remove([currentProfile.avatar_path]);
    if (removeError) {
      alert('Не удалось удалить фото.');
      els.remove.disabled = false;
      return;
    }

    const { error: updateError } = await sb.rpc('update_my_profile', {
      p_full_name: els.fullName.value.trim(),
      p_phone: els.phone.value.trim() || null,
      p_contact_email: els.contactEmail.value.trim() || null,
      p_avatar_path: null
    });

    els.remove.disabled = false;
    if (updateError) {
      alert('Фото удалено из хранилища, но профиль не обновился. Обновите страницу.');
      return;
    }

    pendingFile = null;
    await loadProfile();
  });

  els.form?.addEventListener('submit', async e => {
    e.preventDefault();
    els.save.disabled = true;
    els.save.textContent = 'Сохраняем...';
    els.message.textContent = '';
    els.message.className = 'message';

    try {
      let avatarPath = currentProfile?.avatar_path || null;

      if (pendingFile) {
        avatarPath = `${currentUser.id}/avatar`;
        const { error: uploadError } = await sb.storage.from('avatars').upload(
          avatarPath,
          pendingFile,
          {
            upsert: true,
            contentType: pendingFile.type,
            cacheControl: '3600'
          }
        );
        if (uploadError) throw uploadError;
      }

      const { error } = await sb.rpc('update_my_profile', {
        p_full_name: els.fullName.value.trim(),
        p_phone: els.phone.value.trim() || null,
        p_contact_email: els.contactEmail.value.trim() || null,
        p_avatar_path: avatarPath
      });
      if (error) throw error;

      pendingFile = null;
      await loadProfile();

      const welcome = document.getElementById('welcomeTitle');
      if (welcome && currentProfile?.full_name) {
        welcome.textContent = `Добро пожаловать, ${currentProfile.full_name}`;
      }

      els.message.textContent = '✓ Данные сохранены.';
      els.message.className = 'message success';
    } catch (error) {
      console.error(error);
      els.message.textContent = `Не удалось сохранить: ${error.message || 'ошибка'}`;
      els.message.className = 'message error';
    } finally {
      els.save.disabled = false;
      els.save.textContent = 'Сохранить данные';
    }
  });

  await loadProfile();
})();