function currentProductDetail(){
  const app=document.querySelector('#app');
  const layout=app?.querySelector('.product-detail-layout');
  const title=layout?.querySelector('.product-detail-info h1')?.textContent?.trim();
  const productId=layout?.dataset.productId||'';
  if(!layout||!title)return null;
  return {app,layout,title,productId};
}

function ensureStyle(){
  if(document.querySelector('#criartShareStyle'))return;
  const style=document.createElement('style');
  style.id='criartShareStyle';
  style.textContent=`
    .criart-share-btn{display:inline-flex;align-items:center;gap:8px}
    .criart-share-status{margin-top:10px;font-size:.9rem}
  `;
  document.head.appendChild(style);
}

function publicShareUrl(productId){
  if(!productId)return location.href;
  const u=new URL('/produtos',location.origin);
  u.searchParams.set('produto',productId);
  return u.toString();
}

async function shareProduct(title,productId,button,status){
  const url=publicShareUrl(productId);
  const shareData={
    title:`${title} | CRIART 3D`,
    text:`Confira este produto da CRIART 3D: ${title}`,
    url
  };
  try{
    if(navigator.share){
      await navigator.share(shareData);
      if(status)status.textContent='Produto compartilhado.';
      return;
    }
    await navigator.clipboard.writeText(url);
    if(status)status.textContent='Link copiado para a área de transferência.';
    const old=button.textContent;
    button.textContent='✓ Link copiado';
    setTimeout(()=>button.textContent=old,1800);
  }catch(e){
    if(e?.name==='AbortError')return;
    try{
      const input=document.createElement('textarea');
      input.value=url;
      input.style.position='fixed';input.style.opacity='0';
      document.body.appendChild(input);input.select();
      document.execCommand('copy');input.remove();
      if(status)status.textContent='Link copiado para a área de transferência.';
    }catch{
      if(status)status.textContent='Não foi possível compartilhar agora.';
    }
  }
}

function mountShare(){
  const detail=currentProductDetail();
  if(!detail)return;
  const {layout,title,productId}=detail;
  if(layout.querySelector('.criart-share-btn'))return;
  ensureStyle();
  const actions=layout.querySelector('.product-detail-info .actions');
  if(!actions)return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='btn secondary criart-share-btn';
  btn.innerHTML='<span aria-hidden="true">↗</span> Compartilhar';
  const status=document.createElement('div');
  status.className='muted criart-share-status';
  status.setAttribute('aria-live','polite');
  btn.addEventListener('click',()=>shareProduct(title,productId,btn,status));
  actions.appendChild(btn);
  actions.insertAdjacentElement('afterend',status);
}

let timer=null;
const schedule=()=>{clearTimeout(timer);timer=setTimeout(mountShare,40)};
new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
window.addEventListener('popstate',schedule);
window.addEventListener('pageshow',schedule);
schedule();
