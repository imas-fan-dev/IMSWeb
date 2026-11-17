(() => {
  const figures = [...document.querySelectorAll('figure')], filters = [...document.querySelectorAll('[data-filter]')];
  const search = document.querySelector('#search'), dialog = document.querySelector('dialog'), image = dialog.querySelector('img');
  let visible = figures, selected = 0, opener;
  function filter() {
    visible = figures.filter(figure => {
      figure.hidden = filters.some(input => input.value && figure.dataset[input.dataset.filter] !== input.value) || !figure.dataset.search.toLowerCase().includes(search.value.trim().toLowerCase());
      return !figure.hidden;
    });
    document.querySelector('#count').textContent = `显示 ${visible.length} / ${figures.length} 张原图`;
    document.querySelector('#empty').hidden = visible.length > 0;
  }
  filters.forEach(input => input.addEventListener('change', filter)); search.addEventListener('input', filter);
  document.querySelector('#reset').addEventListener('click', () => { filters.forEach(input => { input.value = ''; }); search.value = ''; filter(); });
  function show(index) {
    selected = index; const figure = visible[index], original = figure.querySelector('img'), link = figure.querySelector('a[download]');
    image.src = original.src; image.alt = original.alt;
    document.querySelector('#image-title').textContent = original.alt;
    document.querySelector('#image-index').textContent = `${index + 1} / ${visible.length} · ${figure.querySelector('.association').textContent}`;
    const download = document.querySelector('#image-download'); download.href = link.href; download.download = link.download;
    document.querySelector('#previous').disabled = index === 0; document.querySelector('#next').disabled = index === visible.length - 1;
    if (!dialog.open) dialog.showModal();
  }
  figures.forEach(figure => figure.querySelector('.enlarge').addEventListener('click', event => { opener = event.currentTarget; show(visible.indexOf(figure)); }));
  document.querySelector('#previous').addEventListener('click', () => { if (selected > 0) show(selected - 1); });
  document.querySelector('#next').addEventListener('click', () => { if (selected + 1 < visible.length) show(selected + 1); });
  document.querySelector('#close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus());
  dialog.addEventListener('click', event => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && selected > 0) { event.preventDefault(); show(selected - 1); }
    if (event.key === 'ArrowRight' && selected + 1 < visible.length) { event.preventDefault(); show(selected + 1); }
    if (event.key === 'Tab') {
      const stops = [...dialog.querySelectorAll('button:not(:disabled),a[href]')], first = stops[0], last = stops.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  filter();
})();
