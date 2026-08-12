import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const app = getApp();
const db = getFirestore(app);

function parsePhotoUrls(raw = '') {
  return String(raw)
    .split('|')
    .map(v => v.trim())
    .filter(Boolean)
    .filter(url => /^https?:\/\//i.test(url));
}

function enhanceBulkImporter() {
  if (location.pathname !== '/admin') return;

  const textarea = document.querySelector('#bulkText');
  if (!textarea || textarea.dataset.photoImportReady === '1') return;

  textarea.dataset.photoImportReady = '1';
  textarea.placeholder = 'Suporte celular;Suporte de mesa;29,90;https://site.com/foto.jpg\nOrganizador;Organizador de cabos;39,90;https://site.com/foto1.jpg|https://site.com/foto2.jpg';

  const card = textarea.closest('.card');
  if (!card) return;

  const help = card.querySelector('p.muted');
  if (help) {
    help.innerHTML = 'Cole uma linha por produto no formato: <strong>Nome;Descrição;Preço;Foto(s)</strong>.<br><small>Use o endereço direto da imagem. Para várias fotos do mesmo produto, separe as URLs com <strong>|</strong>. A primeira foto será a principal.</small>';
  }

  const oldBtn = card.querySelector('#bulkBtn');
  if (!oldBtn) return;

  // Substitui o botão para remover o evento antigo do app.js.
  const btn = oldBtn.cloneNode(true);
  oldBtn.replaceWith(btn);

  const status = document.createElement('div');
  status.id = 'bulkPhotoMsg';
  status.className = 'muted';
  status.style.marginTop = '12px';
  btn.closest('.actions')?.after(status);

  btn.addEventListener('click', async () => {
    const lines = textarea.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) {
      status.textContent = 'Cole pelo menos um produto para importar.';
      return;
    }

    btn.disabled = true;
    let imported = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < lines.length; i++) {
        status.textContent = `Importando ${i + 1} de ${lines.length}...`;

        const [nomeRaw, descricaoRaw, precoRaw, fotosRaw = ''] = lines[i].split(';');
        const nome = (nomeRaw || '').trim();
        if (!nome) {
          skipped++;
          continue;
        }

        const preco = Number(String(precoRaw || '0').trim().replace(',', '.'));
        const imageUrls = parsePhotoUrls(fotosRaw);

        await addDoc(collection(db, 'products'), {
          nome,
          descricao: (descricaoRaw || '').trim(),
          preco: Number.isFinite(preco) ? preco : 0,
          ativo: true,
          imageUrls,
          imagePaths: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        imported++;
      }

      status.textContent = `${imported} produto(s) importado(s) com sucesso${skipped ? `; ${skipped} linha(s) ignorada(s)` : ''}. Atualizando...`;
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      console.error(error);
      status.textContent = 'Erro durante a importação: ' + (error?.message || error);
      btn.disabled = false;
    }
  });
}

let scheduled = false;
function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    enhanceBulkImporter();
  }, 80);
}

new MutationObserver(scheduleEnhance).observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});

setTimeout(enhanceBulkImporter, 700);
