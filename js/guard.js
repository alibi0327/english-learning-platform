window.currentUser = null;
window.currentProfile = null;

async function bootGuard(requireAdmin = false) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = 'index.html';
    return null;
  }

  currentUser = session.user;
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();

  if (error || !profile || profile.status !== 'active') {
    await sb.auth.signOut();
    location.href = 'index.html';
    return null;
  }

  currentProfile = profile;
  if (requireAdmin && profile.role !== 'admin') {
    location.href = 'dashboard.html';
    return null;
  }

  document.querySelectorAll('#userName').forEach(el => el.textContent = profile.full_name || profile.email);
  document.querySelectorAll('#adminLink').forEach(el => {
    if (profile.role === 'admin') el.classList.remove('hidden');
  });

  document.querySelectorAll('#logoutBtn').forEach(btn => btn.addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = 'index.html';
  }));

  return profile;
}
