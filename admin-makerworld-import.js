/**
 * CRIART 3D - Admin MakerWorld Import
 * Módulo para importação assistida de produtos do MakerWorld via manifesto JSON e fotos locais.
 * Visível apenas na rota /admin com usuário autenticado (auth.currentUser).
 */

import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

import { calculatePrintPrice, DEFAULT_PRINT_PRICING } from './pricing-calculator.js';
import {
  normalizeMakerWorldUrl,
  buildMakerWorldAgentRequest,
  buildSourceKey,
  validateMakerWorldManifest,
  buildMakerWorldProductPayload,
  isDuplicateMakerWorldProduct,
  identifyReplacedImagePaths,
  isStorageNotFoundError,
  validatePublishPreflight
} from './makerworld-product.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const safeName = n => String(n || 'foto')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '-');

const money = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

let currentManifest = null;
let currentLocalFiles = [];
let detectedDuplicate = null;
let isProcessing = false;

function ensureStyles() {
  if (document.querySelector('#mwImportStyles')) return;
  const s = document.createElement('style');
  s.id = 'mwImportStyles';
  s.textContent = `
    .mw-import-card {
      border: 1px solid var(--accent, #f59e0b);
      background: #101622;
      border-radius: 16px;
      padding: 22px;
      margin: 24px 0;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }
    .mw-badge {
      display: inline-block;
      background: #f59e0b;
      color: #111;
      font-weight: 800;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .mw-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 14px;
    }
    .mw-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .mw-field label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text, #f3f4f6);
    }
    .mw-field textarea {
      min-height: 90px;
      font-family: monospace;
      font-size: 0.82rem;
    }
    .mw-agent-link-box {
      border: 1px solid rgba(245, 158, 11, 0.45);
      background: rgba(245, 158, 11, 0.08);
      border-radius: 12px;
      padding: 14px;
      margin: 14px 0 4px;
    }
    .mw-link-row {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto auto;
      gap: 8px;
      align-items: center;
    }
    .mw-link-row input {
      width: 100%;
      min-width: 0;
    }
    .mw-link-status {
      margin-top: 8px;
      font-size: 0.8rem;
    }
    .mw-link-status.ok { color: #22c55e; }
    .mw-link-status.error { color: #ef4444; }
    .mw-preview-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 14px;
      margin-top: 14px;
    }
    .mw-calc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin: 10px 0;
    }
    .mw-calc-item {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .mw-calc-item .label {
      font-size: 0.72rem;
      color: var(--muted, #9ca3af);
      display: block;
    }
    .mw-calc-item .value {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text, #fff);
    }
    .mw-calc-item.highlight .value {
      color: var(--accent, #f59e0b);
      font-size: 1.1rem;
    }
    .mw-validation-list {
      list-style: none;
      padding: 0;
      margin: 10px 0 0;
      font-size: 0.82rem;
    }
    .mw-validation-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .mw-validation-item.ok { color: #22c55e; }
    .mw-validation-item.error { color: #ef4444; }
    .mw-photo-gallery {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
    }
    .mw-photo-thumb {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: #000;
    }
    .mw-photo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .mw-photo-thumb .badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      right: 4px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 0.65rem;
      text-align: center;
      padding: 2px 4px;
      border-radius: 4px;
      font-weight: 700;
    }
    .mw-photo-thumb.main {
      border: 2px solid #22c55e;
    }
    .mw-photo-thumb.main .badge {
      background: #22c55e;
      color: #111;
    }
    .mw-dup-box {
      border: 1px solid #f59e0b;
      background: rgba(245, 158, 11, 0.1);
      border-radius: 10px;
      padding: 12px 14px;
      margin: 14px 0;
    }
    .mw-dup-box h4 {
      margin: 0 0 6px;
      color: #f59e0b;
    }
    .mw-approval-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 1px solid rgba(34, 197, 94, 0.45);
      background: rgba(34, 197, 94, 0.08);
      border-radius: 10px;
      padding: 12px 14px;
      margin: 14px 0 0;
    }
    .mw-approval-box input { margin-top: 3px; }
    .mw-approval-box label { cursor: pointer; }
    .mw-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    @media (max-width: 900px) {
      .mw-link-row { grid-template-columns: 1fr 1fr; }
      .mw-link-row input { grid-column: 1 / -1; }
    }
    @media (max-width: 720px) {
      .mw-split { grid-template-columns: 1fr; }
      .mw-link-row { grid-template-columns: 1fr; }
      .mw-link-row input { grid-column: auto; }
    }
  `;
  document.head.appendChild(s);
}

async function checkDuplicate(sourceKey, sourceUrl) {
  if (!sourceKey && !sourceUrl) return null;
  try {
    const snap = await getDocs(collection(db, 'products'));
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    for (const p of products) {
      if (isDuplicateMakerWorldProduct(p, sourceKey, sourceUrl)) {
        return p;
      }
    }
  } catch (err) {
    console.error('Falha ao verificar duplicatas no Firestore:', err);
  }
  return null;
}

function renderUI() {
  if (location.pathname !== '/admin' || !auth.currentUser) {
    document.querySelector('#makerworldImportCard')?.remove();
    return;
  }

  ensureStyles();

  // Procurar o container adequado no painel administrativo
  const host = document.querySelector('.criart-admin-panel[data-panel="products"]') ||
               document.querySelector('.admin-grid') ||
               document.querySelector('#app .card')?.parentElement;

  if (!host) return;

  let card = document.querySelector('#makerworldImportCard');
  if (card) return; // Já montado

  card = document.createElement('section');
  card.id = 'makerworldImportCard';
  card.className = 'card mw-import-card';
  card.innerHTML = `
    <div>
      <span class="mw-badge">MakerWorld ➔ Catálogo</span>
      <h3 style="margin:4px 0 6px;">Importar modelo do MakerWorld</h3>
      <p class="muted" style="margin:0 0 12px; font-size:0.88rem;">
        Carregue o manifesto JSON (com especificações de peso, tempo e perfil) e adicione as fotos locais para precificar e publicar no catálogo com 1 clique.
      </p>
    </div>

    <div class="mw-agent-link-box">
      <div class="mw-field" style="margin-bottom:0;">
        <label for="mwSourceUrlInput">Link do anúncio no MakerWorld / Bambu Lab</label>
        <div class="mw-link-row">
          <input type="url" id="mwSourceUrlInput" inputmode="url" autocomplete="off"
                 placeholder="https://makerworld.com/en/models/123456#profileId-789012">
          <button type="button" class="btn secondary" id="mwUseLinkBtn" disabled>Usar no cadastro</button>
          <button type="button" class="btn secondary" id="mwSendAgentBtn" disabled>Enviar ao agente</button>
          <button type="button" class="btn secondary" id="mwOpenLinkBtn" disabled>Abrir anúncio</button>
        </div>
        <small class="muted">Cole o link com o perfil selecionado. O agente usa esse endereço para consultar o anúncio, preparar fotos locais e redigir a descrição.</small>
        <div id="mwLinkStatus" class="mw-link-status"></div>
      </div>
    </div>

    <div class="mw-split">
      <div>
        <div class="mw-field">
          <label>1. Carregar arquivo JSON (.json)</label>
          <input type="file" id="mwFileInput" accept=".json,application/json">
        </div>
        <div class="mw-field">
          <label>Ou colar conteúdo JSON:</label>
          <textarea id="mwJsonArea" placeholder='{\n  "nome": "Suporte Articulado",\n  "descricao": "Suporte articulado para celular...",\n  "sourceUrl": "https://makerworld.com/en/models/...",\n  "profileName": "0.20mm Standard",\n  "filamentGrams": 45,\n  "printTimeMinutes": 110\n}'></textarea>
        </div>
      </div>
      <div>
        <div class="mw-field">
          <label>2. Fotos locais do produto *</label>
          <input type="file" id="mwPhotosInput" accept="image/*" multiple>
          <small class="muted">Selecione uma ou mais fotos do disco. A primeira foto será a capa do anúncio. Imagens externas do MakerWorld não são aceitas como URL direta.</small>
        </div>
        <div id="mwPhotosPreview" class="mw-photo-gallery"></div>
      </div>
    </div>

    <div id="mwStatusArea"></div>

    <div id="mwDupNotice" style="display:none;" class="mw-dup-box"></div>

    <div class="mw-approval-box">
      <input type="checkbox" id="mwApprovalCheckbox">
      <label for="mwApprovalCheckbox">
        <strong>Aprovação confirmada por Dr Mayckon</strong><br>
        <small class="muted">Marque somente depois da aprovação explícita do rascunho atual no canal do agente. Qualquer alteração no manifesto ou nas fotos desmarca esta confirmação.</small>
      </label>
    </div>

    <div class="mw-actions">
      <button type="button" class="btn" id="mwPublishBtn" disabled>Publicar no catálogo</button>
      <button type="button" class="btn secondary" id="mwUpdateBtn" style="display:none;">Atualizar produto existente</button>
      <button type="button" class="btn secondary" id="mwResetBtn">Limpar formulário</button>
    </div>
  `;

  // Insere no topo ou antes da lista de produtos
  const heading = host.querySelector('h2');
  if (heading) {
    host.insertBefore(card, heading);
  } else {
    host.appendChild(card);
  }

  bindCardEvents(card);
}

function bindCardEvents(card) {
  const sourceUrlInput = card.querySelector('#mwSourceUrlInput');
  const useLinkBtn = card.querySelector('#mwUseLinkBtn');
  const sendAgentBtn = card.querySelector('#mwSendAgentBtn');
  const openLinkBtn = card.querySelector('#mwOpenLinkBtn');
  const linkStatus = card.querySelector('#mwLinkStatus');
  const fileInput = card.querySelector('#mwFileInput');
  const jsonArea = card.querySelector('#mwJsonArea');
  const photosInput = card.querySelector('#mwPhotosInput');
  const approvalCheckbox = card.querySelector('#mwApprovalCheckbox');
  const publishBtn = card.querySelector('#mwPublishBtn');
  const updateBtn = card.querySelector('#mwUpdateBtn');
  const resetBtn = card.querySelector('#mwResetBtn');

  const invalidateApproval = () => {
    if (approvalCheckbox) approvalCheckbox.checked = false;
  };

  const refreshLinkState = () => {
    const request = buildMakerWorldAgentRequest(sourceUrlInput.value);
    const valid = request.isValid;
    useLinkBtn.disabled = !valid;
    sendAgentBtn.disabled = !valid;
    openLinkBtn.disabled = !valid;
    linkStatus.className = `mw-link-status ${valid ? 'ok' : (sourceUrlInput.value.trim() ? 'error' : '')}`;
    linkStatus.textContent = valid
      ? `✓ Modelo ${request.normalized.modelId}${request.normalized.profileId ? ` · perfil ${request.normalized.profileId}` : ' · perfil ainda precisa ser identificado'}`
      : (sourceUrlInput.value.trim() ? `✗ ${request.error}` : '');
    return request;
  };

  sourceUrlInput.addEventListener('input', () => {
    invalidateApproval();
    refreshLinkState();
  });

  useLinkBtn.addEventListener('click', async () => {
    invalidateApproval();
    const request = refreshLinkState();
    if (!request.isValid) return;
    let manifest = {};
    const existing = jsonArea.value.trim();
    if (existing) {
      try { manifest = JSON.parse(existing); } catch { manifest = {}; }
    }
    manifest.sourceUrl = request.normalized.canonicalUrl;
    if (request.normalized.profileId) manifest.profileId = request.normalized.profileId;
    jsonArea.value = JSON.stringify(manifest, null, 2);
    await processManifestInput(jsonArea.value);
  });

  sendAgentBtn.addEventListener('click', async () => {
    const request = refreshLinkState();
    if (!request.isValid) return;

    const shareTitle = 'CRIART 3D — novo anúncio';
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: shareTitle, text: request.requestText });
        linkStatus.className = 'mw-link-status ok';
        linkStatus.textContent = '✓ Solicitação aberta. Envie para o canal do agente; ele preparará a prévia para aprovação.';
        return;
      }

      const text = 'CRIART 3D — processe este anúncio e solicite minha aprovação antes de publicar.';
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(request.normalized.originalUrl || request.normalized.canonicalUrl)}&text=${encodeURIComponent(text)}`;
      const opened = window.open(shareUrl, '_blank', 'noopener,noreferrer');
      if (opened) {
        linkStatus.className = 'mw-link-status ok';
        linkStatus.textContent = '✓ Telegram aberto. Envie a solicitação ao canal do agente.';
        return;
      }

      await navigator.clipboard.writeText(request.requestText);
      linkStatus.className = 'mw-link-status ok';
      linkStatus.textContent = '✓ Pedido copiado. Cole no canal do agente para iniciar.';
    } catch (err) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(request.requestText);
        linkStatus.className = 'mw-link-status ok';
        linkStatus.textContent = '✓ Pedido copiado. Cole no canal do agente para iniciar.';
      } catch {
        linkStatus.className = 'mw-link-status error';
        linkStatus.textContent = 'Não foi possível compartilhar. Copie o link e envie manualmente ao agente.';
      }
    }
  });

  openLinkBtn.addEventListener('click', () => {
    const request = refreshLinkState();
    if (request.isValid) window.open(request.normalized.canonicalUrl, '_blank', 'noopener,noreferrer');
  });

  fileInput.addEventListener('change', async (e) => {
    invalidateApproval();
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      jsonArea.value = text;
      await processManifestInput(text);
      try {
        const manifest = JSON.parse(text);
        if (manifest.sourceUrl) {
          sourceUrlInput.value = manifest.sourceUrl;
          refreshLinkState();
        }
      } catch {}
    } catch (err) {
      alert('Erro ao ler arquivo JSON: ' + err.message);
    }
  });

  jsonArea.addEventListener('input', () => {
    invalidateApproval();
    const text = jsonArea.value.trim();
    if (!text) {
      currentManifest = null;
      renderStatus();
      return;
    }
    processManifestInput(text);
  });

  photosInput.addEventListener('change', (e) => {
    invalidateApproval();
    currentLocalFiles = [...(e.target.files || [])];
    renderPhotosPreview();
    validateAndRefreshState();
  });

  approvalCheckbox.addEventListener('change', () => validateAndRefreshState());

  publishBtn.addEventListener('click', () => handlePublishOrUpdate(false));
  updateBtn.addEventListener('click', () => handlePublishOrUpdate(true));
  resetBtn.addEventListener('click', resetForm);
}

function renderPhotosPreview() {
  const box = document.querySelector('#mwPhotosPreview');
  if (!box) return;
  box.innerHTML = '';
  if (!currentLocalFiles.length) {
    box.innerHTML = '<span class="muted" style="font-size:0.8rem;">Nenhuma foto selecionada.</span>';
    return;
  }
  currentLocalFiles.forEach((file, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `mw-photo-thumb ${idx === 0 ? 'main' : ''}`;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = idx === 0 ? '★ Capa' : `Foto ${idx + 1}`;
    thumb.append(img, badge);
    box.appendChild(thumb);
  });
}

async function processManifestInput(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    currentManifest = null;
    renderStatus({ jsonParseError: 'JSON inválido: ' + err.message });
    return;
  }

  currentManifest = parsed;
  await validateAndRefreshState();
}

async function validateAndRefreshState() {
  const card = document.querySelector('#makerworldImportCard');
  if (!card) return;

  const publishBtn = card.querySelector('#mwPublishBtn');
  const updateBtn = card.querySelector('#mwUpdateBtn');
  const dupNotice = card.querySelector('#mwDupNotice');
  const approvalCheckbox = card.querySelector('#mwApprovalCheckbox');

  if (!currentManifest) {
    renderStatus();
    publishBtn.disabled = true;
    updateBtn.style.display = 'none';
    dupNotice.style.display = 'none';
    return;
  }

  // Validação puramente estrutural do manifesto
  const validation = validateMakerWorldManifest(currentManifest, {
    requireImages: false,
  });

  let pricing = null;
  if (validation.isValid) {
    try {
      const inputs = {
        ...DEFAULT_PRINT_PRICING,
        ...(currentManifest.pricingInputs || {}),
        gramas: validation.normalized.filamentGrams,
        printTimeMinutes: validation.normalized.printTimeMinutes,
      };
      pricing = calculatePrintPrice(inputs);
    } catch (e) {
      console.warn('Erro ao calcular preço:', e);
    }
  }

  // Checar duplicatas no catálogo
  let dup = null;
  if (validation.isValid && validation.normalized.sourceKey) {
    dup = await checkDuplicate(validation.normalized.sourceKey, validation.normalized.sourceUrl);
  }
  detectedDuplicate = dup;

  // Requisitos estritos para poder publicar:
  // - nome, descricao, sourceUrl valido, perfil identificavel, gramas>0, tempo>0, preco>0
  // - ao menos uma foto (se novo: precisa de fotos locais; se atualização: fotos locais ou existentes)
  const hasImages = currentLocalFiles.length > 0 || (dup && Array.isArray(dup.imageUrls) && dup.imageUrls.length > 0);
  const approvalConfirmed = approvalCheckbox?.checked === true;
  const canPublish = validation.isValid && pricing && pricing.final > 0 && hasImages && approvalConfirmed;

  renderStatus({
    manifestValidation: validation,
    pricing,
    duplicate: dup,
    hasImages,
    approvalConfirmed,
  });

  if (dup) {
    dupNotice.style.display = 'block';
    dupNotice.innerHTML = `
      <h4>⚠️ Modelo já cadastrado no catálogo!</h4>
      <p style="margin:4px 0 8px; font-size:0.88rem;">
        Encontrado produto existente: <strong>${esc(dup.nome)}</strong> (ID: <code>${dup.id}</code>).
        <br>Preço atual: <strong>${money(dup.preco)}</strong> | Fotos cadastradas: <strong>${dup.imageUrls?.length || 0}</strong>.
      </p>
      <p class="muted" style="margin:0; font-size:0.8rem;">
        ${currentLocalFiles.length > 0
          ? 'Novas fotos foram selecionadas e substituirão as antigas.'
          : 'Nenhuma foto nova selecionada: as fotos cadastradas atualmente serão mantidas intactas.'}
      </p>
    `;
    publishBtn.style.display = 'none';
    updateBtn.style.display = 'inline-block';
    updateBtn.disabled = !canPublish || isProcessing;
  } else {
    dupNotice.style.display = 'none';
    publishBtn.style.display = 'inline-block';
    updateBtn.style.display = 'none';
    publishBtn.disabled = !canPublish || isProcessing;
  }
}

function renderStatus(details = {}) {
  const box = document.querySelector('#mwStatusArea');
  if (!box) return;

  if (details.jsonParseError) {
    box.innerHTML = `<div class="mw-preview-box" style="border-color:#ef4444; color:#ef4444;">${esc(details.jsonParseError)}</div>`;
    return;
  }

  if (!currentManifest) {
    box.innerHTML = '';
    return;
  }

  const { manifestValidation, pricing, hasImages, approvalConfirmed } = details;
  const norm = manifestValidation?.normalized;

  let calcHtml = '';
  if (pricing) {
    calcHtml = `
      <div class="mw-calc-grid">
        <div class="mw-calc-item">
          <span class="label">Material</span>
          <span class="value">${money(pricing.material)}</span>
        </div>
        <div class="mw-calc-item">
          <span class="label">Operação</span>
          <span class="value">${money(pricing.operacao)}</span>
        </div>
        <div class="mw-calc-item">
          <span class="label">Risco (${pricing.inputs.riscoFalhaPercent}%)</span>
          <span class="value">${money(pricing.risco)}</span>
        </div>
        <div class="mw-calc-item">
          <span class="label">Custo Total</span>
          <span class="value">${money(pricing.custo)}</span>
        </div>
        <div class="mw-calc-item highlight">
          <span class="label">Preço Sugerido</span>
          <span class="value">${money(pricing.final)}</span>
        </div>
      </div>
    `;
  }

  const validations = [];
  if (norm?.nome) validations.push({ ok: true, msg: `Nome: "${norm.nome}"` });
  else validations.push({ ok: false, msg: 'Nome ausente ou inválido' });

  if (norm?.descricao) validations.push({ ok: true, msg: 'Descrição presente' });
  else validations.push({ ok: false, msg: 'Descrição ausente ou muito curta' });

  if (norm?.sourceUrl) validations.push({ ok: true, msg: `URL MakerWorld: ${norm.canonicalUrl || norm.sourceUrl}` });
  else validations.push({ ok: false, msg: 'URL MakerWorld inválida' });

  if (norm?.profileName || norm?.profileId) validations.push({ ok: true, msg: `Perfil identificado: ${norm.profileName || norm.profileId}` });
  else validations.push({ ok: false, msg: 'Perfil de impressão não identificado' });

  if (norm?.filamentGrams > 0) validations.push({ ok: true, msg: `Consumo: ${norm.filamentGrams}g` });
  else validations.push({ ok: false, msg: 'Gramas de filamento ausentes ou zero' });

  if (norm?.printTimeMinutes > 0) {
    const h = Math.floor(norm.printTimeMinutes / 60);
    const m = Math.round(norm.printTimeMinutes % 60);
    validations.push({ ok: true, msg: `Tempo de impressão: ${h}h ${m}min (${norm.printTimeMinutes} min)` });
  } else {
    validations.push({ ok: false, msg: 'Tempo de impressão ausente ou zero' });
  }

  if (hasImages) {
    validations.push({ ok: true, msg: `${currentLocalFiles.length ? `${currentLocalFiles.length} foto(s) local(is) selecionada(s)` : 'Fotos existentes do produto preservadas'}` });
  } else {
    validations.push({ ok: false, msg: 'Nenhuma foto selecionada. Ao menos 1 foto é obrigatória para publicar.' });
  }

  validations.push({
    ok: approvalConfirmed === true,
    msg: approvalConfirmed === true
      ? 'Aprovação explícita confirmada para este rascunho'
      : 'Aguardando aprovação explícita de Dr Mayckon',
  });

  box.innerHTML = `
    <div class="mw-preview-box">
      <h4 style="margin:0 0 8px;">Validação e Cálculo Automático</h4>
      ${calcHtml}
      <ul class="mw-validation-list">
        ${validations.map(v => `<li class="mw-validation-item ${v.ok ? 'ok' : 'error'}">
          <span>${v.ok ? '✓' : '✗'}</span> ${esc(v.msg)}
        </li>`).join('')}
      </ul>
    </div>
  `;
}

async function cleanupUploadedStorage(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  for (const p of paths) {
    if (typeof p === 'string' && p.trim()) {
      try {
        await deleteObject(ref(storage, p));
      } catch (err) {
        if (!isStorageNotFoundError(err)) {
          console.warn('Erro ao remover arquivo temporário do Storage:', p, err);
        }
      }
    }
  }
}

async function handlePublishOrUpdate(isUpdate) {
  if (isProcessing) return;
  isProcessing = true;

  const card = document.querySelector('#makerworldImportCard');
  const publishBtn = card?.querySelector('#mwPublishBtn');
  const updateBtn = card?.querySelector('#mwUpdateBtn');
  const approvalCheckbox = card?.querySelector('#mwApprovalCheckbox');
  const statusBox = card?.querySelector('#mwStatusArea');

  if (publishBtn) publishBtn.disabled = true;
  if (updateBtn) updateBtn.disabled = true;

  const newlyUploadedPaths = [];

  try {
    // 1. REVALIDAÇÃO IMEDIATA NO CLIQUE:
    // A) auth.currentUser
    if (!auth.currentUser || !auth.currentUser.uid) {
      throw new Error('Sessão expirada ou não autenticado. Faça login no painel administrativo.');
    }

    // B) Manifesto
    if (!currentManifest) {
      throw new Error('Nenhum manifesto MakerWorld carregado.');
    }

    const manifestValidation = validateMakerWorldManifest(currentManifest, { requireImages: false });
    if (!manifestValidation.isValid) {
      throw new Error('Manifesto MakerWorld inválido: ' + manifestValidation.errors.join('; '));
    }
    const norm = manifestValidation.normalized;

    // C) Duplicata em tempo real (consulta Firestore imediatamente antes de qualquer upload ou write)
    const freshDuplicate = await checkDuplicate(norm.sourceKey, norm.canonicalUrl || norm.sourceUrl);

    // Validação de corrida e duplicata
    if (!isUpdate && freshDuplicate) {
      detectedDuplicate = freshDuplicate;
      await validateAndRefreshState();
      throw new Error(`Modelo já cadastrado no catálogo (ID: ${freshDuplicate.id}). Use o botão "Atualizar produto existente" para evitar duplicata.`);
    }

    if (isUpdate && !freshDuplicate && !detectedDuplicate) {
      throw new Error('Produto para atualização não foi localizado no catálogo.');
    }

    const targetProduct = isUpdate ? (freshDuplicate || detectedDuplicate) : null;

    // D) Validação de imagens imediatamente antes do upload/write
    const existingImages = targetProduct && Array.isArray(targetProduct.imageUrls) ? targetProduct.imageUrls : [];
    const hasLocalFiles = currentLocalFiles.length > 0;
    const hasExistingImages = existingImages.length > 0;

    const preflight = validatePublishPreflight({
      currentUser: auth.currentUser,
      manifest: currentManifest,
      duplicate: targetProduct,
      localFilesCount: currentLocalFiles.length,
      isUpdate,
      existingImagesCount: existingImages.length,
      approvalConfirmed: approvalCheckbox?.checked === true,
    });
    if (!preflight.isValid) {
      throw new Error(preflight.error);
    }

    // 2. Upload de novas fotos com rollback de parciais
    let imageUrls = [];
    let imagePaths = [];

    if (hasLocalFiles) {
      if (statusBox) {
        statusBox.innerHTML = `<div class="mw-preview-box" style="color:var(--accent);">Enviando ${currentLocalFiles.length} foto(s) para o Storage (products/)...</div>`;
      }
      for (let i = 0; i < currentLocalFiles.length; i++) {
        const file = currentLocalFiles[i];
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName(file.name)}`;
        const storageRef = ref(storage, path);
        try {
          await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
          const url = await getDownloadURL(storageRef);
          imageUrls.push(url);
          imagePaths.push(path);
          newlyUploadedPaths.push(path);
        } catch (uploadErr) {
          // Se upload parcial falhar antes do Firestore, limpe apenas os novos objetos já enviados para evitar órfãos
          await cleanupUploadedStorage(newlyUploadedPaths);
          throw new Error(`Falha no upload da foto "${file.name}": ${uploadErr.message || uploadErr}`);
        }
      }
    } else if (isUpdate && targetProduct) {
      // Reutiliza fotos existentes sem deletar
      imageUrls = [...existingImages];
      imagePaths = [...(targetProduct.imagePaths || [])];
    }

    if (imageUrls.length === 0) {
      throw new Error('Nenhuma foto disponível para o produto.');
    }

    // Identifica quais imagePaths antigos foram substituídos por novas fotos
    const oldOriginalPaths = targetProduct && Array.isArray(targetProduct.imagePaths) ? targetProduct.imagePaths : [];
    const replacedOldPaths = (isUpdate && hasLocalFiles)
      ? identifyReplacedImagePaths(oldOriginalPaths, imagePaths)
      : [];

    // 3. Monta payload
    const payload = buildMakerWorldProductPayload(currentManifest, {
      imageUrls,
      imagePaths,
      existingProduct: targetProduct,
      requireImages: true,
    });

    if (statusBox) {
      statusBox.innerHTML = `<div class="mw-preview-box" style="color:var(--accent);">Gravando produto no Firestore...</div>`;
    }

    // 4. Gravação no Firestore
    try {
      if (isUpdate && targetProduct) {
        await updateDoc(doc(db, 'products', targetProduct.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'products'), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (writeErr) {
      // Se updateDoc falhar, NÃO apague antigos!
      // Limpe apenas os novos objetos já enviados para evitar órfãos:
      if (newlyUploadedPaths.length > 0) {
        await cleanupUploadedStorage(newlyUploadedPaths);
      }
      throw writeErr;
    }

    // 5. Depois de updateDoc bem-sucedido remova do Storage somente os imagePaths antigos substituídos
    if (isUpdate && replacedOldPaths.length > 0) {
      for (const oldPath of replacedOldPaths) {
        try {
          await deleteObject(ref(storage, oldPath));
        } catch (delErr) {
          if (!isStorageNotFoundError(delErr)) {
            console.warn(`Não foi possível remover imagem antiga substituída (${oldPath}):`, delErr);
          }
        }
      }
    }

    if (isUpdate) {
      alert(`Produto "${payload.nome}" atualizado com sucesso no catálogo!`);
    } else {
      alert(`Produto "${payload.nome}" cadastrado com sucesso no catálogo!`);
    }

    resetForm();
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    if (newlyUploadedPaths.length > 0) {
      await cleanupUploadedStorage(newlyUploadedPaths);
    }
    console.error('Falha na publicação/atualização do produto:', err);
    alert('Erro ao publicar produto: ' + (err?.message || err));
  } finally {
    isProcessing = false;
    if (publishBtn) publishBtn.disabled = false;
    if (updateBtn) updateBtn.disabled = false;
  }
}

function resetForm() {
  currentManifest = null;
  currentLocalFiles = [];
  detectedDuplicate = null;
  const card = document.querySelector('#makerworldImportCard');
  if (card) {
    const sourceUrlInput = card.querySelector('#mwSourceUrlInput');
    const linkStatus = card.querySelector('#mwLinkStatus');
    const useLinkBtn = card.querySelector('#mwUseLinkBtn');
    const sendAgentBtn = card.querySelector('#mwSendAgentBtn');
    const openLinkBtn = card.querySelector('#mwOpenLinkBtn');
    const fileInput = card.querySelector('#mwFileInput');
    const jsonArea = card.querySelector('#mwJsonArea');
    const photosInput = card.querySelector('#mwPhotosInput');
    const approvalCheckbox = card.querySelector('#mwApprovalCheckbox');
    if (sourceUrlInput) sourceUrlInput.value = '';
    if (linkStatus) {
      linkStatus.textContent = '';
      linkStatus.className = 'mw-link-status';
    }
    if (useLinkBtn) useLinkBtn.disabled = true;
    if (sendAgentBtn) sendAgentBtn.disabled = true;
    if (openLinkBtn) openLinkBtn.disabled = true;
    if (fileInput) fileInput.value = '';
    if (jsonArea) jsonArea.value = '';
    if (photosInput) photosInput.value = '';
    if (approvalCheckbox) approvalCheckbox.checked = false;
  }
  renderPhotosPreview();
  renderStatus();
  validateAndRefreshState();
}

// Observer para verificar quando o usuário estiver no admin e o elemento estiver pronto
function scheduleCheck() {
  if (location.pathname === '/admin' && auth.currentUser) {
    renderUI();
  } else {
    document.querySelector('#makerworldImportCard')?.remove();
  }
}

onAuthStateChanged(auth, () => {
  scheduleCheck();
  setTimeout(scheduleCheck, 200);
});

const observer = new MutationObserver(() => scheduleCheck());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('popstate', scheduleCheck);
setTimeout(scheduleCheck, 400);
