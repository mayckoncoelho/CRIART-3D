import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
let products = [];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function loadProducts(){
  try{
    const snap = await getDocs(collection(db,'products'));
    products = snap.docs.map(d=>({id:d.id,...d.data()}));
    enhanceAll();
  }catch(e){ console.warn('Carrossel: não foi possível carregar produtos',e); }
}

function enhanceCard(card){
  if(card.dataset.carouselReady==='1') return;
  const title = card.querySelector('h3')?.textContent?.trim();
  if(!title) return;
  const p = products.find(x => String(x.nome||'').trim()===title);
  const imgs = (p?.imageUrls||[]).filter(Boolean);
  if(imgs.length<2){ card.dataset.carouselReady='1'; return; }

  const old = card.querySelector('.product-image');
  if(!old) return;

  const wrap=document.createElement('div');
  wrap.className='product-carousel';
  wrap.dataset.index='0';
  wrap.innerHTML=`
    <div class="carousel-main">
      <img class="product-image carousel-image" src="${esc(imgs[0])}" alt="${esc(title)}">
      <button class="carousel-arrow carousel-prev" type="button" aria-label="Foto anterior">‹</button>
      <button class="carousel-arrow carousel-next" type="button" aria-label="Próxima foto">›</button>
      <span class="carousel-count">1 / ${imgs.length}</span>
    </div>
    <div class="carousel-thumbs">${imgs.map((u,i)=>`<button class="carousel-thumb ${i===0?'active':''}" type="button" data-i="${i}" aria-label="Ver foto ${i+1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>`;
  old.replaceWith(wrap);

  const main=wrap.querySelector('.carousel-image');
  const count=wrap.querySelector('.carousel-count');
  const thumbs=[...wrap.querySelectorAll('.carousel-thumb')];
  const show=i=>{
    i=(i+imgs.length)%imgs.length;
    wrap.dataset.index=String(i);
    main.src=imgs[i];
    count.textContent=`${i+1} / ${imgs.length}`;
    thumbs.forEach((t,n)=>t.classList.toggle('active',n===i));
  };
  wrap.querySelector('.carousel-prev').onclick=e=>{e.preventDefault();e.stopPropagation();show(Number(wrap.dataset.index)-1)};
  wrap.querySelector('.carousel-next').onclick=e=>{e.preventDefault();e.stopPropagation();show(Number(wrap.dataset.index)+1)};
  thumbs.forEach(t=>t.onclick=e=>{e.preventDefault();e.stopPropagation();show(Number(t.dataset.i))});
  card.dataset.carouselReady='1';
}

function enhanceAll(){ document.querySelectorAll('.product-card').forEach(enhanceCard); }

const style=document.createElement('style');
style.textContent=`
.product-carousel{position:relative;background:#0f1216}.carousel-main{position:relative}.carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(8,10,12,.72);color:white;font-size:26px;line-height:1;cursor:pointer;display:grid;place-items:center}.carousel-prev{left:10px}.carousel-next{right:10px}.carousel-count{position:absolute;right:10px;bottom:10px;background:rgba(8,10,12,.72);color:#fff;border-radius:999px;padding:4px 8px;font-size:.75rem}.carousel-thumbs{display:flex;gap:7px;padding:9px;overflow-x:auto;background:#101419}.carousel-thumb{flex:0 0 54px;width:54px;height:54px;padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#0b0d10;cursor:pointer}.carousel-thumb.active{border-color:#ff7a18}.carousel-thumb img{width:100%;height:100%;object-fit:cover;display:block}@media(max-width:720px){.carousel-arrow{width:34px;height:34px}.carousel-thumb{flex-basis:48px;width:48px;height:48px}}
`;
document.head.appendChild(style);

new MutationObserver(()=>enhanceAll()).observe(document.documentElement,{childList:true,subtree:true});
loadProducts();
