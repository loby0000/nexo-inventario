import {useEffect,useRef} from 'react';
let depth=0,priorOverflow='';
// Every dialog follows the same keyboard rules, including nested camera dialogs.
export function useDialog(active:boolean,onClose:()=>void,busy=false) {
  const close=useRef(onClose),locked=useRef(busy);close.current=onClose;locked.current=busy;
  useEffect(()=>{
    if(!active)return;
    const prior=document.activeElement as HTMLElement|null;
    const dialogs=document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog=dialogs[dialogs.length-1];if(!dialog)return;
    if(depth++===0){priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    const firstInput=dialog.querySelector<HTMLElement>('input:not([type="hidden"]),select,textarea');
    (firstInput??dialog.querySelector<HTMLElement>('button'))?.focus();
    function key(e:KeyboardEvent){
      const all=document.querySelectorAll('[role="dialog"]');
      if(all[all.length-1]!==dialog)return;
      if(e.key==='Escape'&&!locked.current){e.preventDefault();close.current();}
      if(e.key==='Tab'){
        const nodes=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(n=>n.getClientRects().length>0);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);if(--depth===0)document.body.style.overflow=priorOverflow;if(prior?.isConnected)prior.focus();};
  },[active]);
}
