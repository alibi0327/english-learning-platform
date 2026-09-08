(async () => {
  const profile = await bootGuard();
  if (!profile) return;


  const speechState = {
    rate: 1,
    locale: 'en-US',
    voice: null,
    voices: []
  };

  function loadEnglishVoices() {
    if (!('speechSynthesis' in window)) return [];
    const all = window.speechSynthesis.getVoices() || [];
    speechState.voices = all.filter(v => /^en(-|_)/i.test(v.lang || ''));

    const preferredNames = [
      'Microsoft Aria',
      'Microsoft Jenny',
      'Microsoft Guy',
      'Google US English',
      'Samantha',
      'Alex',
      'Daniel',
      'Karen',
      'Moira',
      'Serena'
    ];

    const localeVoices = speechState.voices.filter(v =>
      (v.lang || '').toLowerCase().startsWith(speechState.locale.toLowerCase())
    );

    speechState.voice =
      preferredNames.map(name =>
        localeVoices.find(v => (v.name || '').toLowerCase().includes(name.toLowerCase()))
      ).find(Boolean)
      || localeVoices[0]
      || speechState.voices[0]
      || null;

    const select = document.getElementById('speechVoice');
    if (select) {
      const previous = select.value;
      select.innerHTML = speechState.voices.length
        ? speechState.voices.map((v, i) =>
            `<option value="${i}">${v.name} — ${v.lang}</option>`
          ).join('')
        : '<option value="">English voice not found</option>';

      const activeIndex = speechState.voices.findIndex(v => v === speechState.voice);
      if (activeIndex >= 0) select.value = String(activeIndex);
      else if (previous && select.querySelector(`option[value="${previous}"]`)) select.value = previous;
    }

    return speechState.voices;
  }

  async function ensureEnglishVoice() {
    let voices = loadEnglishVoices();
    if (voices.length) return speechState.voice;

    await new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      const timer = setTimeout(done, 1200);
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        clearTimeout(timer);
        done();
      }, { once:true });
    });

    loadEnglishVoices();
    return speechState.voice;
  }

  async function speakEnglish(text) {
    if (!('speechSynthesis' in window)) {
      alert('Ваш браузер не поддерживает озвучивание текста.');
      return;
    }

    const voice = await ensureEnglishVoice();

    if (!voice) {
      alert('В браузере не найден английский голос. Попробуйте Chrome или Edge и установите English (US/UK) voice в системе.');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang || speechState.locale;
    utterance.voice = voice;
    utterance.rate = speechState.rate;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', loadEnglishVoices);
    setTimeout(loadEnglishVoices, 100);
  }

  const key = new URLSearchParams(location.search).get('lesson') || A1_DATA.lessons[0].key;
  const idx = A1_DATA.lessons.findIndex(x => x.key === key);
  if (idx < 0) { location.href = 'courses.html'; return; }

  const { data: prog } = await sb.from('lesson_progress')
    .select('lesson_key,completed')
    .eq('user_id', currentUser.id)
    .eq('completed', true);

  const completed = new Set((prog || []).map(x => x.lesson_key));
  const unlocked = idx === 0 || completed.has(A1_DATA.lessons[idx-1].key) || profile.role === 'admin';
  if (!unlocked) { location.href = 'courses.html'; return; }

  const lesson = A1_DATA.lessons[idx];
  document.title = `English Path — ${lesson.title}`;

  document.getElementById('lessonNav').innerHTML = A1_DATA.lessons.map((l, i) => {
    const isUnlocked = i === 0 || completed.has(A1_DATA.lessons[i-1].key) || profile.role === 'admin';
    const done = completed.has(l.key);
    return isUnlocked
      ? `<a class="${l.key===key?'active':''}" href="lesson.html?lesson=${l.key}">${done?'✓ ':''}${i+1}. ${l.title}</a>`
      : `<a style="opacity:.45;pointer-events:none">🔒 ${i+1}. ${l.title}</a>`;
  }).join('');

  const vocab = lesson.vocab.map(v =>
    `<tr><td><strong>${v[0]}</strong></td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`
  ).join('');

  const examples = lesson.examples.map(e =>
    `<div class="example example-with-audio">
      <div>
        <strong>${e[0]}</strong><br>
        <span class="muted">${e[1]}</span>
      </div>
      <button class="audio-btn" type="button" data-speak="${encodeURIComponent(e[0])}" aria-label="Прослушать пример">🔊</button>
    </div>`
  ).join('');

  const grammar = lesson.grammar?.length
    ? `<h2>Правило в таблице</h2>
       <div class="table-wrap"><table class="vocab-table">
       <thead><tr>${lesson.grammar[0].map(x=>`<th>${x}</th>`).join('')}</tr></thead>
       <tbody>${lesson.grammar.slice(1).map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody>
       </table></div>` : '';

  const practice = lesson.practice?.length
    ? `<h2>Практика перед тестом</h2>
       <p class="muted">Сначала попробуйте ответить самостоятельно, затем нажмите «Показать ответ».</p>
       <div class="practice-list">${lesson.practice.map((p,i)=>`
         <div class="question">
           <strong>${i+1}. ${p.q}</strong>
           <p class="muted">${p.hint || ''}</p>
           <button class="btn ghost practice-answer-btn" type="button" data-answer="${encodeURIComponent(p.a)}">Показать ответ</button>
           <div class="practice-answer message" style="display:none"></div>
         </div>`).join('')}</div>` : '';

  document.getElementById('lessonBody').innerHTML = `
    <div class="eyebrow">A1 BEGINNER · УРОК ${idx+1} ИЗ ${A1_DATA.lessons.length}</div>
    <h1>${lesson.title}</h1>
    <p class="muted">${lesson.ru}</p>
    <div class="progress-line"><div style="width:${Math.round((idx+1)/A1_DATA.lessons.length*100)}%"></div></div>

    <div class="audio-toolbar">
      <div class="audio-toolbar-title">
        <strong>🎧 English pronunciation</strong>
        <span class="muted">Используется только английский системный голос.</span>
      </div>

      <label class="speech-rate-label">
        Акцент
        <select id="speechLocale">
          <option value="en-US" selected>US 🇺🇸</option>
          <option value="en-GB">UK 🇬🇧</option>
        </select>
      </label>

      <label class="speech-voice-label">
        Голос
        <select id="speechVoice">
          <option>Загрузка голосов...</option>
        </select>
      </label>

      <label class="speech-rate-label">
        Скорость
        <select id="speechRate">
          <option value="0.75">0.75×</option>
          <option value="0.9">0.9×</option>
          <option value="1" selected>1×</option>
        </select>
      </label>

      <button id="listenLessonTitle" class="btn ghost" type="button">🔊 Проверить голос</button>
      <button id="stopSpeech" class="btn ghost" type="button">⏹ Стоп</button>
    </div>

    <h2>Объяснение</h2>
    ${lesson.theory.map(p=>`<p>${p}</p>`).join('')}
    ${grammar}
    <h2>Примеры</h2>${examples}
    <h2>Слова урока</h2>
    <div class="table-wrap"><table class="vocab-table">
      <thead><tr><th>English</th><th>Транскрипция</th><th>Перевод</th><th>Пример</th></tr></thead>
      <tbody>${vocab}</tbody>
    </table></div>
    ${practice}
  `;

  document.querySelectorAll('.practice-answer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.nextElementSibling;
      box.style.display = 'block';
      box.className = 'practice-answer message success';
      box.textContent = `Ответ: ${decodeURIComponent(btn.dataset.answer)}`;
      btn.style.display = 'none';
    });
  });

  document.querySelectorAll('[data-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      speakEnglish(decodeURIComponent(btn.dataset.speak));
    });
  });

  const speechRateSelect = document.getElementById('speechRate');
  if (speechRateSelect) {
    speechRateSelect.addEventListener('change', () => {
      speechState.rate = Number(speechRateSelect.value) || 1;
    });
  }

  const speechLocaleSelect = document.getElementById('speechLocale');
  if (speechLocaleSelect) {
    speechLocaleSelect.addEventListener('change', () => {
      speechState.locale = speechLocaleSelect.value || 'en-US';
      loadEnglishVoices();

      // Prefer a voice that matches the selected accent.
      const matching = speechState.voices.filter(v =>
        (v.lang || '').toLowerCase().startsWith(speechState.locale.toLowerCase())
      );
      if (matching.length) {
        speechState.voice = matching[0];
        loadEnglishVoices();
      }
    });
  }

  const speechVoiceSelect = document.getElementById('speechVoice');
  if (speechVoiceSelect) {
    speechVoiceSelect.addEventListener('change', () => {
      const index = Number(speechVoiceSelect.value);
      if (Number.isInteger(index) && speechState.voices[index]) {
        speechState.voice = speechState.voices[index];
        speechState.locale = speechState.voice.lang || speechState.locale;
        if (speechLocaleSelect) {
          speechLocaleSelect.value = /^en-GB/i.test(speechState.locale) ? 'en-GB' : 'en-US';
        }
      }
    });
  }

  loadEnglishVoices();

  const listenLessonTitle = document.getElementById('listenLessonTitle');
  if (listenLessonTitle) {
    listenLessonTitle.addEventListener('click', () => speakEnglish(lesson.title));
  }

  const stopSpeech = document.getElementById('stopSpeech');
  if (stopSpeech) {
    stopSpeech.addEventListener('click', () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
  }

  const qa = document.getElementById('quizArea');
  qa.innerHTML = `
    <div class="eyebrow">ОБЯЗАТЕЛЬНЫЙ ТЕСТ</div>
    <h2>Проверка знаний</h2>
    <p class="muted">Следующий урок откроется только после результата не ниже ${APP_CONFIG.PASS_SCORE}%.</p>
    <form id="quizForm">
      ${lesson.quiz.map((q, qi)=>`
        <div class="question"><strong>${qi+1}. ${q.q}</strong>
          ${q.options.map((o, oi)=>`<label><input required type="radio" name="q${qi}" value="${oi}"> ${o}</label>`).join('')}
        </div>`).join('')}
      <button class="btn primary" type="submit">Завершить тест</button>
      <div id="quizResult" class="message"></div>
    </form>
  `;

  document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = new FormData(e.target);
    let correct = 0;
    lesson.quiz.forEach((q, qi) => {
      if (Number(form.get(`q${qi}`)) === q.answer) correct++;
    });

    const score = Math.round(correct / lesson.quiz.length * 100);
    const passed = score >= APP_CONFIG.PASS_SCORE;
    const result = document.getElementById('quizResult');

    const { data: course, error: courseError } = await sb.from('courses')
      .select('id').eq('code','A1').single();

    if (courseError || !course) {
      result.className = 'message error';
      result.textContent = 'Не удалось определить курс A1.';
      return;
    }

    const { data: attempts } = await sb.from('quiz_results')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('lesson_key', lesson.key);

    await sb.from('quiz_results').insert({
      user_id: currentUser.id,
      course_id: course.id,
      lesson_key: lesson.key,
      score,
      passed,
      attempt: (attempts?.length || 0) + 1
    });

    if (passed) {
      await sb.from('lesson_progress').upsert({
        user_id: currentUser.id,
        course_id: course.id,
        lesson_key: lesson.key,
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,course_id,lesson_key' });

      result.className = 'message success';
      const next = A1_DATA.lessons[idx+1];
      result.innerHTML = `Результат: <strong>${score}%</strong> (${correct}/${lesson.quiz.length}). Тест пройден. ${
        next
          ? `<a class="btn primary" style="margin-left:10px" href="lesson.html?lesson=${next.key}">Следующий урок →</a>`
          : `<a class="btn primary" style="margin-left:10px" href="final-exam.html">Перейти к A1 Final Exam →</a>`
      }`;
    } else {
      result.className = 'message error';
      result.innerHTML = `Результат: <strong>${score}%</strong> (${correct}/${lesson.quiz.length}). Нужно минимум ${APP_CONFIG.PASS_SCORE}%. Повторите материал и попробуйте ещё раз.`;
    }
  });
})();
