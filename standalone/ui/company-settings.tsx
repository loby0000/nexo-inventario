import {useState,type FormEvent} from 'react';
import {Building2,Users,Mail,ShieldCheck,ArrowUpRight,UserPlus,LockKeyhole,Coins,History,UserRound,Trash2} from 'lucide-react';
import type {Data} from './inventory';
import {useDialog} from "./use-dialog";
import {ModalHeading} from './modal-heading';
type Save=(body:Record<string,unknown>,message:string)=>Promise<boolean>;
export function CompanySettings({data,busy,onEdit,onSave}:{data:Data;busy:boolean;onEdit:()=>void;onSave:Save}) {
  const admin=data.user.role==='admin';
  const [email,setEmail]=useState(''),[selected,setSelected]=useState<Data['members'][number]|null>(null);
  useDialog(!!selected,()=>setSelected(null),busy);
  const members=admin?data.members.filter(m=>m.accepted):[],invites=admin?data.members.filter(m=>!m.accepted):[];
  async function invite(e:FormEvent){e.preventDefault();if(await onSave({action:'member',email},'Invitación enviada por correo.'))setEmail('');}
  return <div className="settings-layout">
    <section className="card business-profile">
      <div className="business-profile-icon"><Building2 size={27}/></div>
      <div><span className="eyebrow">EMPRESA ACTUAL</span><h2>{data.workspace.name}</h2><p>{data.workspace.description&&data.workspace.description!==data.workspace.name?data.workspace.description:'El catálogo, las operaciones y el equipo de tu negocio.'}</p></div>
      {admin&&<button className="btn" onClick={onEdit}>Editar empresa<ArrowUpRight size={15}/></button>}
    </section>
    <div className="settings-main">
      <section className="card team-card">
        <div className="settings-section-heading"><span className="settings-section-icon"><Users size={19}/></span><div><h3>Equipo de trabajo</h3><p>{admin?`${members.length+1} ${members.length?"personas con acceso":"persona con acceso"} a esta empresa`:"Tu acceso a esta empresa"}</p></div>{admin&&<span className="settings-count">{members.length+1}</span>}</div>
        <div className="team-list">
          <div className="team-person"><span className="team-avatar"><UserRound size={18}/></span><div className="team-person-info"><strong>{data.user.email}</strong><small>Tu cuenta <span className="you-tag">Tú</span></small></div><span className={`role-pill ${admin?'admin':''}`}>{admin?'Administrador':'Empleado'}</span></div>
          {members.map(m=><div className="team-person" key={m.id}><span className="team-avatar">{m.email.slice(0,2).toUpperCase()}</span><div className="team-person-info"><strong>{m.email}</strong><small>Puede consultar y registrar ventas</small></div><span className="role-pill">Empleado</span>{admin&&<button className="icon-action danger-text" aria-label={`Revocar acceso de ${m.email}`} onClick={()=>setSelected(m)} disabled={busy}><Trash2 size={16}/></button>}</div>)}
        </div>
        {!members.length&&<div className="team-empty"><UserPlus size={22}/><div><strong>Tu equipo empieza contigo</strong><p>{admin?'Invita a una persona para que pueda registrar ventas.':'El administrador gestiona las personas de este equipo.'}</p></div></div>}
      </section>
      {admin&&<section className="card invitations-card"><div className="settings-section-heading"><span className="settings-section-icon"><Mail size={19}/></span><div><h3>Invitaciones</h3><p>El acceso comienza cuando la persona acepta.</p></div><span className="settings-count">{invites.length}</span></div>
        {invites.length?<div className="invitation-list">{invites.map(m=><div className="invitation-item" key={m.id}><span className="team-avatar pending-avatar"><Mail size={17}/></span><div className="team-person-info"><strong>{m.email}</strong><small>Empleado · Pendiente de aceptar</small></div><div className="invitation-actions"><button className="text-btn" disabled={busy} onClick={()=>void onSave({action:'resendInvitation',id:m.id},'Invitación reenviada.')}>Reenviar</button><button className="text-btn danger-text" disabled={busy} onClick={()=>setSelected(m)}>Cancelar</button></div></div>)}</div>:<div className="no-invitations"><Mail size={21}/><p>No hay invitaciones pendientes.</p></div>}
        <p className="settings-footnote">Las invitaciones caducan a los 7 días y solo pueden aceptarse con el correo al que se enviaron.</p>
      </section>}
      <section className="card business-rules"><div className="settings-section-heading"><span className="settings-section-icon"><History size={19}/></span><div><h3>Información del inventario</h3><p>Reglas que mantienen tu historial en orden.</p></div></div><div className="business-rules-grid"><div><Coins size={18}/><span>Moneda<strong>Peso colombiano · COP</strong></span></div><div><History size={18}/><span>Historial<strong>Movimientos y productos con trazabilidad</strong></span></div></div><p className="settings-footnote">Los productos con movimientos se archivan. Para corregir existencias, registra un movimiento y explica el motivo.</p></section>
    </div>
    <aside className="settings-side">
      {admin&&<section className="card invite-card"><span className="invite-card-symbol"><UserPlus size={23}/></span><h3>Haz crecer tu equipo</h3><p>Envía una invitación para trabajar juntos en <strong>{data.workspace.name}</strong>.</p><form onSubmit={invite}><label htmlFor="invite-email">Correo electrónico</label><input id="invite-email" name="email" type="email" required maxLength={160} autoComplete="email" placeholder="persona@negocio.com" value={email} onChange={e=>setEmail(e.target.value)}/><div className="invite-role"><UserRound size={16}/><span>Acceso de empleado<small>Consulta del inventario y registro de ventas</small></span><LockKeyhole size={14}/></div><button className="btn primary" disabled={busy}><Mail size={16}/>{busy?'Enviando…':'Enviar invitación'}</button></form><small className="invite-note"><ShieldCheck size={14}/>Solo tendrá acceso a esta empresa.</small></section>}
      <section className="card permissions-card"><h3><ShieldCheck size={18}/>Roles y permisos</h3><div><span className="role-pill admin">Administrador</span><p>Gestiona productos, compras, ventas, equipo y conflictos de sincronización.</p></div><div><span className="role-pill">Empleado</span><p>Consulta el inventario y registra ventas. No modifica el catálogo, compras ni permisos.</p></div></section>
    </aside>
    {selected&&<div className="modal-backdrop"><section className="modal confirmation-modal" role="dialog" aria-modal="true" aria-label={selected.accepted?'Revocar acceso':'Cancelar invitación'}><ModalHeading eyebrow="EQUIPO Y ACCESOS" title={selected.accepted?'¿Revocar este acceso?':'¿Cancelar la invitación?'} icon={ShieldCheck} onClose={()=>setSelected(null)} busy={busy}/><p className="dialog-description"><strong>{selected.email}</strong>{selected.accepted?' dejará de tener acceso a esta empresa. Podrás invitar a esta persona nuevamente.':' ya no podrá aceptar esta invitación. Podrás enviarle una nueva cuando quieras.'}</p><div className="modal-footer"><button className="btn" onClick={()=>setSelected(null)} disabled={busy}>Volver</button><button className="btn danger" disabled={busy} onClick={async()=>{if(await onSave({action:'removeMember',id:selected.id},selected.accepted?'Acceso revocado.':'Invitación cancelada.'))setSelected(null);}}>{busy?'Guardando…':selected.accepted?'Revocar acceso':'Cancelar invitación'}</button></div></section></div>}
  </div>;
}
