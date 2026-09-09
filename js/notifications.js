(() => {
  const UPDATE_INTERVAL = 10000;

  function ensureBadge(link, id) {
    if (!link) return null;

    link.classList.add('nav-link-with-badge');

    let badge = document.getElementById(id);
    if (!badge) {
      badge = document.createElement('span');
      badge.id = id;
      badge.className = 'nav-notification-badge hidden';
      badge.textContent = '0';
      link.appendChild(badge);
    }
    return badge;
  }

  function setBadge(badge, count) {
    if (!badge) return;
    const value = Math.max(0, Number(count || 0));

    if (value > 0) {
      badge.textContent = value > 99 ? '99+' : String(value);
      badge.classList.remove('hidden');
      badge.setAttribute('aria-label', `${value} новых уведомлений`);
    } else {
      badge.textContent = '0';
      badge.classList.add('hidden');
      badge.removeAttribute('aria-label');
    }
  }

  function findNavLink(href) {
    return [...document.querySelectorAll('nav a')].find(a => {
      const raw = a.getAttribute('href') || '';
      return raw === href || raw.endsWith('/' + href);
    });
  }

  async function getCurrentProfile() {
    if (!window.currentUser || !window.sb) return null;

    const { data, error } = await sb
      .from('profiles')
      .select('id,role,status')
      .eq('id', currentUser.id)
      .single();

    if (error) throw error;
    return data;
  }

  async function getHomeworkUnread(profile) {
    try {
      if (profile.role === 'teacher' || profile.role === 'admin') {
        const { data, error } = await sb.rpc('teacher_get_my_homework');
        if (error) throw error;
        return (data || []).filter(row => row.teacher_unread === true).length;
      }

      const { data, error } = await sb.rpc('student_get_my_homework');
      if (error) throw error;
      return (data || []).filter(row => row.student_unread === true).length;
    } catch (error) {
      console.warn('Homework notification badge:', error);
      return 0;
    }
  }

  async function getMessageUnread(profile) {
    try {
      const isTeacher = profile.role === 'teacher' || profile.role === 'admin';
      const fn = isTeacher ? 'teacher_get_my_students' : 'student_get_my_teachers';

      const { data: contacts, error } = await sb.rpc(fn);
      if (error) throw error;

      let total = 0;

      for (const item of (contacts || [])) {
        const otherId = isTeacher ? item.student_id : item.teacher_id;
        if (!otherId) continue;

        const { data: count, error: countError } = await sb.rpc(
          'count_unread_teacher_student_messages',
          { p_other_user_id: otherId }
        );

        if (countError) {
          console.warn('Unread message count:', countError);
          continue;
        }

        total += Number(count || 0);
      }

      return total;
    } catch (error) {
      console.warn('Messages notification badge:', error);
      return 0;
    }
  }

  async function updateNavNotifications() {
    const homeworkLink = findNavLink('homework.html');
    const messagesLink = findNavLink('messages.html');

    if (!homeworkLink && !messagesLink) return;

    const homeworkBadge = ensureBadge(homeworkLink, 'homeworkNavBadge');
    const messagesBadge = ensureBadge(messagesLink, 'messagesNavBadge');

    try {
      const profile = await getCurrentProfile();
      if (!profile || profile.status !== 'active') {
        setBadge(homeworkBadge, 0);
        setBadge(messagesBadge, 0);
        return;
      }

      const [homeworkCount, messageCount] = await Promise.all([
        homeworkLink ? getHomeworkUnread(profile) : Promise.resolve(0),
        messagesLink ? getMessageUnread(profile) : Promise.resolve(0)
      ]);

      setBadge(homeworkBadge, homeworkCount);
      setBadge(messagesBadge, messageCount);
    } catch (error) {
      console.warn('Notification badges:', error);
      setBadge(homeworkBadge, 0);
      setBadge(messagesBadge, 0);
    }
  }

  async function boot() {
    // guard.js обычно устанавливает currentUser немного раньше,
    // но на медленном соединении подождём до 5 секунд.
    let attempts = 0;

    const wait = setInterval(async () => {
      attempts++;

      if (window.sb && window.currentUser) {
        clearInterval(wait);
        await updateNavNotifications();

        window.LPNotifications = {
          refresh: updateNavNotifications
        };

        setInterval(updateNavNotifications, UPDATE_INTERVAL);

        // Обновляем сразу, когда пользователь возвращается на вкладку.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) updateNavNotifications();
        });

        window.addEventListener('focus', updateNavNotifications);
      }

      if (attempts >= 50) {
        clearInterval(wait);
      }
    }, 100);
  }

  boot();
})();