import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(fb);
let byName = new Map();
let timer = null;

async function load(){
  try{
    const snap = await getDocs(collection(db,'products'));
    byName = new Map(snap.docs.map(d=>[String(d.data()?.nome||'').trim().toLowerCase(),d.id]));
    fix();
  }catch(e){console.warn('Favoritos/home: não foi possível mapear produtos',e);}
}

function fix(){
  document.querySelectorAll('#app .product-card').forEach(card=>{
    if(card.dataset.productId) return;
    const name = card.querySelector('h3')?.textContent?.trim().toLowerCase();
    const id = name ? byName.get(name) : '';
    if(id) card.dataset.productId = id;
  });
  window.dispatchEvent(new CustomEvent('criart:product-cards-ready'));
}

function schedule(){clearTimeout(timer);timer=setTimeout(fix,80);}
new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
window.addEventListener('pageshow',schedule);
window.addEventListener('popstate',schedule);
load();
