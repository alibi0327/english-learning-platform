(() => {
  const CONFIGS = [
    {global:'A1_DATA',    lang:'en', level:'A1'},
    {global:'A2_DATA',    lang:'en', level:'A2'},
    {global:'KZ_A1_DATA', lang:'kz', level:'A1'},
    {global:'KZ_A2_DATA', lang:'kz', level:'A2'},
    {global:'KZ_B1_DATA', lang:'kz', level:'B1'},
    {global:'KZ_B2_DATA', lang:'kz', level:'B2'},
    {global:'KZ_C1_DATA', lang:'kz', level:'C1'}
  ];

  const KZ_KEYS = [
    'ә','і','ң','ғ','ү','ұ','қ','ө','һ',
    'а','б','в','г','д','е','ё','ж','з','и','й',
    'к','л','м','н','о','п','р','с','т','у','ф',
    'х','ц','ч','ш','щ','ъ','ы','ь','э','ю','я'
  ];
  const EN_KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('');

  const normalize = s => String(s ?? '')
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  function sourceInfo() {
    for (const c of CONFIGS) {
      if (window[c.global]?.lessons?.length) {
        const url = new URLSearchParams(location.search);
        const key = url.get('lesson') || window[c.global].lessons[0].key;
        const lesson = window[c.global].lessons.find(x => x.key === key);
        if (lesson) return {...c, data:window[c.global], lesson};
      }
    }
    return null;
  }

  function vocabItems(info) {
    const raw = info.lesson.vocab || [];
    return raw.map(v => {
      if (info.lang === 'en') {
        return {
          word:String(v[0]||'').trim(),
          translation:String(v[2]||'').trim(),
          example:String(v[3]||'').trim()
        };
      }
      return {
        word:String(v[0]||'').trim(),
        translation:String(v[1]||'').trim(),
        example:''
      };
    }).filter(x => x.word && x.translation && x.word.length <= 35);
  }

  function makeWrong(word, lang) {
    const kzMap = {'ә':'а','ғ':'г','қ':'к','ң':'н','ө':'о','ұ':'у','ү':'у','һ':'х','і':'и'};
    const chars=[...word];
    if (lang === 'kz') {
      for (let i=0;i<chars.length;i++) {
        const low=chars[i].toLocaleLowerCase();
        if (kzMap[low]) {
          const replacement=kzMap[low];
          chars[i] = chars[i] === low ? replacement : replacement.toLocaleUpperCase();
          return chars.join('');
        }
      }
    }
    const letters=chars.map((c,i)=>/[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(c)?i:-1).filter(i=>i>=0);
    if (letters.length >= 2) {
      const a=letters[Math.max(0, Math.floor(letters.length/2)-1)];
      const b=letters[Math.min(letters.length-1, Math.floor(letters.length/2))];
      if(a!==b){ [chars[a],chars[b]]=[chars[b],chars[a]]; return chars.join(''); }
    }
    if (letters.length) {
      const i=letters[0];
      chars[i] = lang==='en' ? (normalize(chars[i])==='a'?'e':'a') : 'а';
    }
    return chars.join('');
  }

  function gapSentence(item, lang) {
    if (item.example) {
      const re = new RegExp(item.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
      if(re.test(item.example)) return item.example.replace(re, '_____');
    }
    return lang==='kz'
      ? `Қазақша сөзді жазыңыз: «${item.translation}» → _____`
      : `Write the English word: «${item.translation}» → _____`;
  }

  function buildExercises(info) {
    const words=vocabItems(info);
    if(!words.length) return [];
    const result=[];
    const modes=['translate','gap','fix'];

    // Deterministic rotation so every lesson feels different but stable.
    for(let i=0;i<10;i++){
      const item=words[i % words.length];
      const mode=modes[i % modes.length];
      if(mode==='translate'){
        result.push({
          mode,
          item,
          title:'Напиши перевод',
          prompt: info.lang==='kz'
            ? `Напиши по-казахски: «${item.translation}»`
            : `Напиши по-английски: «${item.translation}»`,
          answer:item.word
        });
      } else if(mode==='gap'){
        result.push({
          mode,
          item,
          title:'Заполни пропуск',
          prompt:gapSentence(item,info.lang),
          answer:item.word
        });
      } else {
        const wrong=makeWrong(item.word,info.lang);
        result.push({
          mode,
          item,
          title:'Исправь ошибку',
          prompt:`Неправильно: «${wrong}». Напиши слово правильно.`,
          answer:item.word
        });
      }
    }
    return result;
  }

  function insertUI(info) {
    if(document.getElementById('spellingPractice')) return;
    const quiz=document.getElementById('quizArea');
    if(!quiz) return;
    const section=document.createElement('section');
    section.id='spellingPractice';
    section.className='panel spelling-practice';
    quiz.parentNode.insertBefore(section,quiz);

    const exercises=buildExercises(info);
    if(!exercises.length){
      section.innerHTML='<p class="muted">Для этого урока пока нет слов для тренировки правописания.</p>';
      return;
    }

    const storageKey=`lp-spelling-${info.lesson.key}`;
    let index=0, correct=0, streak=0, bestStreak=0, checked=false;
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved?.finished){
        correct=Number(saved.correct||0);
        bestStreak=Number(saved.bestStreak||0);
      }
    } catch(e){}

    section.innerHTML=`
      <div class="spelling-head">
        <div>
          <div class="eyebrow">ПРАВОПИСАНИЕ · ${info.lang==='kz'?'ҚАЗАҚ ТІЛІ':'ENGLISH'} ${info.level}</div>
          <h2>⌨️ Тренировка с клавиатурой</h2>
          <p class="muted">10 заданий: перевод, пропуски и исправление ошибок. Можно печатать своей клавиатурой или нажимать буквы ниже.</p>
        </div>
        <div class="spelling-score">
          <strong id="spellingScore">0 / 10</strong>
          <span id="spellingStreak">🔥 Серия: 0</span>
        </div>
      </div>

      <div class="spelling-progress"><span id="spellingProgressBar" style="width:10%"></span></div>

      <div id="spellingExercise" class="spelling-exercise">
        <div class="spelling-mode" id="spellingMode"></div>
        <div class="spelling-counter" id="spellingCounter"></div>
        <h3 id="spellingPrompt"></h3>

        <div class="spelling-input-row">
          <input id="spellingInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Введите ответ...">
          <button id="spellingCheck" type="button" class="btn primary">Проверить</button>
        </div>

        <div id="spellingFeedback" class="spelling-feedback"></div>

        <div class="virtual-keyboard-wrap">
          <div class="keyboard-label">${info.lang==='kz'?'Қазақша пернетақта':'English keyboard'}</div>
          <div class="virtual-keyboard" id="virtualKeyboard"></div>
          <div class="keyboard-actions">
            <button type="button" class="key action" data-action="space">Пробел</button>
            <button type="button" class="key action" data-action="backspace">⌫</button>
            <button type="button" class="key action" data-action="clear">Очистить</button>
          </div>
        </div>

        <div class="spelling-footer">
          <span class="muted">Enter — проверить · можно использовать физическую клавиатуру</span>
          <button id="spellingNext" type="button" class="btn ghost hidden">Следующее →</button>
        </div>
      </div>

      <div id="spellingFinish" class="spelling-finish hidden"></div>
    `;

    const input=section.querySelector('#spellingInput');
    const feedback=section.querySelector('#spellingFeedback');
    const nextBtn=section.querySelector('#spellingNext');
    const checkBtn=section.querySelector('#spellingCheck');
    const keyboard=section.querySelector('#virtualKeyboard');

    const keys=info.lang==='kz'?KZ_KEYS:EN_KEYS;
    keyboard.innerHTML=keys.map(k=>`<button type="button" class="key ${info.lang==='kz'&&'әіңғүұқөһ'.includes(k)?'special':''}" data-key="${k}">${k}</button>`).join('');

    function updateScore(){
      section.querySelector('#spellingScore').textContent=`${correct} / 10`;
      section.querySelector('#spellingStreak').textContent=`🔥 Серия: ${streak}`;
    }

    function render(){
      checked=false;
      const ex=exercises[index];
      section.querySelector('#spellingMode').textContent=ex.title;
      section.querySelector('#spellingCounter').textContent=`Задание ${index+1} / ${exercises.length}`;
      section.querySelector('#spellingPrompt').textContent=ex.prompt;
      section.querySelector('#spellingProgressBar').style.width=`${((index+1)/exercises.length)*100}%`;
      input.value='';
      input.disabled=false;
      feedback.className='spelling-feedback';
      feedback.innerHTML='';
      nextBtn.classList.add('hidden');
      checkBtn.classList.remove('hidden');
      setTimeout(()=>input.focus(),50);
      updateScore();
    }

    function check(){
      if(checked)return;
      const ex=exercises[index];
      const user=normalize(input.value);
      if(!user)return input.focus();
      checked=true;
      const ok=user===normalize(ex.answer);
      if(ok){
        correct++; streak++; bestStreak=Math.max(bestStreak,streak);
        feedback.className='spelling-feedback success';
        feedback.innerHTML=`<strong>✅ Правильно!</strong><span>${ex.answer}</span>`;
      }else{
        streak=0;
        feedback.className='spelling-feedback error';
        feedback.innerHTML=`<strong>❌ Неверно</strong><span>Ваш ответ: <b>${input.value}</b></span><span>Правильно: <b>${ex.answer}</b></span>`;
      }
      input.disabled=true;
      checkBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      updateScore();
    }

    function finish(){
      const pct=Math.round(correct/exercises.length*100);
      localStorage.setItem(storageKey,JSON.stringify({
        finished:true, correct, percent:pct, bestStreak, updatedAt:new Date().toISOString()
      }));
      section.querySelector('#spellingExercise').classList.add('hidden');
      const finishBox=section.querySelector('#spellingFinish');
      finishBox.classList.remove('hidden');
      finishBox.innerHTML=`
        <div class="spelling-result-icon">${pct>=80?'🏆':pct>=60?'👍':'📚'}</div>
        <div>
          <div class="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</div>
          <h3>${correct} / ${exercises.length} — ${pct}%</h3>
          <p class="muted">Лучшая серия: ${bestStreak}. ${pct>=80?'Отличный результат! Можно переходить к обязательному тесту.':'Можно повторить тренировку и улучшить правописание.'}</p>
        </div>
        <button id="spellingRestart" type="button" class="btn ${pct>=80?'ghost':'primary'}">Пройти ещё раз</button>
      `;
      finishBox.querySelector('#spellingRestart').onclick=()=>{
        index=0;correct=0;streak=0;bestStreak=0;
        finishBox.classList.add('hidden');
        section.querySelector('#spellingExercise').classList.remove('hidden');
        render();
      };
    }

    checkBtn.onclick=check;
    nextBtn.onclick=()=>{
      if(index < exercises.length-1){index++;render()} else finish();
    };
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        checked ? nextBtn.click() : check();
      }
    });

    keyboard.addEventListener('click',e=>{
      const b=e.target.closest('[data-key]');
      if(!b || input.disabled)return;
      input.value += b.dataset.key;
      input.focus();
    });
    section.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{
      if(input.disabled)return;
      const action=b.dataset.action;
      if(action==='space') input.value+=' ';
      if(action==='backspace') input.value=[...input.value].slice(0,-1).join('');
      if(action==='clear') input.value='';
      input.focus();
    });

    render();
  }

  function boot(){
    const info=sourceInfo();
    if(!info)return false;
    if(!document.getElementById('quizArea'))return false;
    insertUI(info);
    return true;
  }

  if(!boot()){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(boot() || tries>40)clearInterval(timer);
    },100);
  }
})();