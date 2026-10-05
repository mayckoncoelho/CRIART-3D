import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import {
  escapeHtml as esc,
  isValidMakerWorldUrl,
  sanitizeMakerWorldHref,
  identifyReplacedImagePaths,
  isStorageNotFoundError
} from './makerworld-product.js';

const app=getApp();
const auth=getAuth(app);
const db=getFirestore(app);
const storage=getStorage(app);
const safe=n=>String(n||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-');

let modal=null;
let currentProduct=null;
let items=[];
let isSaving=false;

async function getProducts(){
  const snap=await getDocs(collection(db,'products'));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

function ensureStyles(){
  if(document.querySelector('#fullProductEditorStyles'))return;
  const s=document.createElement('style');
  s.id='fullProductEditorStyles';
  s.textContent=`
  .full-editor-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}
  .full-editor{width:min(100%,980px);background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
  .full-editor-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}
  .full-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .full-editor-grid .full{grid-column:1/-1}
  .full-editor-gallery{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}
  .full-editor-photo{width:150px;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:8px;background:rgba(255,255,255,.03)}
  .full-editor-photo.main{outline:2px solid #22c55e}
  .full-editor-photo img{width:100%;height:120px;object-fit:cover;border-radius:10px;display:block;margin-bottom:8px}
  .full-editor-photo .photo-actions{display:flex;flex-direction:column;gap:6px}
  .full-editor-photo .btn{font-size:.78rem;padding:7px 9px}
  .full-editor-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
  .full-editor-status{margin-top:10px}
  @media(max-width:700px){.full-editor-overlay{padding:10px}.full-editor{padding:16px}.full-editor-grid{grid-template-columns:1fr}.full-editor-grid .full{grid-column:auto}.full-editor-photo{width:calc(50% - 6px)}}`;
  document.head.appendChild(s);
}

function closeEditor(){
  modal?.remove();
  modal=null;
  currentProduct=null;
  items=[];
}

function renderGallery(){
  const box=modal?.querySelector('#fullEditorGallery');
  if(!box)return;
  const active=items.filter(x=>!x.removed);
  if(!active.length){box.innerHTML='<p class="muted">Nenhuma foto. Você pode adicionar novas imagens abaixo.</p>';return;}
  box.innerHTML=active.map((it,idx)=>`<div class="full-editor-photo ${idx===0?'main':''}" data-key="${esc(it.key)}">
    <img src="${esc(it.preview||it.url)}" alt="Foto do produto">
    <div class="photo-actions">
      ${idx===0?'<span class="tag">Foto principal</span>':`<button type="button" class="btn secondary setMainPhoto" data-key="${esc(it.key)}">Definir como principal</button>`}
      <button type="button" class="btn secondary removeEditorPhoto" data-key="${esc(it.key)}">Excluir foto</button>
    </div>
  </div>`).join('');
  box.querySelectorAll('.setMainPhoto').forEach(b=>b.onclick=()=>{
    const i=items.findIndex(x=>x.key===b.dataset.key);
    if(i<0)return;
    const [chosen]=items.splice(i,1);
    items.unshift(chosen);
    renderGallery();
  });
  box.querySelectorAll('.removeEditorPhoto').forEach(b=>b.onclick=()=>{
    const it=items.find(x=>x.key===b.dataset.key);
    if(!it)return;
    it.removed=true;
    renderGallery();
  });
}

function openEditor(product){
  ensureStyles();
  currentProduct=product;
  const urls=[...(product.imageUrls||[])];
  const paths=[...(product.imagePaths||[])];
  items=urls.map((url,i)=>({key:`old-${i}-${Date.now()}`,url,path:paths[i]||'',file:null,preview:'',removed:false}));
  modal=document.createElement('div');
  modal.className='full-editor-overlay';

  let mwHtml = '';
  if (product.makerworld) {
    const mw = product.makerworld;
    const modelText = esc(mw.modelId || 'N/A');
    const profileText = esc(mw.profileName || mw.profileId || 'Padrão');
    const filGrams = esc(mw.filamentGrams ?? 0);
    const printMins = esc(mw.printTimeMinutes ?? 0);
    const materialText = esc(mw.material || 'PLA');
    const sourceKeyHtml = product.sourceKey
      ? `<div><strong>SourceKey:</strong> <code>${esc(product.sourceKey)}</code></div>`
      : '';
    const validHref = sanitizeMakerWorldHref(mw.sourceUrl || mw.canonicalUrl);
    const linkHtml = validHref
      ? `<div><strong>Link:</strong> <a href="${esc(validHref)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#f59e0b);text-decoration:underline;">Ver no MakerWorld ↗</a></div>`
      : '';

    mwHtml = `<div class="field full">
      <label>Origem MakerWorld (Leitura)</label>
      <div style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:12px; font-size:.85rem; line-height:1.5;">
        <div><strong>Modelo:</strong> ${modelText} | <strong>Perfil:</strong> ${profileText}</div>
        <div><strong>Consumo:</strong> ${filGrams}g | <strong>Tempo:</strong> ${printMins} min | <strong>Material:</strong> ${materialText}</div>
        ${sourceKeyHtml}
        ${linkHtml}
      </div>
    </div>`;
  }

  modal.innerHTML=`<section class="full-editor">
    <div class="full-editor-head"><div><h1>Editar anúncio</h1><p class="muted">Altere todas as informações do produto em um só lugar.</p></div><button type="button" class="btn secondary" id="closeFullEditor">Fechar</button></div>
    <div class="full-editor-grid">
      <div class="field"><label>Nome *</label><input id="fullNome" value="${esc(product.nome||'')}"></div>
      <div class="field"><label>Preço *</label><input id="fullPreco" type="number" min="0" step="0.01" value="${Number(product.preco)||0}"></div>
      <div class="field full"><label>Descrição</label><textarea id="fullDescricao"></textarea></div>
      <div class="field full"><label class="check"><input id="fullAtivo" type="checkbox" ${product.ativo===false?'':'checked'}> Anúncio publicado</label><small class="muted">Desmarque para pausar sem excluir o produto.</small></div>
      <div class="field full"><label>Fotos do anúncio</label><div id="fullEditorGallery" class="full-editor-gallery"></div></div>
      <div class="field full"><label>Adicionar fotos</label><input id="fullNewPhotos" type="file" accept="image/*" multiple><small class="muted">As novas fotos serão adicionadas ao anúncio. Você poderá escolhê-las como principal antes de salvar.</small></div>
      ${mwHtml}
    </div>
    <div id="fullEditorMsg" class="muted full-editor-status"></div>
    <div class="full-editor-actions"><button type="button" class="btn" id="saveFullEditor">Salvar alterações</button><button type="button" class="btn secondary" id="cancelFullEditor">Cancelar</button></div>
  </section>`;
  document.body.appendChild(modal);
  modal.querySelector('#fullDescricao').value=product.descricao||'';
  modal.querySelector('#closeFullEditor').onclick=closeEditor;
  modal.querySelector('#cancelFullEditor').onclick=closeEditor;
  modal.addEventListener('click',e=>{if(e.target===modal)closeEditor()});
  modal.querySelector('#fullNewPhotos').addEventListener('change',e=>{
    [...e.target.files].forEach(file=>items.push({key:`new-${Math.random().toString(36).slice(2)}-${Date.now()}`,url:'',path:'',file,preview:URL.createObjectURL(file),removed:false}));
    e.target.value='';
    renderGallery();
  });
  modal.querySelector('#saveFullEditor').onclick=saveEditor;
  renderGallery();
}

async function uploadNewItem(item){
  const path=`products/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe(item.file.name)}`;
  const r=ref(storage,path);
  await uploadBytes(r,item.file,{contentType:item.file.type});
  const url=await getDownloadURL(r);
  return {url,path};
}

async function cleanupStoragePaths(paths){
  if(!Array.isArray(paths)||paths.length===0)return;
  for(const p of paths){
    if(typeof p==='string'&&p.trim()){
      try{
        await deleteObject(ref(storage,p));
      }catch(err){
        if(!isStorageNotFoundError(err)){
          console.warn('Erro ao remover arquivo do Storage:',p,err);
        }
      }
    }
  }
}

async function saveEditor(){
  if(isSaving)return;
  if(!currentProduct)return;
  const msg=modal.querySelector('#fullEditorMsg');
  const saveBtn=modal.querySelector('#saveFullEditor');

  // Revalidação imediata antes de qualquer operação
  if(!auth.currentUser){
    msg.textContent='Usuário não autenticado. Faça login no painel.';
    return;
  }

  const nome=modal.querySelector('#fullNome').value.trim();
  const descricao=modal.querySelector('#fullDescricao').value.trim();
  const preco=Number(modal.querySelector('#fullPreco').value);
  const ativo=modal.querySelector('#fullAtivo').checked;

  if(!nome||!Number.isFinite(preco)||preco<=0){
    msg.textContent='Informe nome e preço válidos (preço deve ser maior que zero).';
    return;
  }

  const active=items.filter(x=>!x.removed);
  if(active.length===0){
    msg.textContent='O anúncio deve conter ao menos uma foto.';
    return;
  }

  isSaving=true;
  saveBtn.disabled=true;
  msg.textContent='Salvando alterações...';

  const newlyUploadedPaths=[];
  try{
    // 1. Upload de novas fotos com proteção contra órfãos
    for(const item of active){
      if(item.file&&!item.url){
        try{
          const up=await uploadNewItem(item);
          item.url=up.url;
          item.path=up.path;
          newlyUploadedPaths.push(up.path);
        }catch(upErr){
          // Se upload parcial falhar antes do Firestore, limpe apenas os novos objetos já enviados
          await cleanupStoragePaths(newlyUploadedPaths);
          throw upErr;
        }
      }
    }

    const imageUrls=active.map(x=>x.url).filter(Boolean);
    const imagePaths=active.map(x=>x.path||'');

    if(imageUrls.length===0){
      throw new Error('Ao menos uma foto válida é obrigatória.');
    }

    // Identifica paths antigos que foram substituídos/removidos
    const oldOriginalPaths=Array.isArray(currentProduct.imagePaths)?currentProduct.imagePaths:[];
    const replacedOldPaths=identifyReplacedImagePaths(oldOriginalPaths,imagePaths);

    items.filter(x=>x.removed&&x.path).forEach(x=>{
      if(!imagePaths.includes(x.path)&&!replacedOldPaths.includes(x.path)){
        replacedOldPaths.push(x.path);
      }
    });

    // 2. Gravação no Firestore
    try{
      await updateDoc(doc(db,'products',currentProduct.id),{
        nome,
        descricao,
        preco,
        ativo,
        imageUrls,
        imagePaths,
        updatedAt:serverTimestamp()
      });
    }catch(writeErr){
      // Se updateDoc falhar, NÃO apague os antigos!
      // Limpe apenas os novos objetos já enviados para evitar órfãos:
      if(newlyUploadedPaths.length>0){
        await cleanupStoragePaths(newlyUploadedPaths);
      }
      throw writeErr;
    }

    // 3. Depois de updateDoc bem-sucedido remova do Storage somente os imagePaths antigos substituídos
    for(const oldPath of replacedOldPaths){
      try{
        await deleteObject(ref(storage,oldPath));
      }catch(delErr){
        if(!isStorageNotFoundError(delErr)){
          console.warn('Não foi possível remover arquivo antigo substituído:',oldPath,delErr);
        }
      }
    }

    msg.textContent='Anúncio atualizado com sucesso.';
    setTimeout(()=>location.reload(),500);
  }catch(e){
    console.error(e);
    msg.textContent='Erro ao salvar: '+(e?.message||e);
    saveBtn.disabled=false;
  }finally{
    isSaving=false;
  }
}

async function enhanceAdminCards(){
  if(location.pathname!='/admin'||!auth.currentUser)return;
  const cards=[...document.querySelectorAll('.admin-product')];
  if(!cards.length)return;
  let products=[];
  try{products=await getProducts()}catch(e){console.error('Falha ao preparar editor completo:',e);return;}
  cards.forEach(card=>{
    const oldEdit=card.querySelector('.edit-product');
    const id=oldEdit?.dataset.id||card.querySelector('.del-product')?.dataset.id||card.querySelector('[data-id]')?.dataset.id;
    const product=products.find(p=>p.id===id);
    if(!product)return;
    if(!card.querySelector('.full-edit-product')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn full-edit-product';
      btn.textContent='Editar anúncio';
      btn.onclick=()=>openEditor(product);
      const actions=card.querySelector('.actions')||card;
      actions.prepend(btn);
    }
    oldEdit?.remove();
  });
}

const observer=new MutationObserver(()=>setTimeout(enhanceAdminCards,30));
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(enhanceAdminCards,500);
