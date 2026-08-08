import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fb = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc = (v='') => String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]||c));

function productCard(p){
  const img = p.imageUrls?.[0];
  return `<article class="card product-card public-product-card" data-product-id="${esc(p.id)}" tabindex="0" role="link">
    ${img ? `<img class="product-image" src="${esc(img)}" alt="${esc(p.nome)}">` : `<div class="product-image placeholder">Sem foto</div>`}
    <div class="product-body"><span class="tag">CRIART 3D</span><h3>${esc(p.nome)}</h3><p class="muted">${esc(p.descricao||'')}</p><div class="price">${money(p.preco)}</div><div class="actions"><a class="btn secondary product-details-link" href="/produto/${encodeURIComponent(p.id)}">Ver detalhes</a></div></div>
  </article>`;
}

async function loadPublicCatalog(){
  try{
    const snap = await getDocs(collection(db,'products'));
    const products = snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.ativo!==false);
    const path = location.pathname.replace(/\/$/,'') || '/';
    if(path === '/produtos'){
      const grid = document.querySelector('#app .grid');
      if(grid) grid.innerHTML = products.length ? products.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
    } else if(path === '/'){
      const headings = [...document.querySelectorAll('#app h2')];
      const destaques = headings.find(h=>h.textContent.trim().toLowerCase()==='destaques');
      const grid = destaques?.parentElement?.querySelector('.grid');
      if(grid) grid.innerHTML = products.length ? products.map(productCard).join('') : '<p class="muted">Nenhum produto publicado ainda.</p>';
    }
  } catch(e){
    console.error('Falha ao carregar catálogo público:', e);
  }
}

function secureCalculator(user){
  const calcLink = [...document.querySelectorAll('a[href="/calculadora"]')];
  calcLink.forEach(a=>{ a.style.display = user ? '' : 'none'; });
  const path = location.pathname.replace(/\/$/,'') || '/';
  if(path === '/calculadora' && !user){
    history.replaceState({},'', '/auth');
    const app = document.querySelector('#app');
    if(app) app.innerHTML = '<a class="back" href="/">← Voltar ao site</a><h1>Área restrita</h1><div class="notice">A calculadora é uma ferramenta interna. Faça login como administrador para acessá-la.</div><a class="btn" href="/auth">Entrar no Admin</a>';
  }
}

onAuthStateChanged(auth, user=>{
  secureCalculator(user);
  if(!user) loadPublicCatalog();
});

window.addEventListener('popstate',()=>{
  secureCalculator(auth.currentUser);
  if(!auth.currentUser) setTimeout(loadPublicCatalog,50);
});

setTimeout(()=>{
  secureCalculator(auth.currentUser);
  if(!auth.currentUser) loadPublicCatalog();
},400);
