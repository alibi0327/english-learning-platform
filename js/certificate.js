(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const { data: finalProgress, error: progressError } = await sb.from('lesson_progress')
    .select('completed_at')
    .eq('user_id', currentUser.id)
    .eq('lesson_key', 'a1-final')
    .eq('completed', true)
    .maybeSingle();

  const gate = document.getElementById('certificateGate');
  const cert = document.getElementById('certificate');

  if (progressError || !finalProgress) {
    gate.className = 'message error';
    gate.innerHTML = `Сертификат пока недоступен. Сначала необходимо успешно пройти <a href="final-exam.html"><strong>A1 Final Exam</strong></a>.`;
    cert.style.display = 'none';
    document.getElementById('printCertificate').style.display = 'none';
    return;
  }

  const { data: bestRows } = await sb.from('quiz_results')
    .select('score,created_at')
    .eq('user_id', currentUser.id)
    .eq('lesson_key', 'a1-final')
    .eq('passed', true)
    .order('score', { ascending: false })
    .limit(1);

  const bestScore = bestRows?.[0]?.score ?? 80;
  const name = (profile.full_name || currentUser.email || 'Student').trim();
  const completedDate = new Date(finalProgress.completed_at || bestRows?.[0]?.created_at || Date.now());
  const dateText = completedDate.toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' });

  const rawId = String(currentUser.id || '').replace(/-/g, '').toUpperCase();
  const certId = `A1-${completedDate.getFullYear()}-${rawId.slice(-8) || 'CERT'}`;

  document.getElementById('certificateName').textContent = name;
  document.getElementById('certificateScore').textContent = `${bestScore}%`;
  document.getElementById('certificateDate').textContent = dateText;
  document.getElementById('certificateId').textContent = certId;

  gate.className = 'message success';
  gate.textContent = 'Сертификат подтверждён результатами вашего A1 Final Exam.';

  document.getElementById('printCertificate').addEventListener('click', () => {
    window.print();
  });
})();
