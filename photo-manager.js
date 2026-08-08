import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app=getApp(), auth=getAuth(app), db=getFirestore(app), storage=getStorage(app);
const safe=n=>n.replace(/[^a-zA-Z0-9._-]/g,'-');

async function products(){const s=await getDocs(collection(db,'products'));return s.docs.map(d=>({id:d.id,...d.data()}))}
async function upload(files){const urls=[],paths=[];for(const f of files){const path=`products/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe(f.name)}`;const r=ref(storage,path);await uploadBytes(r,f,{contentType:f.type});urls.push(await getDownloadURL(r));paths.push(path)}return{urls,paths}}

async function enhance(){
 if(location.pathname!='/admin'||!auth.currentUser||document.querySelector('#multiPhotoManager'))return;
 const root=document.querySelector('#app'); if(!root)return;
 const ps=await products();
 const box=document.createElement('section');box.id='multiPhotoManager';box.innerHTML='<h2>Gerenciar fotos</h2><p class="muted">Adicione outras fotos aos produtos já cadastrados.</p>';
 ps.forEach(p=>{const c=document.createElement('article');c.className='card';c.style.marginBottom='12px';c.innerHTML=`<h3>${p.nome||'Produto'}</h3><p class="muted">${(p.imageUrls||[]).length} foto(s)</p><input type="file" accept="image/*" multiple><button class="btn addMore" style="margin-top:10px">Adicionar fotos</button><div class="image-preview">${(p.imageUrls||[]).map(u=>`<img src="${u}">`).join('')}</div><div class="muted msg"></div>`;c.querySelector('.addMore').onclick=async()=>{const input=c.querySelector('input'),files=[...input.files];if(!files.length)return;c.querySelector('.msg').textContent='Enviando...';try{const up=await upload(files);await updateDoc(doc(db,'products',p.id),{imageUrls:[...(p.imageUrls||[]),...up.urls],imagePaths:[...(p.imagePaths||[]),...up.paths],updatedAt:serverTimestamp()});box.remove();setTimeout(enhance,200)}catch(e){c.querySelector('.msg').textContent='Erro: '+e.message}};box.appendChild(c)});
 root.appendChild(box);
}

onAuthStateChanged(auth,()=>setTimeout(enhance,200));
new MutationObserver(()=>enhance()).observe(document.body,{childList:true,subtree:true});
setTimeout(enhance,500);
