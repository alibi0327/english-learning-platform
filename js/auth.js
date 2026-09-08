const form = document.getElementById('loginForm');
const msg = document.getElementById('loginMessage');

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) location.href = 'dashboard.html';
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'message';
  msg.textContent = 'Проверяем данные...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    msg.className = 'message error';
    msg.textContent = 'Не удалось войти: проверьте email и пароль.';
    return;
  }

  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (pErr || !profile) {
    await sb.auth.signOut();
    msg.className = 'message error';
    msg.textContent = 'Профиль пользователя не найден.';
    return;
  }

  if (profile.status === 'blocked') {
    await sb.auth.signOut();
    msg.className = 'message error';
    msg.textContent = 'Ваш аккаунт заблокирован. Обратитесь к администратору.';
    return;
  }

  location.href = profile.role === 'admin' ? 'admin.html' : 'dashboard.html';
});
