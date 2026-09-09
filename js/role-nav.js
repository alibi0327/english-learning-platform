(async () => {
  try {
    if (!window.currentUser) return;
    const { data } = await sb
      .from('profiles')
      .select('role,status')
      .eq('id', currentUser.id)
      .single();

    const teacherLink = document.getElementById('teacherLink');
    const adminLink = document.getElementById('adminLink');

    if (teacherLink && data?.status === 'active' && (data?.role === 'teacher' || data?.role === 'admin')) {
      teacherLink.classList.remove('hidden');
    }
    if (adminLink && data?.status === 'active' && data?.role === 'admin') {
      adminLink.classList.remove('hidden');
    }
  } catch (e) {
    console.warn('role-nav:', e);
  }
})();