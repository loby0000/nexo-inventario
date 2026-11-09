// Injected ONLY by the loopback QA server. This file is not a Vite entry point
// and never becomes part of the deployed application or its offline shell.
(() => {
  const quotaKey='nexo-qa-quota';
  for(const method of ['add','put']) {
    const original=IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method]=function(...args) {
      if(sessionStorage.getItem(quotaKey)==='full')
        throw new DOMException('Almacenamiento de prueba lleno (fallo simulado QA).','QuotaExceededError');
      return original.apply(this,args);
    };
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const panel=document.createElement('aside');
    panel.setAttribute('aria-label','Controles de fallos QA');
    panel.style.cssText='position:fixed;right:8px;bottom:8px;z-index:99999;padding:12px;background:#fff3cd;color:#222;border:2px solid #856404;max-width:360px;font:13px sans-serif';
    const label=document.createElement('strong');label.textContent='Solo QA local · fallos simulados';panel.append(label);
    const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
    const add=(name,run)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.style.margin='4px';b.onclick=async()=>{try{await run();}catch{status.textContent='No se pudo cambiar el fallo QA';}};panel.append(b);};
    add('QA: API sin conexión',async()=>{await fetch('/qa/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({online:false})});status.textContent='API simulada sin conexión';});
    add('QA: restaurar API',async()=>{await fetch('/qa/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({online:true})});status.textContent='API disponible';});
    add('QA: llenar almacenamiento',()=>{sessionStorage.setItem(quotaKey,'full');status.textContent='QuotaExceededError activo; no se llenó el disco real';});
    add('QA: restaurar almacenamiento',()=>{sessionStorage.removeItem(quotaKey);status.textContent='Almacenamiento disponible';});
    add('QA: caducar sesión',async()=>{await fetch('/qa/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valid:false})});status.textContent='Servidor rechaza la sesión; inicia sesión para restaurarla';});
    document.body.append(panel);
  });
})();
