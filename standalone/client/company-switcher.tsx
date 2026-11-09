import {useEffect,useId,useRef,useState} from 'react';
import {Building2,Check,ChevronDown,Search,ArrowUpRight} from 'lucide-react';
type Company={owner:string;name:string;role:string};
export function CompanySwitcher({companies,value,onChange,onManage}:{companies:Company[];value:string;onChange:(id:string)=>void;onManage:()=>void}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null);
  const id=useId();
  const selected=companies.find(c=>c.owner===value);
  const filtered=companies.filter(c=>c.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  useEffect(()=>{
    if(!open) return;
    search.current?.focus();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  function close(){setOpen(false);trigger.current?.focus();}
  function choose(company:Company){onChange(company.owner);close();}
  return <div className="company-switcher" ref={root} onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();close();}
    if(open&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();setActive(i=>filtered.length?(i+(e.key==='ArrowDown'?1:-1)+filtered.length)%filtered.length:0);}
    if(open&&e.key==='Enter'&&e.target===search.current){e.preventDefault();if(filtered[active])choose(filtered[active]);}
  }}>
    <button className="company-trigger" type="button" ref={trigger} aria-label={`Cambiar empresa: ${selected?.name ?? 'Selecciona una empresa'}`} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?id:undefined} onClick={()=>{setQuery('');setActive(0);setOpen(v=>!v);}}>
      <span className="company-trigger-icon"><Building2 size={17}/></span><span>{selected?.name ?? 'Selecciona una empresa'}</span><ChevronDown size={15}/>
    </button>
    {open&&<div className="company-popover">
      <div className="company-search"><Search size={16}/><input ref={search} aria-label="Buscar empresa" role="combobox" aria-expanded="true" aria-controls={id} aria-activedescendant={filtered[active]?`${id}-${active}`:undefined} autoComplete="off" placeholder="Buscar una empresa…" value={query} onChange={e=>{setQuery(e.target.value);setActive(0);}}/></div>
      <p className="menu-caption">TUS EMPRESAS · {companies.length}</p>
      <div id={id} role="listbox" aria-label="Empresas disponibles" className="company-options">
        {filtered.map((c,i)=><button type="button" role="option" id={`${id}-${i}`} aria-selected={c.owner===value} className={`company-option ${active===i?'highlighted':''}`} key={c.owner} onMouseEnter={()=>setActive(i)} onClick={()=>choose(c)}><span className="company-option-avatar">{c.name.slice(0,1).toUpperCase()}</span><span><strong>{c.name}</strong><small>{c.role==='admin'?'Administrador':'Empleado'}</small></span>{c.owner===value&&<Check size={16}/>}</button>)}
        {!filtered.length&&<p className="company-no-results">No encontramos esa empresa.</p>}
      </div>
      <button type="button" className="company-manage" onClick={()=>{close();onManage();}}>Empresas e invitaciones<ArrowUpRight size={15}/></button>
    </div>}
  </div>;
}
