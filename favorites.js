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

function getFavorites(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  }catch{return [];}
}
function saveFavorites(ids){
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids.map(String))]));
  syncUI();
  window.dispatchEvent(new CustomEvent('criart:favorites-changed',{detail:{ids:getFavorites()}}));
}
function isFavorite(id){ return getFavorites().includes(String(id)); }
function toggleFavorite(id){
  if(!id) return;
  const ids=getFavorites();
  const key=String(id);
  const next=ids.includes(key)?ids.filter(x=>x!==key):[...ids,key];
  saveFavorites(next);
}

function ensureStyles(){
  if(document.querySelector('#criartFavoritesStyles')) return;
  const style=document.createElement('style');
  style.id='criartFavoritesStyles';
  style.textContent=`
  .fav-card-btn{position:absolute;top:12px;right:12px;z-index:8;width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:rgba(8,10,12,.76);color:#fff;display:grid;place-items:center;font-size:22px;cursor:pointer;backdrop-filter:blur(6px);transition:.18s ease}
  .fav-card-btn:hover{transform:scale(1.05)}.fav-card-btn.active{color:#ff5a68;background:rgba(40,10,14,.88);border-color:rgba(255,90,104,.55)}
  .product-card{position:relative}.fav-detail-btn{display:inline-flex;align-items:center;gap:8px}.fav-detail-btn.active{border-color:#ff5a68;color:#ff7884}
  .fav-top-btn{display:inline-flex!important;align-items:center;gap:7px;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer;padding:0}.fav-count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#f59e0b;color:#111;display:inline-grid;place-items:center;font-size:12px;font-weight:800}
  .fav-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.62);opacity:0;pointer-events:none;transition:opacity .2s}.fav-overlay.open{opacity:1;pointer-events:auto}
  .fav-drawer{position:absolute;right:0;top:0;height:100%;width:min(440px,94vw);background:#101419;border-left:1px solid rgba(255,255,255,.12);padding:22px;overflow:auto;transform:translateX(100%);transition:transform .22s ease;box-shadow:-20px 0 50px rgba(0,0,0,.4)}.fav-overlay.open .fav-drawer{transform:translateX(0)}
  .fav-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.fav-head h2{margin:0}.fav-close{width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#171c22;color:#fff;cursor:pointer;font-size:22px}
  .fav-list{display:grid;gap:12px}.fav-item{display:grid;grid-template-columns:88px minmax(0,1fr);gap:13px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#14191f}.fav-item img,.fav-item .fav-placeholder{width:88px;height:88px;object-fit:cover;border-radius:10px;background:#0b0e12}.fav-item h3{font-size:1rem;margin:0 0 5px}.fav-item .price{font-size:1rem;margin:0 0 9px}.fav-item-actions{display:flex;gap:8px;flex-wrap:wrap}.fav-mini-btn{display:inline-block;border:1px solid rgba(255,255,255,.14);background:#1a2027;color:#fff;border-radius:9px;padding:7px 9px;cursor:pointer;font-size:.82rem;text-decoration:none}.fav-empty{padding:28px 10px;text-align:center;color:#aeb5bd}
  @media(max-width:720px){.fav-card-btn{width:38px;height:38px;top:9px;right:9px}}
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
  btn.type='button';
  btn.className='fav-top-btn';
  btn.innerHTML='♡ Favoritos <span class="fav-count">0</span>';
  btn.addEventListener('click',openDrawer);
  nav.appendChild(btn);
}

function ensureDrawer(){
  if(document.querySelector('#favOverlay')) return;
  const overlay=document.createElement('div');
  overlay.id='favOverlay';
  overlay.className='fav-overlay';
  overlay.innerHTML=`<aside class="fav-drawer" role="dialog" aria-modal="true" aria-label="Favoritos"><div class="fav-head"><h2>Seus favoritos</h2><button class="fav-close" type="button" aria-label="Fechar">×</button></div><div class="fav-list"></div></aside>`;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeDrawer();});
  overlay.querySelector('.fav-close').addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
  document.body.appendChild(overlay);
}

async function renderDrawer(){
  ensureDrawer();
  if(!productCache.length) await loadProducts();
  const ids=getFavorites();
  const list=document.querySelector('#favOverlay .fav-list');
  if(!list)return;
  const items=ids.map(id=>productCache.find(p=>p.id===id)).filter(p=>p&&p.ativo!==false);
  if(!items.length){list.innerHTML='<div class="fav-empty">Você ainda não adicionou nenhum produto aos favoritos.</div>';return;}
  list.innerHTML=items.map(p=>`<article class="fav-item" data-id="${esc(p.id)}">${p.imageUrls?.[0]?`<img src="${esc(p.imageUrls[0])}" alt="${esc(p.nome||'Produto')}">`:'<div class="fav-placeholder"></div>'}<div><h3>${esc(p.nome||'Produto')}</h3><div class="price">${money(p.preco)}</div><div class="fav-item-actions"><a class="fav-mini-btn fav-open" href="/produto/${encodeURIComponent(p.id)}">Ver produto</a><button class="fav-mini-btn fav-remove" type="button">Remover</button></div></div></article>`).join('');
  list.querySelectorAll('.fav-open').forEach(link=>link.addEventListener('click',()=>closeDrawer()));
  list.querySelectorAll('.fav-remove').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.closest('.fav-item')?.dataset.id;
    if(id){toggleFavorite(id);renderDrawer();}
  }));
}

async function openDrawer(){
  ensureDrawer();
  await renderDrawer();
  document.querySelector('#favOverlay')?.classList.add('open');
}
function closeDrawer(){document.querySelector('#favOverlay')?.classList.remove('open');}

function mountCardButtons(){
  document.querySelectorAll('.product-card[data-product-id]').forEach(card=>{
    const id=card.dataset.productId;
    if(!id || card.querySelector('.fav-card-btn')) return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='fav-card-btn';
    btn.setAttribute('aria-label','Adicionar aos favoritos');
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(id);});
    card.appendChild(btn);
  });
}

function mountDetailButton(){
  const layout=document.querySelector('.product-detail-layout[data-product-id]');
  if(!layout || layout.querySelector('.fav-detail-btn')) return;
  const id=layout.dataset.productId;
  const actions=layout.querySelector('.product-detail-info .actions');
  if(!id||!actions)return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='btn secondary fav-detail-btn';
  btn.addEventListener('click',()=>toggleFavorite(id));
  actions.appendChild(btn);
}

function syncUI(){
  ensureTopButton();
  ensureDrawer();
  const ids=getFavorites();
  document.querySelectorAll('.fav-count').forEach(el=>el.textContent=String(ids.length));
  document.querySelectorAll('.fav-card-btn').forEach(btn=>{
    const id=btn.closest('.product-card')?.dataset.productId;
    const active=id&&ids.includes(String(id));
    btn.classList.toggle('active',!!active);
    btn.textContent=active?'♥':'♡';
    btn.setAttribute('aria-label',active?'Remover dos favoritos':'Adicionar aos favoritos');
    btn.title=active?'Remover dos favoritos':'Adicionar aos favoritos';
  });
  document.querySelectorAll('.fav-detail-btn').forEach(btn=>{
    const id=btn.closest('.product-detail-layout')?.dataset.productId;
    const active=id&&ids.includes(String(id));
    btn.classList.toggle('active',!!active);
    btn.innerHTML=active?'♥ Favoritado':'♡ Adicionar aos favoritos';
  });
}

function enhance(){
  ensureStyles();
  ensureTopButton();
  ensureDrawer();
  mountCardButtons();
  mountDetailButton();
  syncUI();
}

const observer=new MutationObserver(()=>{
  clearTimeout(observerTimer);
  observerTimer=setTimeout(enhance,40);
});
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('pageshow',enhance);
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)syncUI();});
window.addEventListener('criart:favorites-changed',()=>renderDrawer());
loadProducts().finally(enhance);
