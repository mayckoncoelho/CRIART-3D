import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const safeName = n => String(n || 'arquivo')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '-');

function ensureStyles(){
  if(document.querySelector('#adminDashboardStyles')) return;
  const s = document.createElement('style');
  s.id = 'adminDashboardStyles';
  s.textContent = `
    .criart-admin-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
    .criart-admin-tab{border:1px solid var(--line);background:var(--card);color:var(--text);padding:12px 18px;border-radius:12px;font-weight:800;cursor:pointer}
    .criart-admin-tab.active{background:var(--accent);color:#111;border-color:var(--accent)}
    .criart-admin-panel{display:none}
    .criart-admin-panel.active{display:block}
    .criart-admin-panel>.card:first-child{margin-bottom:26px}
    .criart-admin-panel h2{margin-top:30px}
    .criart-inline-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .criart-mini-btn{border:1px solid var(--line);background:#0f1216;color:var(--text);padding:8px 11px;border-radius:9px;font-weight:750;cursor:pointer}
    .criart-mini-btn.primary{background:var(--accent);color:#111;border-color:var(--accent)}
    .criart-status{display:inline-block;margin-left:6px;padding:4px 8px;border-radius:999px;background:#222831;color:var(--muted);font-size:.78rem}
    .criart-editor-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}
    .criart-editor-modal{width:min(100%,680px);background:#111827;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
    .criart-editor-head{display:flex;justify-content:space-between;gap:14px;align-items:start;margin-bottom:18px}
    .criart-editor-head h2{margin:0}
    .criart-editor-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
    .criart-admin-panel .admin-grid{display:block}
    @media(max-width:720px){.criart-admin-tabs{display:grid;grid-template-columns:1fr 1fr}.criart-admin-tab{width:100%}.criart-editor-overlay{padding:10px}.criart-editor-modal{padding:16px}}
  `;
  document.head.appendChild(s);
}

async function getCollection(name){
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

function nextElement(el){ return el?.nextElementSibling || null; }

function makePanel(name){
  const p = document.createElement('section');
  p.className = 'criart-admin-panel';
  p.dataset.panel = name;
  return p;
}

function moveIf(node, target){ if(node && target) target.appendChild(node); }

function findHeading(root, text){
  return [...root.querySelectorAll('h2')].find(h => h.textContent.trim().toLowerCase() === text.toLowerCase());
}

function openModal(html){
  const overlay = document.createElement('div');
  overlay.className = 'criart-editor-overlay';
  overlay.innerHTML = `<section class="criart-editor-modal">${html}</section>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  overlay.querySelectorAll('[data-close-modal]').forEach(b => b.onclick = close);
  return { overlay, close };
}

function editCoupon(coupon){
  const {overlay, close} = openModal(`
    <div class="criart-editor-head"><div><h2>Editar cupom</h2><p class="muted">Altere código, desconto e status.</p></div><button class="btn secondary" data-close-modal>Fechar</button></div>
    <div class="field"><label>Código</label><input id="editCouponCode" value="${String(coupon.codigo||'').replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>Desconto (%)</label><input id="editCouponValue" type="number" min="0" max="100" value="${Number(coupon.valor)||0}"></div>
    <label class="check"><input id="editCouponActive" type="checkbox" ${coupon.ativo===false?'':'checked'}> Cupom ativo</label>
    <div id="editCouponMsg" class="muted"></div>
    <div class="criart-editor-actions"><button class="btn" id="saveCouponEdit">Salvar alterações</button><button class="btn secondary" data-close-modal>Cancelar</button></div>
  `);
  overlay.querySelector('#saveCouponEdit').onclick = async () => {
    const code = overlay.querySelector('#editCouponCode').value.trim().toUpperCase();
    const value = Number(overlay.querySelector('#editCouponValue').value);
    const msg = overlay.querySelector('#editCouponMsg');
    if(!code || !Number.isFinite(value)){ msg.textContent = 'Informe código e desconto válidos.'; return; }
    try{
      msg.textContent = 'Salvando...';
      await updateDoc(doc(db,'coupons',coupon.id), { codigo:code, valor:value, ativo:overlay.querySelector('#editCouponActive').checked, updatedAt:serverTimestamp() });
      close(); location.reload();
    }catch(e){ msg.textContent = 'Erro ao salvar: ' + (e?.message || e); }
  };
}

function editBanner(banner){
  const {overlay, close} = openModal(`
    <div class="criart-editor-head"><div><h2>Editar banner</h2><p class="muted">Altere conteúdo, imagem e status.</p></div><button class="btn secondary" data-close-modal>Fechar</button></div>
    <div class="field"><label>Título</label><input id="editBannerTitle" value="${String(banner.titulo||'').replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>Texto</label><textarea id="editBannerText"></textarea></div>
    <div class="field"><label>Substituir imagem</label><input id="editBannerImage" type="file" accept="image/*"><small class="muted">Deixe vazio para manter a imagem atual.</small></div>
    <label class="check"><input id="editBannerActive" type="checkbox" ${banner.ativo===false?'':'checked'}> Banner ativo</label>
    <div id="editBannerMsg" class="muted"></div>
    <div class="criart-editor-actions"><button class="btn" id="saveBannerEdit">Salvar alterações</button><button class="btn secondary" data-close-modal>Cancelar</button></div>
  `);
  overlay.querySelector('#editBannerText').value = banner.texto || '';
  overlay.querySelector('#saveBannerEdit').onclick = async () => {
    const msg = overlay.querySelector('#editBannerMsg');
    const file = overlay.querySelector('#editBannerImage').files?.[0];
    try{
      msg.textContent = 'Salvando...';
      let imageUrl = banner.imageUrl || '';
      let imagePath = banner.imagePath || '';
      if(file){
        const newPath = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName(file.name)}`;
        const storageRef = ref(storage,newPath);
        await uploadBytes(storageRef,file,{contentType:file.type});
        imageUrl = await getDownloadURL(storageRef);
        if(imagePath){ try{ await deleteObject(ref(storage,imagePath)); }catch{} }
        imagePath = newPath;
      }
      await updateDoc(doc(db,'banners',banner.id), {
        titulo:overlay.querySelector('#editBannerTitle').value.trim(),
        texto:overlay.querySelector('#editBannerText').value.trim(),
        ativo:overlay.querySelector('#editBannerActive').checked,
        imageUrl,imagePath,updatedAt:serverTimestamp()
      });
      close(); location.reload();
    }catch(e){ msg.textContent = 'Erro ao salvar: ' + (e?.message || e); }
  };
}

async function enhanceCouponRows(panel){
  let coupons=[];
  try{ coupons = await getCollection('coupons'); }catch(e){ console.error(e); return; }
  panel.querySelectorAll('.del-coupon').forEach(del => {
    if(del.parentElement?.querySelector('.criart-coupon-edit')) return;
    const c = coupons.find(x => x.id === del.dataset.id);
    if(!c) return;
    const wrap = document.createElement('div');
    wrap.className = 'criart-inline-actions';
    const edit = document.createElement('button'); edit.className='criart-mini-btn primary criart-coupon-edit'; edit.textContent='Editar'; edit.onclick=()=>editCoupon(c);
    const toggle = document.createElement('button'); toggle.className='criart-mini-btn'; toggle.textContent=c.ativo===false?'Reativar':'Pausar'; toggle.onclick=async()=>{ await updateDoc(doc(db,'coupons',c.id),{ativo:c.ativo===false,updatedAt:serverTimestamp()}); location.reload(); };
    const originalParent = del.parentElement;
    originalParent.insertBefore(wrap, del);
    wrap.append(edit,toggle,del);
  });
}

async function enhanceBannerCards(panel){
  let banners=[];
  try{ banners = await getCollection('banners'); }catch(e){ console.error(e); return; }
  panel.querySelectorAll('.del-banner').forEach(del => {
    if(del.parentElement?.querySelector('.criart-banner-edit')) return;
    const b = banners.find(x => x.id === del.dataset.id);
    if(!b) return;
    const status = document.createElement('span');
    status.className='criart-status'; status.textContent=b.ativo===false?'Pausado':'Ativo';
    del.parentElement.querySelector('h3')?.appendChild(status);
    const wrap = document.createElement('div'); wrap.className='criart-inline-actions';
    const edit = document.createElement('button'); edit.className='criart-mini-btn primary criart-banner-edit'; edit.textContent='Editar'; edit.onclick=()=>editBanner(b);
    const toggle = document.createElement('button'); toggle.className='criart-mini-btn'; toggle.textContent=b.ativo===false?'Reativar':'Pausar'; toggle.onclick=async()=>{ await updateDoc(doc(db,'banners',b.id),{ativo:b.ativo===false,updatedAt:serverTimestamp()}); location.reload(); };
    del.parentElement.insertBefore(wrap,del);
    wrap.append(edit,toggle,del);
  });
}

async function organizeAdmin(){
  if(location.pathname !== '/admin' || !auth.currentUser) return;
  const root = document.querySelector('#app');
  if(!root || root.dataset.adminDashboardReady === '1') return;
  const head = root.querySelector('.admin-head');
  const grid = root.querySelector('.admin-grid');
  if(!head || !grid || grid.children.length < 3) return;

  ensureStyles();
  root.dataset.adminDashboardReady = '1';

  const productForm = grid.children[0];
  const couponForm = grid.children[1];
  const bannerForm = grid.children[2];

  const productsH = findHeading(root,'Produtos'); const productsList = nextElement(productsH);
  const couponsH = findHeading(root,'Cupons'); const couponsList = nextElement(couponsH);
  const bannersH = findHeading(root,'Banners'); const bannersList = nextElement(bannersH);
  const bulkH = findHeading(root,'Cadastro em massa'); const bulkBox = nextElement(bulkH);

  const tabs = document.createElement('div'); tabs.className='criart-admin-tabs';
  const names=[['products','Produtos'],['banners','Banners'],['coupons','Cupons']];
  names.forEach(([key,label])=>{const b=document.createElement('button');b.className='criart-admin-tab';b.dataset.target=key;b.textContent=label;tabs.appendChild(b)});
  const calc=document.createElement('button');calc.className='criart-admin-tab';calc.textContent='Calculadora';calc.onclick=()=>location.assign('/calculadora');tabs.appendChild(calc);
  head.after(tabs);

  const host = document.createElement('div'); tabs.after(host);
  const productPanel=makePanel('products'), bannerPanel=makePanel('banners'), couponPanel=makePanel('coupons');
  host.append(productPanel,bannerPanel,couponPanel);

  moveIf(productForm,productPanel); moveIf(productsH,productPanel); moveIf(productsList,productPanel); moveIf(bulkH,productPanel); moveIf(bulkBox,productPanel);
  moveIf(bannerForm,bannerPanel); moveIf(bannersH,bannerPanel); moveIf(bannersList,bannerPanel);
  moveIf(couponForm,couponPanel); moveIf(couponsH,couponPanel); moveIf(couponsList,couponPanel);
  grid.remove();

  function activate(key){
    root.querySelectorAll('.criart-admin-tab[data-target]').forEach(b=>b.classList.toggle('active',b.dataset.target===key));
    root.querySelectorAll('.criart-admin-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===key));
    sessionStorage.setItem('criartAdminTab',key);
  }
  tabs.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>activate(b.dataset.target));
  activate(sessionStorage.getItem('criartAdminTab') || 'products');

  await enhanceCouponRows(couponPanel);
  await enhanceBannerCards(bannerPanel);
}

const observer = new MutationObserver(()=>setTimeout(organizeAdmin,40));
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(organizeAdmin,500);
