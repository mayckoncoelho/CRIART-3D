// Mantém os cards públicos compactos em todas as navegações internas da SPA.
// A descrição completa continua disponível somente na página de detalhes.
(function(){
  const isPublicCatalogRoute=()=>{
    const p=location.pathname.replace(/\/$/,'')||'/';
    return p==='/'||p==='/produtos';
  };

  function cleanup(){
    if(!isPublicCatalogRoute()) return;
    document.querySelectorAll('#app .product-card .product-body > p.muted').forEach(el=>el.remove());
  }

  const app=document.querySelector('#app');
  if(app){
    new MutationObserver(cleanup).observe(app,{childList:true,subtree:true});
  }

  window.addEventListener('popstate',()=>setTimeout(cleanup,0));
  window.addEventListener('pageshow',cleanup);
  document.addEventListener('click',e=>{
    if(e.target.closest('a[data-link],a[href="/"],a[href="/produtos"]')) setTimeout(cleanup,50);
  });

  cleanup();
})();
