import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
const STORAGE_KEY='criart3d_favorites_v1';
let byName = new Map();
let timer = null;

function getFavorites(){
  try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(v)?[...new Set(v.map(String))]:[];}catch{return[];}
}
function toggle(id){
  const ids=getFavorites();
  const key=String(id);
  const next=ids.includes(key)?ids.filter(x=>x!==key):[...ids,key];
  localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
  sync();
  window.dispatchEvent(new CustomEvent('criart:favorites-changed',{detail:{ids:next}}));
}
function sync(){
  const ids=getFavorites();
  document.querySelectorAll('#app .product-card .fav-card-btn').forEach(btn=>{
    const id=btn.closest('.product-card')?.dataset.productId;
    const active=id&&ids.includes(String(id));
    btn.classList.toggle('active',!!active);
    btn.textContent=active?'♥':'♡';
    btn.title=active?'Remover dos favoritos':'Adicionar aos favoritos';
    btn.setAttribute('aria-label',btn.title);
  });
  const count=document.querySelector('.fav-top-btn .fav-top-count');
  if(count) count.textContent=String(ids.length);
}

async function load(){
  try{
    const snap = await getDocs(collection(db,'products'));
    byName = new Map(snap.docs.map(d=>[String(d.data()?.nome||'').trim().toLowerCase(),d.id]));
    fix();
  }catch(e){console.warn('Favoritos/home: não foi possível mapear produtos',e);}
}

function fix(){
  document.querySelectorAll('#app .product-card').forEach(card=>{
    let id=card.dataset.productId;
    if(!id){
      const name = card.querySelector('h3')?.textContent?.trim().toLowerCase();
      id = name ? byName.get(name) : '';
      if(id) card.dataset.productId = id;
    }
    if(!id || card.querySelector('.fav-card-btn')) return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='fav-card-btn';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle(id);});
    card.appendChild(btn);
  });
  sync();
}

function schedule(){clearTimeout(timer);timer=setTimeout(fix,80);}
new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
window.addEventListener('pageshow',schedule);
window.addEventListener('popstate',schedule);
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)sync();});
load();
