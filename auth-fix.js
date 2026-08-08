import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);

function friendlyError(code){
  const map={
    'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials':'E-mail ou senha incorretos.',
    'auth/wrong-password':'Senha incorreta.',
    'auth/user-not-found':'Este usuário não foi encontrado no Firebase.',
    'auth/invalid-email':'O e-mail informado não é válido.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos ou redefina a senha.',
    'auth/network-request-failed':'Falha de conexão com o Firebase. Verifique a internet e tente novamente.',
    'auth/operation-not-allowed':'Login por e-mail/senha não está habilitado no Firebase.',
    'auth/unauthorized-domain':'Este domínio não está autorizado no Firebase Authentication.'
  };
  return map[code] || `Erro do Firebase: ${code || 'desconhecido'}`;
}

function enhanceLogin(){
  const email=document.querySelector('#loginEmail');
  const pass=document.querySelector('#loginPassword');
  const btn=document.querySelector('#loginBtn');
  const msg=document.querySelector('#loginMsg');
  if(!email||!pass||!btn||!msg||btn.dataset.fixed==='1') return;
  btn.dataset.fixed='1';
  btn.addEventListener('click', async e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    try{
      msg.textContent='Entrando...';
      await signInWithEmailAndPassword(auth,email.value.trim(),pass.value);
      location.href='/admin';
    }catch(err){
      console.error('CRIART Auth error',err);
      msg.textContent=friendlyError(err?.code);
    }
  },true);

  const reset=document.createElement('button');
  reset.type='button';
  reset.className='btn secondary';
  reset.textContent='Redefinir senha';
  reset.style.marginLeft='8px';
  btn.parentElement?.appendChild(reset);
  reset.addEventListener('click',async()=>{
    const e=email.value.trim();
    if(!e){msg.textContent='Digite seu e-mail primeiro.';return;}
    try{
      await sendPasswordResetEmail(auth,e);
      msg.textContent='E-mail de redefinição enviado. Confira também o spam.';
    }catch(err){
      console.error('CRIART password reset error',err);
      msg.textContent=friendlyError(err?.code);
    }
  });
}

new MutationObserver(enhanceLogin).observe(document.documentElement,{childList:true,subtree:true});
enhanceLogin();
