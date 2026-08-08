import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function findProductByName(name){
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

async function openProduct(name,push=true){
  const app=document.querySelector('#app');
  if(!app) return;
  app.innerHTML='<p class="muted">Carregando produto...</p>';
  try{
    const p=await findProductByName(name);
    if(!p || p.ativo===false){app.innerHTML='<a class="back" href="/produtos">← Voltar aos produtos</a><h1>Produto não encontrado</h1>';return;}
    if(push){const u=new URL(location.href);u.pathname='/produto';u.searchParams.set('nome',p.nome);history.pushState({product:p.nome},'',u);}
    app.innerHTML=`<a class="back product-back" href="/produtos">← Voltar aos produtos</a>
      <section class="product-detail-layout">
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
    app.querySelector('.product-back')?.addEventListener('click',e=>{e.preventDefault();history.pushState({},'', '/produtos');location.reload();});
  }catch(e){app.innerHTML=`<a class="back" href="/produtos">← Voltar aos produtos</a><h1>Não foi possível carregar</h1><p class="muted">${esc(e.message||e)}</p>`;}
}

function attachCards(){
  document.querySelectorAll('.product-card').forEach(card=>{
    if(card.dataset.detailReady) return;
    card.dataset.detailReady='1';
    card.tabIndex=0;
    card.setAttribute('role','link');
    card.classList.add('clickable-product');
    const open=()=>{const name=card.querySelector('h3')?.textContent?.trim();if(name)openProduct(name,true)};
    card.addEventListener('click',e=>{if(e.target.closest('button,a'))return;open();});
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
}

const obs=new MutationObserver(attachCards);
obs.observe(document.documentElement,{subtree:true,childList:true});
attachCards();

const params=new URLSearchParams(location.search);
if(location.pathname==='/produto' && params.get('nome')) openProduct(params.get('nome'),false);
window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(location.pathname==='/produto'&&p.get('nome'))openProduct(p.get('nome'),false);});
