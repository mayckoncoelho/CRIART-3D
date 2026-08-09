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
let heroIndex = 0;
let heroTimer = null;

function ensureHeroStyles(){
  if(document.querySelector('#heroSideBannerStyles')) return;
  const s=document.createElement('style');
  s.id='heroSideBannerStyles';
  s.textContent=`
  .hero-layout{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);align-items:stretch;border:1px solid var(--line);border-radius:28px;overflow:hidden;background:linear-gradient(110deg,#101419 0%,#11161b 48%,#21170f 100%);min-height:520px}
  .hero-layout>.hero{margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;min-height:100%;display:flex;flex-direction:column;justify-content:center;padding:72px 70px!important}
  .hero-side-carousel{position:relative;min-height:100%;border:0;border-left:1px solid var(--line);border-radius:0;overflow:hidden;background:#101419}
  .hero-side-slide{position:absolute;inset:0;opacity:0;transition:opacity .5s ease;background:center/contain no-repeat #101419}
  .hero-side-slide.active{opacity:1}
  .hero-side-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.52);color:#fff;font-size:24px;cursor:pointer;opacity:.8}
  .hero-side-arrow:hover{opacity:1}.hero-side-prev{left:12px}.hero-side-next{right:12px}
  .hero-side-dots{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;display:flex;gap:7px;padding:7px 10px;border-radius:999px;background:rgba(0,0,0,.35)}
  .hero-side-dot{width:8px;height:8px;border-radius:50%;border:0;background:rgba(255,255,255,.45);padding:0;cursor:pointer}.hero-side-dot.active{background:#fff}
  @media(max-width:900px){.hero-layout{grid-template-columns:1fr;min-height:auto}.hero-layout>.hero{padding:48px 34px!important}.hero-side-carousel{min-height:360px;border-left:0;border-top:1px solid var(--line)}}
  @media(max-width:600px){.hero-layout{border-radius:22px}.hero-layout>.hero{padding:36px 24px!important}.hero-side-carousel{min-height:280px}}
  `;
  document.head.appendChild(s);
}

function currentPath(){ return location.pathname.replace(/\/$/,'') || '/'; }

function productCard(p){
  const img = p.imageUrls?.[0];
  return `<article class="card product-card public-product-card" data-product-id="${esc(p.id)}">
    ${img ? `<img class="product-image" src="${esc(img)}" alt="${esc(p.nome)}">` : `<div class="product-image placeholder">Sem foto</div>`}
    <div class="product-body"><span class="tag">CRIART 3D</span><h3>${esc(p.nome)}</h3><p class="muted">${esc(p.descricao||'')}</p><div class="price">${money(p.preco)}</div><div class="actions"><a class="btn secondary" href="/produto/${encodeURIComponent(p.id)}">Ver detalhes</a></div></div>
  </article>`;
}

function mainBannerMarkup(){
  const active = banners.filter(b=>b.ativo!==false && (b.posicao||'main')!=='hero');
  if(!active.length) return '';
  return `<section class="banner-grid public-banner-grid">${active.map(b=>`<div class="promo-banner" ${b.imageUrl?`style="background-image:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.25)),url('${esc(b.imageUrl)}')"`:''}><div><span class="tag">Oferta</span><h2>${esc(b.titulo||'')}</h2><p>${esc(b.texto||'')}</p></div></div>`).join('')}</section>`;
}

function heroBanners(){ return banners.filter(b=>b.ativo!==false && b.posicao==='hero' && b.imageUrl); }

function mountHeroCarousel(){
  const hero=document.querySelector('#app .hero');
  if(!hero) return;
  const hs=heroBanners();
  const existing=document.querySelector('#app .hero-layout');
  if(!hs.length){
    if(existing){
      existing.parentElement?.insertBefore(hero,existing);
      existing.remove();
    }
    clearInterval(heroTimer); heroTimer=null;
    return;
  }
  ensureHeroStyles();
  if(!existing){
    const wrap=document.createElement('section');
    wrap.className='hero-layout';
    hero.parentElement.insertBefore(wrap,hero);
    wrap.appendChild(hero);
    const car=document.createElement('div');car.className='hero-side-carousel';wrap.appendChild(car);
  }
  const car=document.querySelector('#app .hero-side-carousel');
  if(!car) return;
  if(heroIndex>=hs.length) heroIndex=0;
  car.innerHTML=hs.map((b,i)=>`<div class="hero-side-slide ${i===heroIndex?'active':''}" style="background-image:url('${esc(b.imageUrl)}')" role="img" aria-label="${esc(b.titulo||'Imagem em destaque')}"></div>`).join('')+
    (hs.length>1?`<button class="hero-side-arrow hero-side-prev" aria-label="Anterior">‹</button><button class="hero-side-arrow hero-side-next" aria-label="Próximo">›</button><div class="hero-side-dots">${hs.map((_,i)=>`<button class="hero-side-dot ${i===heroIndex?'active':''}" data-i="${i}" aria-label="Imagem ${i+1}"></button>`).join('')}</div>`:'');
  const show=i=>{heroIndex=(i+hs.length)%hs.length;car.querySelectorAll('.hero-side-slide').forEach((el,n)=>el.classList.toggle('active',n===heroIndex));car.querySelectorAll('.hero-side-dot').forEach((el,n)=>el.classList.toggle('active',n===heroIndex));};
  car.querySelector('.hero-side-prev')?.addEventListener('click',()=>show(heroIndex-1));
  car.querySelector('.hero-side-next')?.addEventListener('click',()=>show(heroIndex+1));
  car.querySelectorAll('.hero-side-dot').forEach(d=>d.addEventListener('click',()=>show(Number(d.dataset.i))));
  clearInterval(heroTimer);
  if(hs.length>1) heroTimer=setInterval(()=>show(heroIndex+1),5000);
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
      mountHeroCarousel();
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
        document.querySelectorAll('#app .public-banner-grid,#app .banner-grid:not(.public-banner-grid)').forEach(el=>el.remove());
        const html = mainBannerMarkup();
        if(html) section.insertAdjacentHTML('beforebegin', html);
      }
    }
  } finally { applying = false; }
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
  } catch(e){ console.error('Falha ao carregar catálogo público:', e); }
}

function scheduleApply(){ clearTimeout(refreshTimer); refreshTimer = setTimeout(applyCatalog, 25); }

const observer = new MutationObserver(()=>scheduleApply());
const app = document.querySelector('#app');
if(app) observer.observe(app,{childList:true,subtree:true});
window.addEventListener('popstate',scheduleApply);
window.addEventListener('pageshow',scheduleApply);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleApply(); });
document.addEventListener('click',e=>{ const a = e.target.closest('a[data-link],a[href="/"],a[href="/produtos"]'); if(a) setTimeout(scheduleApply,50); });
fetchCatalog();
setInterval(()=>{ if(!document.hidden) fetchCatalog(); }, 30000);
