(async () => {
  const profile = await bootGuard();
  if (!profile) return;

  const body = document.body;
  const courseCode = body.dataset.courseCode;
  const courseTitle = body.dataset.courseTitle;
  const finalKey = body.dataset.finalKey;
  const finalUrl = body.dataset.finalUrl;

  const gate = document.getElementById('certificateGate');
  const certificate = document.getElementById('certificate');
  const printBtn = document.getElementById('printCertificate');

  const { data: finalProgress, error: progressError } = await sb
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', currentUser.id)
    .eq('lesson_key', finalKey)
    .eq('completed', true)
    .maybeSingle();

  if (progressError || !finalProgress) {
    gate.className = 'message error';
    gate.innerHTML = `Сертификат пока недоступен. Сначала успешно пройдите <a href="${finalUrl}"><strong>Final Exam</strong></a>.`;
    certificate.style.display = 'none';
    if (printBtn) printBtn.style.display = 'none';
    return;
  }

  const { data: bestRows } = await sb
    .from('quiz_results')
    .select('score,created_at')
    .eq('user_id', currentUser.id)
    .eq('lesson_key', finalKey)
    .eq('passed', true)
    .order('score', { ascending: false })
    .limit(1);

  const best = bestRows?.[0];
  const bestScore = Number(best?.score ?? 80);
  const completedDate = new Date(finalProgress.completed_at || best?.created_at || Date.now());
  const name = String(profile.full_name || currentUser.email || 'Student').trim();

  const rawId = String(currentUser.id || '')
    .replace(/-/g,'')
    .toUpperCase();

  const datePart = [
    completedDate.getFullYear(),
    String(completedDate.getMonth()+1).padStart(2,'0')
  ].join('');

  const certId = `LP-${courseCode}-${datePart}-${rawId.slice(-8) || 'CERT0000'}`;

  const dateText = completedDate.toLocaleDateString('ru-RU',{
    day:'2-digit',
    month:'long',
    year:'numeric'
  });

  document.getElementById('certificateName').textContent = name;
  document.getElementById('certificateScore').textContent = `${bestScore}%`;
  document.getElementById('certificateDate').textContent = dateText;
  document.getElementById('certificateId').textContent = certId;
  document.getElementById('certificateIdBottom').textContent = certId;

  gate.className = 'message success';
  gate.textContent = `Сертификат подтверждён: ${courseTitle}.`;

  printBtn?.addEventListener('click', () => window.print());
})();