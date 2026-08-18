import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs, doc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const STORAGE_KEY='criart3d_liked_products_v1';
let liked=new Set(loadLiked());
let counts=new Map();
let loadingCounts=false;
let mountTimer=null;

function loadLiked(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    return Array.isArray(raw)?raw.map(String):[];
  }catch{return[];}
}
function saveLiked(){ localStorage.setItem(STORAGE_KEY,JSON.stringify([...liked])); }
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function ensureStyle(){
  if(document.querySelector('#criartLikesStyle')) return;
  const s=document.createElement('style');
  s.id='criartLikesStyle';
  s.textContent=`
    .criart-like-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:transparent;color:inherit;border-radius:999px;padding:8px 12px;cursor:pointer;font:inherit;line-height:1;transition:.18s ease}
    .criart-like-btn:hover{transform:translateY(-1px);border-color:#ff7a18}
    .criart-like-btn.is-liked{background:rgba(255,122,24,.13);border-color:#ff7a18;color:#ff9a4d}
    .criart-like-btn[disabled]{opacity:.55;cursor:wait;transform:none}
    .criart-like-icon{font-size:1.05rem}.criart-like-count{font-variant-numeric:tabular-nums}
    .product-card .criart-card-social{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
    .product-detail-info .criart-detail-social{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
  `;
  document.head.appendChild(s);
}

function countFor(id){return Math.max(0,Number(counts.get(String(id))||0));}
function buttonHtml(id,context){
  const active=liked.has(String(id));
  const count=countFor(id);
  return `<button type="button" class="criart-like-btn ${active?'is-liked':''}" data-like-product="${esc(id)}" data-like-context="${context}" aria-pressed="${active?'true':'false'}" title="${active?'Remover curtida':'Curtir produto'}"><span class="criart-like-icon" aria-hidden="true">👍</span><span class="criart-like-label">${active?'Curtido':'Curtir'}</span><span class="criart-like-count">${count}</span></button>`;
}

function mountCard(card){
  const id=card.dataset.productId;
  if(!id || card.querySelector('[data-like-product]')) return;
  const body=card.querySelector('.product-body')||card;
  const actions=body.querySelector('.actions');
  const wrap=document.createElement('div');
  wrap.className='criart-card-social';
  wrap.innerHTML=buttonHtml(id,'card');
  if(actions) actions.insertAdjacentElement('beforebegin',wrap); else body.appendChild(wrap);
}

function mountDetail(layout){
  const id=layout.dataset.productId;
  if(!id || layout.querySelector('[data-like-product]')) return;
  const info=layout.querySelector('.product-detail-info');
  if(!info) return;
  const actions=info.querySelector('.actions');
  const wrap=document.createElement('div');
  wrap.className='criart-detail-social';
  wrap.innerHTML=buttonHtml(id,'detail');
  if(actions) actions.insertAdjacentElement('beforebegin',wrap); else info.appendChild(wrap);
}

function mountAll(){
  ensureStyle();
  document.querySelectorAll('.product-card[data-product-id]').forEach(mountCard);
  document.querySelectorAll('.product-detail-layout[data-product-id]').forEach(mountDetail);
  refreshMountedButtons();
}

function refreshMountedButtons(){
  document.querySelectorAll('[data-like-product]').forEach(btn=>{
    const id=String(btn.dataset.likeProduct||'');
    const active=liked.has(id);
    btn.classList.toggle('is-liked',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
    btn.title=active?'Remover curtida':'Curtir produto';
    const label=btn.querySelector('.criart-like-label'); if(label) label.textContent=active?'Curtido':'Curtir';
    const count=btn.querySelector('.criart-like-count'); if(count) count.textContent=String(countFor(id));
  });
}

async function loadCounts(){
  if(loadingCounts) return;
  loadingCounts=true;
  try{
    const snap=await getDocs(collection(db,'productLikes'));
    counts=new Map(snap.docs.map(d=>[d.id,Math.max(0,Number(d.data()?.count||0))]));
    refreshMountedButtons();
  }catch(e){console.warn('Curtidas: não foi possível carregar contadores',e);}
  finally{loadingCounts=false;}
}

async function toggleLike(id,btn){
  id=String(id||''); if(!id) return;
  const wasLiked=liked.has(id);
  btn.disabled=true;
  try{
    const ref=doc(db,'productLikes',id);
    const next=await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);
      const current=snap.exists()?Math.max(0,Number(snap.data()?.count||0)):0;
      const target=wasLiked?Math.max(0,current-1):current+1;
      if(snap.exists()) tx.update(ref,{count:target});
      else if(!wasLiked) tx.set(ref,{count:1});
      return target;
    });
    if(wasLiked) liked.delete(id); else liked.add(id);
    saveLiked();
    counts.set(id,next);
    refreshMountedButtons();
  }catch(e){
    console.error('Curtidas: falha ao registrar curtida',e);
    const old=btn.querySelector('.criart-like-label');
    if(old){const prev=old.textContent;old.textContent='Tente novamente';setTimeout(()=>{old.textContent=prev;},1600);}
  }finally{btn.disabled=false;}
}

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-like-product]');
  if(!btn) return;
  e.preventDefault();e.stopPropagation();
  toggleLike(btn.dataset.likeProduct,btn);
});

function scheduleMount(){clearTimeout(mountTimer);mountTimer=setTimeout(mountAll,45);}
const root=document.querySelector('#app')||document.body;
new MutationObserver(scheduleMount).observe(root,{childList:true,subtree:true});
window.addEventListener('pageshow',()=>{scheduleMount();loadCounts();});
window.addEventListener('popstate',scheduleMount);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadCounts();});
mountAll();
loadCounts();
