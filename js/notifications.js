(() => {
  const REFRESH_MS = 5000;
  let refreshing = false;

  function $(id) {
    return document.getElementById(id);
  }

  function showBadge(id, value) {
    const badge = $(id);
    if (!badge) return;

    const count = Math.max(0, Number(value || 0));

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
      badge.title = `${count} новых уведомлений`;
    } else {
      badge.textContent = '0';
      badge.classList.add('hidden');
      badge.removeAttribute('title');
    }
  }

  async function getProfile() {
    const { data, error } = await sb
      .from('profiles')
      .select('id,role,status')
      .eq('id', currentUser.id)
      .single();

    if (error) throw error;
    return data;
  }

  async function homeworkUnread(profile) {
    try {
      if (profile.role === 'teacher' || profile.role === 'admin') {
        const { data, error } = await sb.rpc('teacher_get_my_homework');
        if (error) throw error;

        return (data || []).reduce(
          (sum, row) => sum + (row.teacher_unread === true ? 1 : 0),
          0
        );
      }

      const { data, error } = await sb.rpc('student_get_my_homework');
      if (error) throw error;

      return (data || []).reduce(
        (sum, row) => sum + (row.student_unread === true ? 1 : 0),
        0
      );
    } catch (error) {
      console.warn('Homework badge:', error);
      return 0;
    }
  }

  async function messageUnread(profile) {
    try {
      const teacher =
        profile.role === 'teacher' ||
        profile.role === 'admin';

      const contactFunction = teacher
        ? 'teacher_get_my_students'
        : 'student_get_my_teachers';

      const { data: contacts, error } = await sb.rpc(contactFunction);
      if (error) throw error;

      if (!contacts?.length) return 0;

      const counts = await Promise.all(
        contacts.map(async contact => {
          const otherId = teacher
            ? contact.student_id
            : contact.teacher_id;

          if (!otherId) return 0;

          const { data, error: countError } = await sb.rpc(
            'count_unread_teacher_student_messages',
            { p_other_user_id: otherId }
          );

          if (countError) {
            console.warn('Unread message count:', countError);
            return 0;
          }

          return Number(data || 0);
        })
      );

      return counts.reduce((sum, value) => sum + value, 0);
    } catch (error) {
      console.warn('Messages badge:', error);
      return 0;
    }
  }

  async function refresh() {
    if (refreshing || !window.sb || !window.currentUser) return;
    refreshing = true;

    try {
      const profile = await getProfile();

      if (!profile || profile.status !== 'active') {
        showBadge('homeworkNavBadge', 0);
        showBadge('messagesNavBadge', 0);
        return;
      }

      const [homeworkCount, messageCount] = await Promise.all([
        homeworkUnread(profile),
        messageUnread(profile)
      ]);

      showBadge('homeworkNavBadge', homeworkCount);
      showBadge('messagesNavBadge', messageCount);

      // Teacher-only menu links.
      const teacherLink = $('teacherLink');
      const journalLink = $('teacherJournalLink');

      if (
        profile.status === 'active' &&
        (profile.role === 'teacher' || profile.role === 'admin')
      ) {
        teacherLink?.classList.remove('hidden');
        journalLink?.classList.remove('hidden');
      }

      if (profile.role === 'admin') {
        $('adminLink')?.classList.remove('hidden');
      }

      window.dispatchEvent(new CustomEvent('lp:notifications-updated', {
        detail: {
          homework: homeworkCount,
          messages: messageCount
        }
      }));
    } catch (error) {
      console.warn('Global notifications:', error);
    } finally {
      refreshing = false;
    }
  }

  async function waitForAuth() {
    let tries = 0;

    const timer = setInterval(async () => {
      tries += 1;

      if (window.sb && window.currentUser) {
        clearInterval(timer);

        await refresh();

        window.LPNotifications = {
          refresh
        };

        setInterval(refresh, REFRESH_MS);

        window.addEventListener('focus', refresh);

        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) refresh();
        });

        window.addEventListener('pageshow', refresh);

        // Когда ДЗ/чат отмечают уведомление прочитанным,
        // другие скрипты могут вызвать:
        // window.LPNotifications?.refresh()
      }

      if (tries >= 100) {
        clearInterval(timer);
      }
    }, 100);
  }

  waitForAuth();
})();