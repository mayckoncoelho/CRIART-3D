// Melhora o campo de fotos do cadastro: permite selecionar várias de uma vez
// ou adicionar novas seleções em etapas, mantendo todas no mesmo produto.
(() => {
  const fileKey = f => `${f.name}|${f.size}|${f.lastModified}`;
  const stored = new WeakMap();

  function enhance(input) {
    if (!input || input.dataset.multiPhotoEnhanced) return;
    input.dataset.multiPhotoEnhanced = '1';
    input.multiple = true;

    const field = input.closest('.field') || input.parentElement;
    if (!field) return;

    let info = document.createElement('div');
    info.className = 'muted multi-photo-info';
    info.textContent = 'Você pode escolher várias fotos de uma vez ou clicar novamente para adicionar mais.';
    field.appendChild(info);

    let list = document.createElement('div');
    list.className = 'multi-photo-list';
    field.appendChild(list);

    stored.set(input, []);

    input.addEventListener('change', () => {
      const current = stored.get(input) || [];
      const incoming = [...input.files];
      const merged = [...current];
      const seen = new Set(current.map(fileKey));
      for (const f of incoming) {
        if (!seen.has(fileKey(f))) {
          merged.push(f);
          seen.add(fileKey(f));
        }
      }

      const dt = new DataTransfer();
      merged.forEach(f => dt.items.add(f));
      input.files = dt.files;
      stored.set(input, merged);

      const preview = document.querySelector('#pPreview');
      if (preview) preview.innerHTML = '';
      list.innerHTML = '';

      merged.forEach((f, index) => {
        const wrap = document.createElement('div');
        wrap.className = 'multi-photo-item';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = `Foto ${index + 1}`;
        const label = document.createElement('span');
        label.textContent = index === 0 ? 'Principal' : `Foto ${index + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'photo-remove';
        remove.textContent = '×';
        remove.title = 'Remover esta foto';
        remove.addEventListener('click', () => {
          const next = (stored.get(input) || []).filter((_, i) => i !== index);
          const nextDt = new DataTransfer();
          next.forEach(file => nextDt.items.add(file));
          input.files = nextDt.files;
          stored.set(input, next);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        wrap.append(img, label, remove);
        list.appendChild(wrap);
      });

      info.textContent = merged.length
        ? `${merged.length} foto(s) selecionada(s). A primeira será a foto principal. Você pode clicar novamente em “Escolher arquivos” para adicionar mais.`
        : 'Você pode escolher várias fotos de uma vez ou clicar novamente para adicionar mais.';
    }, true);
  }

  function scan() { enhance(document.querySelector('#pFotos')); }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
