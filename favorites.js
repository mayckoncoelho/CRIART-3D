import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const STORAGE_KEY = 'criart3d_favorites_v1';
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let productCache = [];
let observerTimer = null;
let reconcileTimer = null;

function getFavorites(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  }catch{return [];}
}
function saveFavorites(ids){
  const unique=[...new Set(ids.map(String))];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  syncUI();
  window.dispatchEvent(new CustomEvent('criart:favorites-changed',{detail:{ids:unique}}));
}
function toggleFavorite(id){
  if(!id) return;
  const ids=getFavorites();
  const key=String(id);
  saveFavorites(ids.includes(key)?ids.filter(x=>x!==key):[...ids,key]);
}
function normalizeName(v=''){return String(v).trim().replace(/\s+/g,' ').toLowerCase();}
function productIdByName(name){
  const key=normalizeName(name);
  return productCache.find(p=>normalizeName(p.nome)===key)?.id||'';
}
function cardProductId(card){
  if(!card) return '';
  if(card.dataset.productId) return String(card.dataset.productId);
  const link=card.querySelector('a[href*="produto"]');
  if(link){
    try{
      const u=new URL(link.href,location.origin);
      const m=u.pathname.match(/^\/produto\/([^/]+)$/);
      if(m){const id=decodeURIComponent(m[1]);card.dataset.productId=id;return id;}
      const qp=u.searchParams.get('produto');
      if(qp){card.dataset.productId=qp;return qp;}
    }catch{}
  }
  const id=productIdByName(card.querySelector('h3')?.textContent||card.querySelector('h2')?.textContent||'');
  if(id){card.dataset.productId=id;return id;}
  return '';
}
function detailProductId(layout){
  if(!layout) return '';
  if(layout.dataset.productId) return String(layout.dataset.productId);
  const path=location.pathname.replace(/\/$/,'');
  const m=path.match(/^\/produto\/([^/]+)$/);
  if(m){const id=decodeURIComponent(m[1]);layout.dataset.productId=id;return id;}
  const qp=new URLSearchParams(location.search).get('produto');
  if(qp){layout.dataset.productId=qp;return qp;}
  const id=productIdByName(layout.querySelector('.product-detail-info h1')?.textContent||layout.querySelector('h1')?.textContent||'');
  if(id){layout.dataset.productId=id;return id;}
  return '';
}
function publicProductCards(){
  const all=[...document.querySelectorAll('#app .product-card, #app article.card')];
  return all.filter(card=>{
    if(card.closest('.admin-grid') || card.classList.contains('admin-product')) return false;
    const name=card.querySelector('h3')?.textContent?.trim();
    const hasProductSignal=!!card.dataset.productId || !!card.querySelector('a[href*="produto"]') || !!productIdByName(name);
    return !!name && hasProductSignal;
  });
}

function ensureStyles(){
  if(document.querySelector('#criartFavoritesStyles')) return;
  const style=document.createElement('style');
  style.id='criartFavoritesStyles';
  style.textContent=`
  .fav-card-btn,.fav-detail-heart{position:absolute!important;top:12px!important;right:12px!important;z-index:999!important;width:42px!important;height:42px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.32)!important;background:rgba(8,10,12,.86)!important;color:#fff!important;display:grid!important;place-items:center!important;font-size:24px!important;line-height:1!important;cursor:pointer!important;backdrop-filter:blur(6px);transition:.18s ease;visibility:visible!important;opacity:1!important}
  .fav-card-btn:hover,.fav-detail-heart:hover{transform:scale(1.06)}
  .fav-card-btn.active,.fav-detail-heart.active{color:#ff5a68!important;background:rgba(40,10,14,.94)!important;border-color:rgba(255,90,104,.7)!important}
  #app .product-card,#app article.card{position:relative!important}
  .product-detail-layout{position:relative!important}.product-detail-info{position:relative!important}
  .fav-detail-btn{display:inline-flex!important;align-items:center!important;gap:8px!important;visibility:visible!important;opacity:1!important}.fav-detail-btn.active{border-color:#ff5a68!important;color:#ff7884!important}
  .fav-top-btn{display:inline-flex!important;align-items:center;gap:7px;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer;padding:0}.fav-top-count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#f59e0b;color:#111;display:inline-grid;place-items:center;font-size:12px;font-weight:800}
  .fav-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.62);opacity:0;pointer-events:none;transition:opacity .2s}.fav-overlay.open{opacity:1;pointer-events:auto}
  .fav-drawer{position:absolute;right:0;top:0;height:100%;width:min(440px,94vw);background:#101419;border-left:1px solid rgba(255,255,255,.12);padding:22px;overflow:auto;transform:translateX(100%);transition:transform .22s ease;box-shadow:-20px 0 50px rgba(0,0,0,.4)}.fav-overlay.open .fav-drawer{transform:translateX(0)}
  .fav-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.fav-head h2{margin:0}.fav-close{width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#171c22;color:#fff;cursor:pointer;font-size:22px}
  .fav-list{display:grid;gap:12px}.fav-item{display:grid;grid-template-columns:88px minmax(0,1fr);gap:13px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#14191f}.fav-item img,.fav-item .fav-placeholder{width:88px;height:88px;object-fit:cover;border-radius:10px;background:#0b0e12}.fav-item h3{font-size:1rem;margin:0 0 5px}.fav-item .price{font-size:1rem;margin:0 0 9px}.fav-item-actions{display:flex;gap:8px;flex-wrap:wrap}.fav-mini-btn{display:inline-block;border:1px solid rgba(255,255,255,.14);background:#1a2027;color:#fff;border-radius:9px;padding:7px 9px;cursor:pointer;font-size:.82rem;text-decoration:none}.fav-empty{padding:28px 10px;text-align:center;color:#aeb5bd}
  @media(max-width:720px){.fav-card-btn,.fav-detail-heart{width:40px!important;height:40px!important;top:9px!important;right:9px!important}}
  `;
  document.head.appendChild(style);
}

async function loadProducts(){
  try{
    const snap=await getDocs(collection(db,'products'));
    productCache=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.warn('Favoritos: não foi possível carregar produtos.',e);}
}
function ensureTopButton(){
  const nav=document.querySelector('.topbar .nav');
  if(!nav || nav.querySelector('.fav-top-btn')) return;
  const btn=document.createElement('button');
  btn.type='button';btn.className='fav-top-btn';
  btn.innerHTML='♡ Favoritos <span class="fav-top-count">0</span>';
  btn.addEventListener('click',openDrawer);nav.appendChild(btn);
}
function ensureDrawer(){
  if(document.querySelector('#favOverlay')) return;
  const overlay=document.createElement('div');overlay.id='favOverlay';overlay.className='fav-overlay';
  overlay.innerHTML=`<aside class="fav-drawer" role="dialog" aria-modal="true" aria-label="Favoritos"><div class="fav-head"><h2>Seus favoritos</h2><button class="fav-close" type="button" aria-label="Fechar">×</button></div><div class="fav-list"></div></aside>`;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeDrawer();});overlay.querySelector('.fav-close').addEventListener('click',closeDrawer);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});document.body.appendChild(overlay);
}
async function renderDrawer(){
  ensureDrawer();if(!productCache.length)await loadProducts();const ids=getFavorites();const list=document.querySelector('#favOverlay .fav-list');if(!list)return;
  const items=ids.map(id=>productCache.find(p=>p.id===id)).filter(p=>p&&p.ativo!==false);
  if(!items.length){list.innerHTML='<div class="fav-empty">Você ainda não adicionou nenhum produto aos favoritos.</div>';return;}
  list.innerHTML=items.map(p=>`<article class="fav-item" data-id="${esc(p.id)}">${p.imageUrls?.[0]?`<img src="${esc(p.imageUrls[0])}" alt="${esc(p.nome||'Produto')}">`:'<div class="fav-placeholder"></div>'}<div><h3>${esc(p.nome||'Produto')}</h3><div class="price">${money(p.preco)}</div><div class="fav-item-actions"><a class="fav-mini-btn fav-open" href="/produto/${encodeURIComponent(p.id)}">Ver produto</a><button class="fav-mini-btn fav-remove" type="button">Remover</button></div></div></article>`).join('');
  list.querySelectorAll('.fav-open').forEach(a=>a.addEventListener('click',closeDrawer));list.querySelectorAll('.fav-remove').forEach(b=>b.addEventListener('click',()=>{const id=b.closest('.fav-item')?.dataset.id;if(id){toggleFavorite(id);renderDrawer();}}));
}
async function openDrawer(){ensureDrawer();await renderDrawer();document.querySelector('#favOverlay')?.classList.add('open');}
function closeDrawer(){document.querySelector('#favOverlay')?.classList.remove('open');}

function makeHeart(id,cls){
  const btn=document.createElement('button');btn.type='button';btn.className=cls;btn.dataset.favoriteProduct=id;
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(id);});return btn;
}
function mountCardButtons(){
  publicProductCards().forEach(card=>{
    const id=cardProductId(card);if(!id)return;
    let btn=card.querySelector(':scope > .fav-card-btn');
    if(!btn){btn=makeHeart(id,'fav-card-btn');card.appendChild(btn);}else btn.dataset.favoriteProduct=id;
  });
}
function mountDetailButtons(){
  document.querySelectorAll('#app .product-detail-layout').forEach(layout=>{
    const id=detailProductId(layout);if(!id)return;
    const info=layout.querySelector('.product-detail-info')||layout;
    const actions=info.querySelector('.actions');
    if(actions && !layout.querySelector('.fav-detail-btn')){
      const btn=document.createElement('button');btn.type='button';btn.className='btn secondary fav-detail-btn';btn.dataset.favoriteProduct=id;btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(id);});actions.appendChild(btn);
    }
    if(!layout.querySelector('.fav-detail-heart')){
      const heart=makeHeart(id,'fav-detail-heart');info.appendChild(heart);
    }
  });
}
function syncUI(){
  ensureTopButton();ensureDrawer();const ids=getFavorites();const topCount=document.querySelector('.fav-top-btn .fav-top-count');if(topCount)topCount.textContent=String(ids.length);
  document.querySelectorAll('.fav-card-btn,.fav-detail-heart').forEach(btn=>{
    const id=String(btn.dataset.favoriteProduct||'');const active=ids.includes(id);btn.classList.toggle('active',active);btn.textContent=active?'♥':'♡';btn.setAttribute('aria-label',active?'Remover dos favoritos':'Adicionar aos favoritos');btn.title=active?'Remover dos favoritos':'Adicionar aos favoritos';
  });
  document.querySelectorAll('.fav-detail-btn').forEach(btn=>{
    const id=String(btn.dataset.favoriteProduct||detailProductId(btn.closest('.product-detail-layout'))||'');const active=ids.includes(id);btn.classList.toggle('active',active);btn.innerHTML=active?'♥ Favoritado':'♡ Adicionar aos favoritos';
  });
}
function enhance(){ensureStyles();ensureTopButton();ensureDrawer();mountCardButtons();mountDetailButtons();syncUI();}
function scheduleEnhance(delay=35){clearTimeout(observerTimer);observerTimer=setTimeout(enhance,delay);}

new MutationObserver(()=>scheduleEnhance()).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('pageshow',()=>{enhance();setTimeout(enhance,200);setTimeout(enhance,700);});
window.addEventListener('popstate',()=>{setTimeout(enhance,50);setTimeout(enhance,350);});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)syncUI();});
window.addEventListener('criart:favorites-changed',()=>{syncUI();renderDrawer();});
window.addEventListener('criart:product-cards-ready',()=>{enhance();setTimeout(enhance,100);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)enhance();});

loadProducts().finally(()=>{enhance();setTimeout(enhance,150);setTimeout(enhance,600);});
reconcileTimer=setInterval(()=>{if(!document.hidden)enhance();},1000);
