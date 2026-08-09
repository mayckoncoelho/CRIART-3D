import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app=getApp();
const auth=getAuth(app);
const db=getFirestore(app);
const storage=getStorage(app);
const safe=n=>String(n||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-');

function addPositionField(){
  if(location.pathname!='/admin'||!auth.currentUser)return;
  const title=document.querySelector('#bTitulo');
  const text=document.querySelector('#bTexto');
  const photo=document.querySelector('#bFoto');
  const active=document.querySelector('#bAtivo');
  const oldBtn=document.querySelector('#addBanner');
  if(!title||!text||!photo||!active||!oldBtn)return;

  if(!document.querySelector('#bPosicao')){
    const field=document.createElement('div');
    field.className='field';
    field.innerHTML=`<label>Posição do banner</label><select id="bPosicao"><option value="main">Abaixo do slogan</option><option value="hero">Ao lado do slogan (carrossel)</option></select><small class="muted">Banners laterais ativos entram automaticamente no carrossel do hero.</small>`;
    photo.closest('.field')?.after(field);
  }

  if(oldBtn.dataset.positionReady==='1')return;
  const btn=oldBtn.cloneNode(true);
  btn.dataset.positionReady='1';
  oldBtn.replaceWith(btn);
  btn.addEventListener('click',async()=>{
    const pos=document.querySelector('#bPosicao')?.value||'main';
    const file=photo.files?.[0];
    btn.disabled=true;
    const original=btn.textContent;
    btn.textContent='Salvando...';
    try{
      let imageUrl='', imagePath='';
      if(file){
        imagePath=`banners/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe(file.name)}`;
        const r=ref(storage,imagePath);
        await uploadBytes(r,file,{contentType:file.type});
        imageUrl=await getDownloadURL(r);
      }
      await addDoc(collection(db,'banners'),{
        titulo:title.value.trim(),texto:text.value.trim(),ativo:active.checked,
        posicao:pos,imageUrl,imagePath,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      location.reload();
    }catch(e){
      console.error('Erro ao salvar banner:',e);
      alert('Não foi possível salvar o banner: '+(e?.message||e));
      btn.disabled=false;btn.textContent=original;
    }
  });
}

function addPositionControls(){
  if(location.pathname!='/admin'||!auth.currentUser)return;
  document.querySelectorAll('.del-banner').forEach(del=>{
    const card=del.closest('.card');
    if(!card||card.querySelector('.banner-position-control'))return;
    const id=del.dataset.id;
    if(!id)return;
    const wrap=document.createElement('div');
    wrap.className='field banner-position-control';
    wrap.innerHTML=`<label>Posição</label><select><option value="main">Abaixo do slogan</option><option value="hero">Ao lado do slogan (carrossel)</option></select>`;
    const select=wrap.querySelector('select');
    card.insertBefore(wrap, card.querySelector('.criart-inline-actions')||del);
    select.addEventListener('change',async()=>{
      select.disabled=true;
      try{await updateDoc(doc(db,'banners',id),{posicao:select.value,updatedAt:serverTimestamp()});location.reload();}
      catch(e){console.error(e);select.disabled=false;}
    });
  });
}

const obs=new MutationObserver(()=>setTimeout(()=>{addPositionField();addPositionControls();},40));
obs.observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{addPositionField();addPositionControls();},500);
