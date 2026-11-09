import {X,Layers,type LucideIcon} from 'lucide-react';
export function ModalHeading({title,eyebrow,description,onClose,busy=false,id,icon:Icon=Layers}:{title:string;eyebrow:string;description?:string;onClose:()=>void;busy?:boolean;id?:string;icon?:LucideIcon}) {
  return <header className="dialog-heading"><span className="dialog-symbol"><Icon size={22}/></span><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2>{description&&<p>{description}</p>}</div><button className="close" type="button" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={19}/></button></header>;
}
