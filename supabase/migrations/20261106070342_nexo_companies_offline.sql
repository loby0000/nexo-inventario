-- Additive migration. No existing business is moved until an owner-authorized transfer.
-- The service-only invoker reads only verified identity columns, never password data.
grant select(id,email,email_confirmed_at) on auth.users to service_role;
create table nexo.companies(id uuid primary key,name text not null check(length(name) between 2 and 60),created_by uuid not null references auth.users(id),revision bigint not null default 0,created_at timestamptz not null default now());
create table nexo.company_members(company_id uuid references nexo.companies(id),user_id uuid references auth.users(id),role text not null check(role in('admin','operator')),primary key(company_id,user_id));
create index company_members_user on nexo.company_members(user_id);
create table nexo.company_invitations(id uuid primary key default gen_random_uuid(),company_id uuid not null references nexo.companies(id),email text not null check(length(email)<=160),expires_at timestamptz not null default now()+interval '7 days',sent_at timestamptz,unique(company_id,email));
create index company_invites_email on nexo.company_invitations(email);
create table nexo.devices(id uuid not null,user_id uuid references auth.users(id),company_id uuid references nexo.companies(id),validated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',primary key(id,user_id,company_id));
create table nexo.sync_operations(id uuid primary key,company_id uuid not null references nexo.companies(id),user_id uuid not null references auth.users(id),payload jsonb not null,payload_hash text not null,dependencies uuid[] not null default '{}',client_created_at timestamptz not null,received_at timestamptz not null default now(),state text not null check(state in('pending','synced','conflict','cancelled')),error text,reason text,resolved_by uuid references auth.users(id),resolved_at timestamptz);
create index sync_company_state on nexo.sync_operations(company_id,state);
create table nexo.business_transfers(token_hash text primary key,legacy_owner text not null,expires_at timestamptz not null default now()+interval '15 minutes',claimed_by uuid references auth.users(id),company_id uuid references nexo.companies(id));
create table nexo.frozen_legacy_owners(owner text primary key,company_id uuid not null references nexo.companies(id),frozen_at timestamptz not null default now());
create table nexo.transfer_backups(company_id uuid primary key references nexo.companies(id),legacy_owner text not null,snapshot jsonb not null,created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['companies','company_members','company_invitations','devices','sync_operations','business_transfers','frozen_legacy_owners','transfer_backups'] loop execute format('alter table nexo.%I enable row level security',t);execute format('revoke all on nexo.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on nexo.%I to service_role',t);end loop;end $$;

-- Service-only wrapper preserves the legacy application, and blocks it after cutover.
alter function public.nexo_gateway(text,text,text,text,text,jsonb,uuid) rename to nexo_legacy_gateway;
create function public.nexo_gateway(p_user text,p_email text,p_name text,p_workspace text,p_method text,p_body jsonb,p_nonce uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare token text;
begin
 if current_user not in('service_role','postgres') then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('nexo-owner:'||coalesce(nullif(p_workspace,''),p_user),0));
 if exists(select 1 from nexo.frozen_legacy_owners where owner=coalesce(nullif(p_workspace,''),p_user)) then raise exception 'NEXO:Este negocio se trasladó a la nueva versión de Nexo.';end if;
 if p_method='POST' and p_body->>'action'='createTransfer' then
  if coalesce(nullif(p_workspace,''),p_user)<>p_user then raise exception 'NEXO:Solo el propietario puede trasladar este negocio.';end if;
  if exists(select 1 from nexo.products p where p.owner=p_user and p.stock<>coalesce((select sum(case when m.type='in' then m.quantity else -m.quantity end) from nexo.movements m where m.product_id=p.id and m.owner=p_user),0)) then raise exception 'NEXO:Las existencias no coinciden con el historial. Revisa antes de trasladar.';end if;
  if (select count(*) from nexo.business_transfers where legacy_owner=p_user and expires_at>now()+interval '14 minutes')>=5 then raise exception 'NEXO:Espera un minuto antes de generar otro código.';end if;
  insert into nexo.transport_requests(nonce,user_id) values(p_nonce,p_user);
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into nexo.business_transfers(token_hash,legacy_owner) values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_user);
  return jsonb_build_object('token',token,'expiresIn',900);
 end if;
 return public.nexo_legacy_gateway(p_user,p_email,p_name,p_workspace,p_method,p_body,p_nonce);
end $$;
revoke all on function public.nexo_gateway(text,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nexo_gateway(text,text,text,text,text,jsonb,uuid) to service_role;

-- A receipt carries canonical rows so a connection lost immediately after commit
-- cannot leave the local cache behind an operation already marked as synchronized.
create function nexo.sync_receipt(p_company uuid,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object('state','synced','revision',(select revision from nexo.companies where id=p_company),
 'products',coalesce((select jsonb_agg(to_jsonb(p)) from nexo.products p where p.owner=p_company::text and (p.id=p_id::text or p.id in(select m.product_id from nexo.movements m where m.owner=p_company::text and m.document_id=p_id::text))),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)) from nexo.documents d where d.owner=p_company::text and d.id=p_id::text),'[]'),
 'movements',coalesce((select jsonb_agg(to_jsonb(x)) from(select m.*,p.name product_name,p.sku from nexo.movements m join nexo.products p on p.id=m.product_id where m.owner=p_company::text and m.document_id=p_id::text)x),'[]'));
$$;
revoke all on function nexo.sync_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function nexo.sync_receipt(uuid,uuid) to service_role;

create function public.nexo_v2_gateway(p_user uuid,p_company uuid,p_action text,p_body jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare email text;role text;result jsonb;company_list jsonb;invite_list jsonb;inv nexo.company_invitations%rowtype;op nexo.sync_operations%rowtype;transfer nexo.business_transfers%rowtype;cid uuid;hash text;err text;member_list jsonb;device_exp timestamptz;
begin
 if current_user not in('service_role','postgres') then raise insufficient_privilege;end if;
 select lower(u.email) into email from auth.users u where u.id=p_user and u.email_confirmed_at is not null;
 if email is null then raise exception 'NEXO:Inicia sesión con un correo verificado.';end if;
 perform pg_advisory_xact_lock(hashtextextended('v2-user:'||p_user,0));
 delete from nexo.transport_requests where user_id='v2:'||p_user and created_at<now()-interval '1 hour';
 if (select count(*) from nexo.transport_requests where user_id='v2:'||p_user and created_at>now()-interval '1 minute')>=240 then raise exception 'NEXO:Demasiadas solicitudes. Espera un minuto.';end if;
 insert into nexo.transport_requests(nonce,user_id) values(gen_random_uuid(),'v2:'||p_user);
 select coalesce(jsonb_agg(jsonb_build_object('owner',c.id,'name',c.name,'role',m.role) order by c.name),'[]') into company_list from nexo.companies c join nexo.company_members m on m.company_id=c.id where m.user_id=p_user;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',c.name,'expiresAt',i.expires_at)),'[]') into invite_list from nexo.company_invitations i join nexo.companies c on c.id=i.company_id where i.email=email and i.expires_at>now();
 if p_action='bootstrap' then return jsonb_build_object('workspaces',company_list,'invitations',invite_list,'user',jsonb_build_object('id',p_user,'email',email));end if;
 if p_action='createCompany' then
  cid:=(p_body->>'id')::uuid;
  if exists(select 1 from nexo.companies where id=cid and created_by=p_user) then return jsonb_build_object('id',cid);end if;
  insert into nexo.companies(id,name,created_by) values(cid,trim(p_body->>'name'),p_user);
  insert into nexo.company_members values(cid,p_user,'admin');
  insert into nexo.workspaces(owner,name,description) values(cid::text,trim(p_body->>'name'),'');return jsonb_build_object('id',cid);
 end if;
 if p_action='acceptInvitation' then
  select * into inv from nexo.company_invitations where id=(p_body->>'id')::uuid and company_invitations.email=email and expires_at>now() for update;
  if not found then raise exception 'NEXO:La invitación no está disponible para este correo o caducó.';end if;
  insert into nexo.company_members values(inv.company_id,p_user,'operator') on conflict do nothing;delete from nexo.company_invitations where id=inv.id;return jsonb_build_object('id',inv.company_id);
 end if;
 if p_action='claimTransfer' then
  select * into transfer from nexo.business_transfers where token_hash=encode(sha256(convert_to(p_body->>'token','UTF8')),'hex') and expires_at>now() and claimed_by is null for update;
  if not found then raise exception 'NEXO:El código de traslado no es válido o caducó.';end if;
  perform pg_advisory_xact_lock(hashtextextended('nexo-owner:'||transfer.legacy_owner,0));
  if exists(select 1 from nexo.frozen_legacy_owners where owner=transfer.legacy_owner) then raise exception 'NEXO:El negocio ya fue trasladado.';end if;
  if exists(select 1 from nexo.products p where p.owner=transfer.legacy_owner and p.stock<>coalesce((select sum(case when m.type='in' then m.quantity else -m.quantity end) from nexo.movements m where m.product_id=p.id and m.owner=transfer.legacy_owner),0)) then raise exception 'NEXO:Las existencias no coinciden con el historial.';end if;
  cid:=gen_random_uuid();insert into nexo.companies(id,name,created_by) values(cid,coalesce((select name from nexo.workspaces where owner=transfer.legacy_owner),'Mi negocio'),p_user);insert into nexo.company_members values(cid,p_user,'admin');
  insert into nexo.transfer_backups(company_id,legacy_owner,snapshot) values(cid,transfer.legacy_owner,jsonb_build_object('products',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from nexo.products p where owner=transfer.legacy_owner),'movements',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from nexo.movements m where owner=transfer.legacy_owner),'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from nexo.documents d where owner=transfer.legacy_owner),'requests',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from nexo.requests r where owner=transfer.legacy_owner),'workspace',(select to_jsonb(w) from nexo.workspaces w where owner=transfer.legacy_owner),'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from nexo.members m where owner=transfer.legacy_owner)));
  insert into nexo.frozen_legacy_owners values(transfer.legacy_owner,cid,now());
  update nexo.products set owner=cid::text where owner=transfer.legacy_owner;update nexo.documents set owner=cid::text where owner=transfer.legacy_owner;update nexo.movements set owner=cid::text where owner=transfer.legacy_owner;update nexo.requests set owner=cid::text where owner=transfer.legacy_owner;update nexo.workspaces set owner=cid::text where owner=transfer.legacy_owner;
  if not exists(select 1 from nexo.workspaces where owner=cid::text) then insert into nexo.workspaces(owner,name,description) select id::text,name,'' from nexo.companies where id=cid;end if;
  -- Legacy invitations are not silently bound to new identities. Reissue them explicitly.
  update nexo.business_transfers set claimed_by=p_user,company_id=cid where token_hash=transfer.token_hash;
  return jsonb_build_object('id',cid);
 end if;
 select m.role into role from nexo.company_members m where m.company_id=p_company and m.user_id=p_user;
 if role is null then raise exception 'NEXO:No tienes acceso a esta empresa.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nexo-owner:'||p_company,0));
 if p_action='inventory' then
  result:=public.nexo_gateway(p_company::text,email,email,p_company::text,'GET','{}',gen_random_uuid());
  -- Build explicitly to avoid dependence on anonymous composite row naming.
  select coalesce(jsonb_agg(x),'[]') into member_list from (select m.user_id::text as id,u.email,m.role,1 as accepted from nexo.company_members m join auth.users u on u.id=m.user_id where m.company_id=p_company and m.user_id<>p_user union all select i.id::text,i.email,'operator',0 from nexo.company_invitations i where i.company_id=p_company)x;
  return result||jsonb_build_object('members',case when role='admin' then member_list else '[]'::jsonb end,'user',jsonb_build_object('name',email,'email',email,'role',role),'workspaces',company_list,'invitations',invite_list,'confirmedAt',now(),'revision',(select revision from nexo.companies where id=p_company));
 end if;
 if p_action='device' then
  insert into nexo.devices(id,user_id,company_id) values((p_body->>'id')::uuid,p_user,p_company) on conflict(id,user_id,company_id) do update set validated_at=now(),expires_at=now()+interval '24 hours' returning expires_at into device_exp;return jsonb_build_object('expiresAt',device_exp);
 end if;
 if p_action in('conflicts','resolve','invitationDelivery','invitationSent') and role<>'admin' then raise exception 'NEXO:Esta acción requiere permisos de administrador.';end if;
 if p_action='conflicts' then return coalesce((select jsonb_agg(to_jsonb(o)) from nexo.sync_operations o where o.company_id=p_company and state='conflict'),'[]');end if;
 if p_action in('invitationDelivery','invitationSent') then select * into inv from nexo.company_invitations where id=(p_body->>'id')::uuid and company_id=p_company;if not found then raise exception 'NEXO:Invitación no disponible.';end if;if p_action='invitationSent' then update nexo.company_invitations set sent_at=now() where id=inv.id;end if;return jsonb_build_object('email',inv.email,'companyName',(select name from nexo.companies where id=p_company));end if;
 if p_action='resolve' then
  select * into op from nexo.sync_operations where id=(p_body->>'id')::uuid and company_id=p_company and state='conflict' for update;
  if not found then raise exception 'NEXO:Conflicto no disponible.';end if;
  if length(trim(p_body->>'reason')) not between 3 and 300 then raise exception 'NEXO:Escribe un motivo.';end if;
  if p_body->>'decision'='cancel' then update nexo.sync_operations set state='cancelled',reason=p_body->>'reason',resolved_by=p_user,resolved_at=now() where id=op.id;return jsonb_build_object('state','cancelled');end if;
  if p_body->>'decision'<>'retry' then raise exception 'NEXO:Decisión no válida.';end if;
  if exists(select 1 from unnest(op.dependencies) dep where not exists(select 1 from nexo.sync_operations d where d.id=dep and d.company_id=p_company and d.state='synced')) then return jsonb_build_object('state','conflict','error','Resuelve primero las operaciones de las que depende.');end if;
  begin perform public.nexo_gateway(p_company::text,(select u.email from auth.users u where u.id=op.user_id),email,p_company::text,'POST',op.payload,gen_random_uuid());update nexo.sync_operations set state='synced',error=null,reason=p_body->>'reason',resolved_by=p_user,resolved_at=now() where id=op.id;update nexo.companies set revision=revision+1 where id=p_company;return jsonb_build_object('state','synced');exception when others then return jsonb_build_object('state','conflict','error','No se pudo aplicar. Revisa las existencias y dependencias.');end;
 end if;
 if p_action not in('mutate','sync') then raise exception 'NEXO:Acción desconocida.';end if;
 if p_action='mutate' then result:=p_body;else result:=p_body->'body';end if;
 if role<>'admin' and not (result->>'action'='document' and result->>'type'='sale') then raise exception 'NEXO:Esta acción requiere permisos de administrador.';end if;
 if p_action='mutate' then
  if result->>'action'='member' then
   if lower(result->>'email')=email then raise exception 'NEXO:Ya perteneces a esta empresa.';end if;
   insert into nexo.company_invitations(company_id,email) values(p_company,lower(result->>'email')) on conflict on constraint company_invitations_company_id_email_key do update set id=gen_random_uuid(),expires_at=now()+interval '7 days',sent_at=null returning * into inv;return jsonb_build_object('id',inv.id);
  end if;
  if result->>'action'='resendInvitation' then update nexo.company_invitations set id=gen_random_uuid(),expires_at=now()+interval '7 days',sent_at=null where id=(result->>'id')::uuid and company_id=p_company returning * into inv;if not found then raise exception 'NEXO:Invitación no disponible.';end if;return jsonb_build_object('id',inv.id);end if;
  if result->>'action'='removeMember' then
   delete from nexo.company_invitations where id=(result->>'id')::uuid and company_id=p_company;
   delete from nexo.company_members cm where cm.user_id=(result->>'id')::uuid and cm.company_id=p_company and cm.role='operator';return jsonb_build_object('ok',true);
  end if;
  if result->>'action' not in('product','document','movement','archive','import','workspace') then raise exception 'NEXO:Acción no permitida.';end if;
  if result->>'action'='workspace' then update nexo.companies set name=trim(result->>'name') where id=p_company;end if;
  result:=public.nexo_gateway(p_company::text,email,email,p_company::text,'POST',result,gen_random_uuid());update nexo.companies set revision=revision+1 where id=p_company;return result;
 end if;
 if result->>'action' not in('product','document') or (result->>'action'='product' and result?'id') then raise exception 'NEXO:La operación requiere conexión.';end if;
 if (p_body->>'company')::uuid<>p_company or coalesce(result->>'createId',result->>'id')<>p_body->>'id' then raise exception 'NEXO:Identificador de operación no válido.';end if;
 hash:=encode(sha256(convert_to(jsonb_build_object('body',result,'dependencies',p_body->'dependencies','createdAt',p_body->'createdAt')::text,'UTF8')),'hex');
 select * into op from nexo.sync_operations where id=(p_body->>'id')::uuid for update;
 if found then
  if op.user_id<>p_user or op.company_id<>p_company or op.payload_hash<>hash then raise exception 'NEXO:Esta solicitud pertenece a otra operación.';end if;
  if op.state='synced' then return nexo.sync_receipt(p_company,op.id);end if;
  if op.state in('cancelled','conflict') then return jsonb_build_object('state',op.state,'error',op.error);end if;
 else
  insert into nexo.sync_operations(id,company_id,user_id,payload,payload_hash,dependencies,client_created_at,state) values((p_body->>'id')::uuid,p_company,p_user,result,hash,array(select jsonb_array_elements_text(p_body->'dependencies')::uuid),(p_body->>'createdAt')::timestamptz,'pending') returning * into op;
 end if;
 if exists(select 1 from unnest(op.dependencies) dep where exists(select 1 from nexo.sync_operations d where d.id=dep and d.company_id=p_company and d.state in('cancelled','conflict'))) then update nexo.sync_operations set state='conflict',error='Una operación anterior requiere revisión.' where id=op.id;return jsonb_build_object('state','conflict','error','Una operación anterior requiere revisión.');end if;
 if exists(select 1 from unnest(op.dependencies) dep where not exists(select 1 from nexo.sync_operations d where d.id=dep and d.user_id=p_user and d.company_id=p_company and d.state='synced')) then return jsonb_build_object('state','pending','error','Esperando operaciones anteriores.');end if;
 begin
  perform public.nexo_gateway(p_company::text,email,email,p_company::text,'POST',result,gen_random_uuid());update nexo.sync_operations set state='synced',error=null where id=op.id;update nexo.companies set revision=revision+1 where id=p_company;return nexo.sync_receipt(p_company,op.id);
 exception when others then
  err:=case when SQLERRM like 'NEXO:%' then substr(SQLERRM,6) when SQLSTATE='23505' then 'El SKU o código de barras ya existe.' else 'Revisa los productos, valores y existencias de la operación.' end;
  update nexo.sync_operations set state='conflict',error=err where id=op.id;return jsonb_build_object('state','conflict','error',err);
 end;
end $$;
revoke all on function public.nexo_v2_gateway(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_v2_gateway(uuid,uuid,text,jsonb) to service_role;
