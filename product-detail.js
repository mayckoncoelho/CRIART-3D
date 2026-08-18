import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs, getDoc, doc, query, where, limit } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function findProductById(id){
  if(!id) return null;
  const snap=await getDoc(doc(db,'products',id));
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}

async function findProductByName(name){
  if(!name) return null;
  const snap=await getDocs(query(collection(db,'products'),where('nome','==',name),limit(1)));
  if(snap.empty) return null;
  const d=snap.docs[0];
  return {id:d.id,...d.data()};
}

function galleryHtml(p){
  const imgs=Array.isArray(p.imageUrls)?p.imageUrls:[];
  if(!imgs.length) return '<div class="detail-main-image placeholder">Sem foto</div>';
  return `<div class="detail-gallery" data-index="0">
    <div class="detail-main-wrap">
      <button class="detail-arrow detail-prev" type="button" aria-label="Foto anterior">‹</button>
      <img class="detail-main-image" src="${esc(imgs[0])}" alt="${esc(p.nome)}">
      <button class="detail-arrow detail-next" type="button" aria-label="Próxima foto">›</button>
      <span class="detail-count">1 / ${imgs.length}</span>
    </div>
    ${imgs.length>1?`<div class="detail-thumbs">${imgs.map((u,i)=>`<button class="detail-thumb ${i===0?'active':''}" type="button" data-i="${i}"><img src="${esc(u)}" alt="Foto ${i+1} de ${esc(p.nome)}"></button>`).join('')}</div>`:''}
  </div>`;
}

function bindGallery(p){
  const g=document.querySelector('.detail-gallery');
  if(!g) return;
  const imgs=p.imageUrls||[];
  const main=g.querySelector('.detail-main-image');
  const count=g.querySelector('.detail-count');
  const thumbs=[...g.querySelectorAll('.detail-thumb')];
  const show=i=>{
    if(!imgs.length) return;
    i=(i+imgs.length)%imgs.length;
    g.dataset.index=String(i);
    main.src=imgs[i];
    if(count) count.textContent=`${i+1} / ${imgs.length}`;
    thumbs.forEach((t,j)=>t.classList.toggle('active',j===i));
  };
  g.querySelector('.detail-prev')?.addEventListener('click',()=>show(Number(g.dataset.index)-1));
  g.querySelector('.detail-next')?.addEventListener('click',()=>show(Number(g.dataset.index)+1));
  thumbs.forEach(t=>t.addEventListener('click',()=>show(Number(t.dataset.i))));
}

function canonicalProductPath(p){ return `/produto/${encodeURIComponent(p.id)}`; }

async function renderProduct(loader,push=true){
  const app=document.querySelector('#app');
  if(!app) return;
  app.innerHTML='<p class="muted">Carregando produto...</p>';
  try{
    const p=await loader();
    if(!p || p.ativo===false){
      app.innerHTML='<a class="back product-back" href="/produtos">← Voltar aos produtos</a><h1>Produto não encontrado</h1>';
      bindBack(app);
      return;
    }
    const path=canonicalProductPath(p);
    if(push) history.pushState({productId:p.id},'',path);
    else if(location.pathname!==path) history.replaceState({productId:p.id},'',path);
    app.innerHTML=`<a class="back product-back" href="/produtos">← Voltar aos produtos</a>
      <section class="product-detail-layout" data-product-id="${esc(p.id)}">
        <div>${galleryHtml(p)}</div>
        <div class="product-detail-info">
          <span class="tag">CRIART 3D</span>
          <h1>${esc(p.nome)}</h1>
          <div class="price detail-price">${money(p.preco)}</div>
          <div class="detail-description">${esc(p.descricao||'').replace(/\n/g,'<br>')}</div>
          <div class="actions"><a class="btn" href="/personalizados">Tenho interesse</a></div>
        </div>
      </section>`;
    bindGallery(p);
    bindBack(app);
  }catch(e){
    app.innerHTML=`<a class="back product-back" href="/produtos">← Voltar aos produtos</a><h1>Não foi possível carregar</h1><p class="muted">${esc(e.message||e)}</p>`;
    bindBack(app);
  }
}

function bindBack(app){
  app.querySelector('.product-back')?.addEventListener('click',e=>{
    e.preventDefault();
    history.pushState({},'', '/produtos');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

function openProductById(id,push=true){ return renderProduct(()=>findProductById(id),push); }
function openProductByName(name,push=true){ return renderProduct(()=>findProductByName(name),push); }

function attachCards(){
  document.querySelectorAll('.product-card').forEach(card=>{
    if(card.dataset.detailReady) return;
    card.dataset.detailReady='1';
    card.tabIndex=0;
    card.setAttribute('role','link');
    card.classList.add('clickable-product');
    const open=()=>{
      const id=card.dataset.productId;
      const name=card.querySelector('h3')?.textContent?.trim();
      if(id) openProductById(id,true);
      else if(name) openProductByName(name,true);
    };
    card.addEventListener('click',e=>{if(e.target.closest('button,a'))return;open();});
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
}

function routeProductFromLocation(){
  const path=location.pathname.replace(/\/$/,'');
  const idMatch=path.match(/^\/produto\/([^/]+)$/);
  if(idMatch){ openProductById(decodeURIComponent(idMatch[1]),false); return true; }
  const params=new URLSearchParams(location.search);
  if(path==='/produto' && params.get('nome')){ openProductByName(params.get('nome'),false); return true; }
  return false;
}

document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="/produto/"]');
  if(!a) return;
  const u=new URL(a.href,location.origin);
  const m=u.pathname.match(/^\/produto\/([^/]+)$/);
  if(!m) return;
  e.preventDefault();
  openProductById(decodeURIComponent(m[1]),true);
});

const obs=new MutationObserver(attachCards);
obs.observe(document.documentElement,{subtree:true,childList:true});
attachCards();
routeProductFromLocation();
window.addEventListener('popstate',()=>{
  if(routeProductFromLocation()) return;
  if(location.pathname==='/produtos' || location.pathname==='/') location.reload();
});
