import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc = (v='') => String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','\"':'&quot;'}[c]||c));

let products = [];
let banners = [];
let loaded = false;
let applying = false;
let refreshTimer = null;

function currentPath(){ return location.pathname.replace(/\/$/,'') || '/'; }

function productCard(p){
  const img = p.imageUrls?.[0];
  return `<article class="card product-card public-product-card" data-product-id="${esc(p.id)}">
    ${img ? `<img class="product-image" src="${esc(img)}" alt="${esc(p.nome)}">` : `<div class="product-image placeholder">Sem foto</div>`}
    <div class="product-body"><span class="tag">CRIART 3D</span><h3>${esc(p.nome)}</h3><p class="muted">${esc(p.descricao||'')}</p><div class="price">${money(p.preco)}</div><div class="actions"><a class="btn secondary" href="/produto/${encodeURIComponent(p.id)}">Ver detalhes</a></div></div>
  </article>`;
}

function bannerMarkup(){
  const active = banners.filter(b=>b.ativo!==false);
  if(!active.length) return '';
  return `<section class="banner-grid public-banner-grid">${active.map(b=>`<div class="promo-banner" ${b.imageUrl?`style="background-image:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.25)),url('${esc(b.imageUrl)}')"`:''}><div><span class="tag">Oferta</span><h2>${esc(b.titulo||'')}</h2><p>${esc(b.texto||'')}</p></div></div>`).join('')}</section>`;
}

function removeConnectingNotice(){
  document.querySelectorAll('#app .notice').forEach(el=>{
    if((el.textContent||'').toLowerCase().includes('catálogo está sendo conectado')) el.remove();
  });
}

function applyCatalog(){
  if(applying || !loaded) return;
  const path = currentPath();
  if(path !== '/' && path !== '/produtos') return;
  applying = true;
  try{
    removeConnectingNotice();
    const visible = products.filter(p=>p.ativo!==false);
    if(path === '/produtos'){
      const h1 = [...document.querySelectorAll('#app h1')].find(h=>h.textContent.trim().toLowerCase()==='produtos');
      const grid = h1?.parentElement?.querySelector('.grid') || document.querySelector('#app .grid');
      if(grid){
        const expected = visible.map(p=>p.id).join('|');
        if(grid.dataset.catalogIds !== expected){
          grid.innerHTML = visible.length ? visible.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
          grid.dataset.catalogIds = expected;
        }
      }
    } else {
      const headings = [...document.querySelectorAll('#app h2')];
      const destaques = headings.find(h=>h.textContent.trim().toLowerCase()==='destaques');
      const section = destaques?.parentElement;
      const grid = section?.querySelector('.grid');
      if(grid){
        const expected = visible.map(p=>p.id).join('|');
        if(grid.dataset.catalogIds !== expected){
          grid.innerHTML = visible.length ? visible.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
          grid.dataset.catalogIds = expected;
        }
      }
      if(section){
        document.querySelectorAll('#app .public-banner-grid').forEach(el=>el.remove());
        const html = bannerMarkup();
        if(html) section.insertAdjacentHTML('beforebegin', html);
      }
    }
  } finally {
    applying = false;
  }
}

async function fetchCatalog(){
  try{
    const [pSnap,bSnap] = await Promise.all([
      getDocs(collection(db,'products')),
      getDocs(collection(db,'banners')).catch(()=>null)
    ]);
    products = pSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    banners = bSnap ? bSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)) : [];
    loaded = true;
    applyCatalog();
  } catch(e){
    console.error('Falha ao carregar catálogo público:', e);
  }
}

function scheduleApply(){
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(applyCatalog, 25);
}

const observer = new MutationObserver(()=>scheduleApply());
const app = document.querySelector('#app');
if(app) observer.observe(app,{childList:true,subtree:true});

window.addEventListener('popstate',scheduleApply);
window.addEventListener('pageshow',scheduleApply);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleApply(); });
document.addEventListener('click',e=>{
  const a = e.target.closest('a[data-link],a[href="/"],a[href="/produtos"]');
  if(a) setTimeout(scheduleApply,50);
});

fetchCatalog();
setInterval(()=>{ if(!document.hidden) fetchCatalog(); }, 30000);
