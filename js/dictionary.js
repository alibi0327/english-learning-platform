(async () => {
  const profile = await bootGuard();
  if (!profile) return;
  const words = [];
  A1_DATA.lessons.forEach(l => l.vocab.forEach(v => {
    if (!words.some(x => x[0] === v[0])) words.push(v);
  }));
  const grid = document.getElementById('dictionaryGrid');
  const input = document.getElementById('dictionarySearch');

  function draw(q='') {
    const s = q.toLowerCase().trim();
    grid.innerHTML = words.filter(v => !s || v.join(' ').toLowerCase().includes(s)).map(v => `
      <div class="word-card">
        <strong>${v[0]}</strong> <span class="muted">${v[1]}</span>
        <div class="translation">${v[2]}</div>
        <div class="example-text">${v[3]}</div>
      </div>`).join('');
  }
  input.addEventListener('input', () => draw(input.value));
  draw();
})();
