import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const ADMIN_UID = 'wc2eTkEo9qdfsSYKbl2qE77Oa2J2';
const fb = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(fb);

function isAdmin(user){ return !!user && user.uid === ADMIN_UID; }
function currentPath(){ return location.pathname.replace(/\/$/,'') || '/'; }

function updateInternalLinks(user){
  const admin = isAdmin(user);
  document.querySelectorAll('a[href="/calculadora"], a[href="/admin"]').forEach(a=>{
    a.style.display = admin ? '' : 'none';
    a.setAttribute('aria-hidden', admin ? 'false' : 'true');
    if(!admin) a.tabIndex = -1; else a.removeAttribute('tabindex');
  });
}

function protectInternalRoute(user){
  const admin = isAdmin(user);
  const path = currentPath();
  if(admin) return;
  if(path === '/calculadora' || path === '/admin'){
    history.replaceState({},'', '/');
    const app = document.querySelector('#app');
    if(app){
      app.innerHTML = `<a class="back" href="/">← Voltar ao site</a><h1>Área restrita</h1><div class="notice">Esta área é exclusiva da administração.</div>`;
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }
}

function apply(user){
  updateInternalLinks(user);
  protectInternalRoute(user);
}

onAuthStateChanged(auth,user=>{
  apply(user);
  setTimeout(()=>apply(user),50);
  setTimeout(()=>apply(user),250);
});

const observer = new MutationObserver(()=>apply(auth.currentUser));
observer.observe(document.documentElement,{childList:true,subtree:true});

window.addEventListener('popstate',()=>apply(auth.currentUser));
window.addEventListener('pageshow',()=>apply(auth.currentUser));
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) apply(auth.currentUser); });
