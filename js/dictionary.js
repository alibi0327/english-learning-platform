(async()=>{
  const profile=await bootGuard(); if(!profile) return;

  const SOURCES=[
    ['en','A1',window.A1_DATA],
    ['en','A2',window.A2_DATA],
    ['kz','A1',window.KZ_A1_DATA],
    ['kz','A2',window.KZ_A2_DATA],
    ['kz','B1',window.KZ_B1_DATA],
    ['kz','B2',window.KZ_B2_DATA],
    ['kz','C1',window.KZ_C1_DATA]
  ].filter(x=>x[2]?.lessons);

  const words=[];
  SOURCES.forEach(([lang,level,data])=>{
    data.lessons.forEach((lesson,li)=>{
      (lesson.vocab||[]).forEach(v=>{
        let word='',pron='',translation='',example='';
        if(lang==='en'){
          word=v[0]||''; pron=v[1]||''; translation=v[2]||''; example=v[3]||'';
        }else{
          word=v[0]||''; translation=v[1]||''; example='';
        }
        words.push({lang,level,word,pron,translation,example,lesson:lesson.title,lessonKey:lesson.key});
      });
    });
  });

  const unique=new Map();
  words.forEach(w=>{
    const k=`${w.lang}|${w.level}|${w.word.toLowerCase()}|${w.translation.toLowerCase()}`;
    if(!unique.has(k)) unique.set(k,w);
  });
  const all=[...unique.values()];

  const favKey=`lp-favorites-${currentUser.id}`;
  let favorites=new Set(JSON.parse(localStorage.getItem(favKey)||'[]'));
  let favoriteOnly=false, filtered=all.slice(), flashIndex=0;

  const grid=document.getElementById('dictionaryGrid');
  const search=document.getElementById('dictionarySearch');
  const lang=document.getElementById('languageFilter');
  const level=document.getElementById('levelFilter');
  const favBtn=document.getElementById('favoriteOnlyBtn');

  const levels=[...new Set(SOURCES.map(x=>x[1]))];
  level.innerHTML='<option value="all">Все уровни</option>'+levels.map(x=>`<option value="${x}">${x}</option>`).join('');

  function id(w){return btoa(unescape(encodeURIComponent(`${w.lang}|${w.level}|${w.word}|${w.translation}`))).replace(/=/g,'')}
  function saveFav(){localStorage.setItem(favKey,JSON.stringify([...favorites]))}

  function apply(){
    const q=search.value.trim().toLowerCase();
    filtered=all.filter(w=>{
      if(lang.value!=='all'&&w.lang!==lang.value)return false;
      if(level.value!=='all'&&w.level!==level.value)return false;
      if(favoriteOnly&&!favorites.has(id(w)))return false;
      if(q&&!`${w.word} ${w.translation} ${w.lesson} ${w.example}`.toLowerCase().includes(q))return false;
      return true;
    });
    render();
  }

  function render(){
    document.getElementById('wordCount').textContent=`${filtered.length} слов`;
    grid.innerHTML=filtered.length?filtered.map(w=>{
      const k=id(w),fav=favorites.has(k);
      return `<article class="word-card">
        <div class="word-top">
          <div><span class="word-lang">${w.lang==='kz'?'🇰🇿 Қазақ тілі':'🇬🇧 English'} · ${w.level}</span><h3>${w.word}</h3>${w.pron?`<div class="pron">${w.pron}</div>`:''}</div>
          <button class="favorite-word ${fav?'active':''}" data-fav="${k}" title="Избранное">${fav?'★':'☆'}</button>
        </div>
        <div class="translation">${w.translation}</div>
        ${w.example?`<div class="word-example">${w.example}</div>`:''}
        <small>${w.lesson}</small>
      </article>`;
    }).join(''):'<div class="panel"><p class="muted">Ничего не найдено.</p></div>';

    grid.querySelectorAll('[data-fav]').forEach(btn=>btn.onclick=()=>{
      const k=btn.dataset.fav;
      favorites.has(k)?favorites.delete(k):favorites.add(k);
      saveFav(); apply();
    });
  }

  [search,lang,level].forEach(el=>el.addEventListener(el===search?'input':'change',apply));
  favBtn.onclick=()=>{favoriteOnly=!favoriteOnly;favBtn.classList.toggle('primary',favoriteOnly);favBtn.textContent=favoriteOnly?'★ Избранное':'☆ Только избранное';apply()};

  const modal=document.getElementById('flashcardModal'), answer=document.getElementById('flashAnswer');
  function showCard(){
    if(!filtered.length)return;
    flashIndex=(flashIndex+filtered.length)%filtered.length;
    const w=filtered[flashIndex];
    document.getElementById('flashMeta').textContent=`${w.lang==='kz'?'ҚАЗАҚ ТІЛІ':'ENGLISH'} · ${w.level} · ${flashIndex+1}/${filtered.length}`;
    document.getElementById('flashWord').textContent=w.word;
    answer.textContent=w.translation+(w.example?` — ${w.example}`:'');
    answer.classList.add('hidden');
    document.getElementById('showAnswer').classList.remove('hidden');
  }
  document.getElementById('flashcardBtn').onclick=()=>{if(!filtered.length)return;flashIndex=Math.floor(Math.random()*filtered.length);modal.classList.remove('hidden');showCard()};
  document.getElementById('closeFlashcards').onclick=()=>modal.classList.add('hidden');
  document.getElementById('showAnswer').onclick=()=>{answer.classList.remove('hidden');document.getElementById('showAnswer').classList.add('hidden')};
  document.getElementById('nextFlashcard').onclick=()=>{flashIndex++;showCard()};
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
  apply();
})();