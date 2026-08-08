import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc = (v='') => String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]||c));
let products = null;
let banners = null;
let loading = false;
let scheduled = false;

function productCard(p){
  const img = p.imageUrls?.[0];
  return `<article class="card product-card public-product-card" data-product-id="${esc(p.id)}" tabindex="0" role="link">
    ${img ? `<img class="product-image" src="${esc(img)}" alt="${esc(p.nome)}">` : `<div class="product-image placeholder">Sem foto</div>`}
    <div class="product-body"><span class="tag">CRIART 3D</span><h3>${esc(p.nome)}</h3><p class="muted">${esc(p.descricao||'')}</p><div class="price">${money(p.preco)}</div><div class="actions"><a class="btn secondary product-details-link" href="/produto/${encodeURIComponent(p.id)}">Ver detalhes</a></div></div>
  </article>`;
}

function bannerHtml(b){
  const bg = b.imageUrl ? `style="background-image:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.25)),url('${esc(b.imageUrl)}')"` : '';
  return `<div class="promo-banner" ${bg}><div><span class="tag">Oferta</span><h2>${esc(b.titulo||'')}</h2><p>${esc(b.texto||'')}</p></div></div>`;
}

async function ensureData(){
  if(loading || auth.currentUser) return;
  loading = true;
  try{
    if(products === null){
      const ps = await getDocs(collection(db,'products'));
      products = ps.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.ativo!==false);
    }
    if(banners === null){
      try{
        const bs = await getDocs(collection(db,'banners'));
        banners = bs.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.ativo!==false);
      }catch(e){
        console.warn('Falha ao carregar banners públicos:',e);
        banners = [];
      }
    }
  }catch(e){
    console.error('Falha ao carregar produtos públicos:',e);
    products = null;
  }finally{
    loading = false;
  }
}

function removeConnectingNotice(){
  [...document.querySelectorAll('.notice')].forEach(n=>{
    if((n.textContent||'').toLowerCase().includes('catálogo está sendo conectado')) n.remove();
  });
}

function applyCatalog(){
  if(auth.currentUser || !products) return;
  removeConnectingNotice();
  const path = location.pathname.replace(/\/$/,'') || '/';
  if(path === '/produtos'){
    const heading = [...document.querySelectorAll('#app h1')].find(h=>h.textContent.trim()==='Produtos');
    const grid = heading?.parentElement?.querySelector('.grid') || document.querySelector('#app .grid');
    if(grid) grid.innerHTML = products.length ? products.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
  }
  if(path === '/'){
    const headings = [...document.querySelectorAll('#app h2')];
    const destaques = headings.find(h=>h.textContent.trim().toLowerCase()==='destaques');
    const grid = destaques?.parentElement?.querySelector('.grid');
    if(grid) grid.innerHTML = products.length ? products.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
    if(banners?.length){
      let area = document.querySelector('#app .banner-grid[data-public-banners="1"]');
      if(!area){
        area = document.createElement('section');
        area.className='banner-grid';
        area.dataset.publicBanners='1';
        const hero = document.querySelector('#app .hero');
        if(hero) hero.insertAdjacentElement('afterend',area);
      }
      if(area) area.innerHTML = banners.map(bannerHtml).join('');
    }
  }
}

async function syncPublic(){
  if(auth.currentUser) return;
  await ensureData();
  applyCatalog();
}

function schedule(){
  if(scheduled) return;
  scheduled = true;
  setTimeout(async()=>{scheduled=false; await syncPublic();},80);
}

const app = document.querySelector('#app');
if(app){
  const obs = new MutationObserver(()=>schedule());
  obs.observe(app,{childList:true,subtree:true});
}

const originalPush = history.pushState.bind(history);
history.pushState = (...args)=>{const r=originalPush(...args);schedule();return r;};
const originalReplace = history.replaceState.bind(history);
history.replaceState = (...args)=>{const r=originalReplace(...args);schedule();return r;};
window.addEventListener('popstate',schedule);
window.addEventListener('pageshow',schedule);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
window.addEventListener('focus',schedule);

[0,150,400,900,1800,3500].forEach(ms=>setTimeout(schedule,ms));
