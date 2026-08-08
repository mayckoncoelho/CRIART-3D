import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const db = getFirestore(getApp());

function enhancePauseButtons(){
  document.querySelectorAll('.admin-product').forEach(card=>{
    if(card.querySelector('.pause-product')) return;
    const edit = card.querySelector('.edit-product');
    if(!edit) return;
    const id = edit.dataset.id;
    const statusText = [...card.querySelectorAll('p')].map(p=>p.textContent||'').join(' ');
    const isPaused = /Oculto|Pausado/i.test(statusText);
    const actions = edit.closest('.actions') || card;
    const btn = document.createElement('button');
    btn.className = 'btn secondary pause-product';
    btn.dataset.id = id;
    btn.dataset.paused = String(isPaused);
    btn.textContent = isPaused ? 'Reativar anúncio' : 'Pausar anúncio';
    btn.addEventListener('click', async ()=>{
      const willActivate = btn.dataset.paused === 'true';
      btn.disabled = true;
      btn.textContent = willActivate ? 'Reativando...' : 'Pausando...';
      try{
        await updateDoc(doc(db,'products',id),{
          ativo: willActivate,
          updatedAt: serverTimestamp()
        });
        location.reload();
      }catch(e){
        btn.disabled = false;
        btn.textContent = willActivate ? 'Reativar anúncio' : 'Pausar anúncio';
        alert('Não foi possível alterar o anúncio: ' + (e?.message || e));
      }
    });
    actions.insertBefore(btn, actions.querySelector('.del-product') || null);
  });
}

const obs = new MutationObserver(enhancePauseButtons);
obs.observe(document.documentElement,{subtree:true,childList:true});
enhancePauseButtons();
