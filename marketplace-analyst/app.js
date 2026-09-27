(() => {
  const STORAGE_KEY = "criart.marketplaceAnalyst.config.v1";
  const defaultRiskTerms = ["NP","P0","P zero","pizero","não pago","não transfere","sem transferência","multas","IPVA atrasado","licenciamento atrasado","problema com último dono","sem recibo","sem ATPV","alienado","gravame","busca e apreensão","restrição judicial","restrição administrativa","inventário","proprietário falecido","só para interior","só para sítio"];
  const $ = (id) => document.getElementById(id);
  const state = { searches: [], sources: [], riskTerms: [...defaultRiskTerms] };

  function num(id){ const v=$(id).value.trim(); return v===""?null:Number(v); }
  function readForm(){
    return {
      version:1,
      updatedAt:new Date().toISOString(),
      monitoringEnabled:$("monitoringEnabled").checked,
      homeRegion:$("homeRegion").value.trim(),
      defaultRadiusKm:num("defaultRadius"),
      expandedRadiusKm:num("expandedRadius"),
      maxInvestment:num("maxInvestment"),
      minimumProfit:num("minimumProfit"),
      minimumMarginPercent:num("minimumMarginPercent"),
      distanceCostPerKm:num("distanceCostPerKm"),
      transferCostDefault:num("transferCost"),
      maintenanceReserveDefault:num("maintenanceReserve"),
      riskReserveDefault:num("riskReserve"),
      includeRiskyListings:$("includeRisky").checked,
      crossDemand:$("crossDemand").checked,
      showPreviouslyAnalyzed:$("saveDuplicates").checked,
      publicActionsRequireApproval:true,
      checkIntervalMinutes:Number($("checkInterval").value),
      alertChannel:$("alertChannel").value,
      alertProfitMinimum:num("alertProfit"),
      alertNewDemand:$("alertDemand").value==="yes",
      riskTerms:[...state.riskTerms],
      searches:[...state.searches],
      sources:[...state.sources]
    };
  }
  function setVal(id,v){ if(v!==undefined&&v!==null) $(id).value=v; }
  function applyConfig(c){
    $("monitoringEnabled").checked=c.monitoringEnabled!==false;
    setVal("homeRegion",c.homeRegion); setVal("defaultRadius",c.defaultRadiusKm??100); setVal("expandedRadius",c.expandedRadiusKm??300);
    setVal("maxInvestment",c.maxInvestment); setVal("minimumProfit",c.minimumProfit); setVal("minimumMarginPercent",c.minimumMarginPercent);
    setVal("distanceCostPerKm",c.distanceCostPerKm); setVal("transferCost",c.transferCostDefault); setVal("maintenanceReserve",c.maintenanceReserveDefault); setVal("riskReserve",c.riskReserveDefault);
    $("includeRisky").checked=c.includeRiskyListings!==false; $("crossDemand").checked=c.crossDemand!==false; $("saveDuplicates").checked=!!c.showPreviouslyAnalyzed;
    setVal("checkInterval",c.checkIntervalMinutes??30); setVal("alertChannel",c.alertChannel??"telegram"); setVal("alertProfit",c.alertProfitMinimum); setVal("alertDemand",c.alertNewDemand===false?"no":"yes");
    state.searches=Array.isArray(c.searches)?c.searches:[]; state.sources=Array.isArray(c.sources)?c.sources:[]; state.riskTerms=Array.isArray(c.riskTerms)&&c.riskTerms.length?c.riskTerms:[...defaultRiskTerms];
    renderAll();
  }
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
  function money(v){return v==null||v===""?"—":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});}
  function renderSearches(){
    const el=$("searchList");
    if(!state.searches.length){el.innerHTML='<article class="card"><strong>Nenhuma busca cadastrada.</strong><p>Use “+ Nova busca” para criar o primeiro perfil.</p></article>';return;}
    el.innerHTML=state.searches.map((s,i)=>`<article class="search-item"><div><strong>${esc(s.name)}</strong><span class="meta">${esc(s.category)} · ${s.yearMin||"qualquer ano"}–${s.yearMax||"atual"}</span></div><div><span class="meta">Compra máxima</span><strong>${money(s.maxPrice)}</strong></div><div><span class="meta">Lucro mínimo</span><strong>${money(s.minProfit)}</strong></div><div><span class="meta">Raio</span><strong>${s.radius||"padrão"} km</strong></div><div><span class="pill">ATIVA</span></div><button class="danger-link" data-remove-search="${i}">Remover</button></article>`).join("");
  }
  function renderSources(){
    const el=$("sourceList");
    if(!state.sources.length){el.innerHTML='<p class="meta">Nenhuma fonte cadastrada ainda.</p>';return;}
    el.innerHTML=state.sources.map((s,i)=>`<article class="source-item" style="grid-template-columns:180px 1fr 1.4fr auto"><span class="pill">${esc(s.type)}</span><strong>${esc(s.name)}</strong><a class="meta" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url||"sem link")}</a><button class="danger-link" data-remove-source="${i}">Remover</button></article>`).join("");
  }
  function renderRisk(){
    $("riskTerms").innerHTML=state.riskTerms.map((t,i)=>`<span class="risk-chip">${esc(t)}<button data-remove-risk="${i}" title="Remover">×</button></span>`).join("");
  }
  function updateSummary(){
    const c=readForm();
    $("statusText").textContent=c.monitoringEnabled?"Ativo":"Pausado";
    $("activeSearchCount").textContent=state.searches.length;
    $("radiusSummary").textContent=(c.defaultRadiusKm||0)+" km";
    $("profitSummary").textContent=c.minimumProfit?money(c.minimumProfit):"Não definido";
    const lines=[
      "Monitoramento: "+(c.monitoringEnabled?"ATIVO":"PAUSADO"),
      "Região: "+(c.homeRegion||"não definida"),
      "Raio: "+(c.defaultRadiusKm||"—")+" km → "+(c.expandedRadiusKm||"—")+" km",
      "Buscas ativas: "+state.searches.length,
      "Lucro mínimo padrão: "+money(c.minimumProfit),
      "Margem mínima: "+(c.minimumMarginPercent==null?"—":c.minimumMarginPercent+"%"),
      "Cruzamento demanda × oferta: "+(c.crossDemand?"sim":"não"),
      "Risco documental: "+(c.includeRiskyListings?"coletar e classificar":"ocultar no painel"),
      "Verificação: a cada "+c.checkIntervalMinutes+" min",
      "Alertas: "+(c.alertChannel==="telegram"?"Telegram":"somente painel")
    ];
    $("agentSummary").textContent=lines.join("\n");
  }
  function renderAll(){renderSearches();renderSources();renderRisk();updateSummary();}
  function save(){
    const c=readForm(); localStorage.setItem(STORAGE_KEY,JSON.stringify(c));
    $("saveState").textContent="Salvo em "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    updateSummary();
  }
  function load(){try{const raw=localStorage.getItem(STORAGE_KEY); if(raw) applyConfig(JSON.parse(raw)); else renderAll();}catch{renderAll();}}

  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
  document.querySelectorAll("[data-section-jump]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.sectionJump)));
  function showSection(id){document.querySelectorAll(".panel-section").forEach(s=>s.classList.toggle("active",s.id===id));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.section===id));}

  document.querySelectorAll("input,select,textarea").forEach(el=>el.addEventListener("input",updateSummary));
  $("saveBtn").addEventListener("click",save);
  $("exportBtn").addEventListener("click",()=>{const data=JSON.stringify(readForm(),null,2);const blob=new Blob([data],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="marketplace-analyst-config.json";a.click();URL.revokeObjectURL(a.href);});
  $("addSearchBtn").addEventListener("click",()=>$("searchDialog").showModal());
  $("confirmSearchBtn").addEventListener("click",(e)=>{e.preventDefault();const f=new FormData($("searchForm")); if(!f.get("name")) return; state.searches.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:String(f.get("name")),category:String(f.get("category")),yearMin:f.get("yearMin")?Number(f.get("yearMin")):null,yearMax:f.get("yearMax")?Number(f.get("yearMax")):null,maxPrice:f.get("maxPrice")?Number(f.get("maxPrice")):null,minProfit:f.get("minProfit")?Number(f.get("minProfit")):null,radius:f.get("radius")?Number(f.get("radius")):null,expandedRadius:f.get("expandedRadius")?Number(f.get("expandedRadius")):null,notes:String(f.get("notes")||""),enabled:true});$("searchForm").reset();$("searchDialog").close();renderAll();save();});
  $("searchList").addEventListener("click",e=>{const b=e.target.closest("[data-remove-search]");if(b){state.searches.splice(Number(b.dataset.removeSearch),1);renderAll();save();}});
  $("addRiskBtn").addEventListener("click",()=>{const v=$("newRiskTerm").value.trim();if(v&&!state.riskTerms.some(x=>x.toLowerCase()===v.toLowerCase())){state.riskTerms.push(v);$("newRiskTerm").value="";renderRisk();save();}});
  $("riskTerms").addEventListener("click",e=>{const b=e.target.closest("[data-remove-risk]");if(b){state.riskTerms.splice(Number(b.dataset.removeRisk),1);renderRisk();save();}});
  $("addSourceBtn").addEventListener("click",()=>{const name=$("sourceName").value.trim(),url=$("sourceUrl").value.trim();if(!name)return;state.sources.push({type:$("sourceType").value,name,url,enabled:true});$("sourceName").value="";$("sourceUrl").value="";renderSources();save();});
  $("sourceList").addEventListener("click",e=>{const b=e.target.closest("[data-remove-source]");if(b){state.sources.splice(Number(b.dataset.removeSource),1);renderSources();save();}});
  load();
})();