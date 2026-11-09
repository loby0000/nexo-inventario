-- Nexo: private tables; all browser roles are denied direct access.
create schema if not exists nexo;
revoke all on schema nexo from public,anon,authenticated;
grant usage on schema nexo to service_role;
create table nexo.products(id text primary key,owner text not null,name text not null check(length(name) between 2 and 100),sku text not null check(length(sku) between 1 and 40),barcode text not null default '' check(barcode ~ '^[A-Za-z0-9._-]{0,64}$'),category text not null check(length(category) between 1 and 50),supplier text not null default '',unit text not null check(unit in ('unidad','caja','kg','litro','paquete')),cost bigint not null check(cost between 0 and 100000000000),price bigint not null check(price between 0 and 100000000000),stock bigint not null default 0 check(stock between 0 and 100000000000),minimum integer not null check(minimum between 0 and 1000000),archived integer not null default 0 check(archived in(0,1)),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner,sku));
create unique index products_owner_barcode on nexo.products(owner,barcode) where barcode<>'';
create index products_owner_active on nexo.products(owner,archived,name);
create table nexo.documents(id text primary key,owner text not null,type text not null check(type in('purchase','sale')),reference text not null check(length(reference)<=80),contact text not null check(length(contact)<=120),note text not null check(length(note)<=300),actor text not null,total bigint not null check(total between 0 and 100000000000000),payload_hash text not null,created_at timestamptz not null default now());
create index documents_owner_date on nexo.documents(owner,created_at desc);
create table nexo.movements(id text primary key,owner text not null,product_id text not null references nexo.products(id),type text not null check(type in('in','out')),quantity integer not null check(quantity between 1 and 1000000),note text not null check(length(note)<=300),actor text not null,created_at timestamptz not null default now(),document_id text references nexo.documents(id),unit_price bigint check(unit_price between 0 and 100000000000));
create index movements_owner_date on nexo.movements(owner,created_at desc);
create index movements_product on nexo.movements(product_id);
create index movements_document on nexo.movements(document_id) where document_id is not null;
create table nexo.members(id text primary key,owner text not null,email text not null check(length(email)<=160),role text not null default 'operator' check(role='operator'),user_id text,accepted integer not null default 0 check(accepted in(0,1)),unique(owner,email),check(accepted=0 or user_id is not null));
create index members_user_owner on nexo.members(user_id,owner) where accepted=1;
create index members_invites on nexo.members(email) where accepted=0;
create table nexo.workspaces(owner text primary key,name text not null check(length(name) between 2 and 60),description text not null default '' check(length(description)<=160),updated_at timestamptz not null default now());
create table nexo.requests(id text primary key,owner text not null,payload_hash text not null,created_at timestamptz not null default now());
create table nexo.migrations(owner text primary key,created_at timestamptz not null default now(),product_count integer not null,movement_count integer not null);
create table nexo.transport_requests(nonce uuid primary key,user_id text not null,created_at timestamptz not null default now());
create index transport_user_time on nexo.transport_requests(user_id,created_at);
alter table nexo.products enable row level security;
alter table nexo.documents enable row level security;
alter table nexo.movements enable row level security;
alter table nexo.members enable row level security;
alter table nexo.workspaces enable row level security;
alter table nexo.requests enable row level security;
alter table nexo.migrations enable row level security;
alter table nexo.transport_requests enable row level security;
revoke all on all tables in schema nexo from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema nexo to service_role;
create function nexo.apply_movement() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.document_id is not null and not exists(select 1 from nexo.documents d where d.id=new.document_id and d.owner=new.owner and d.type=case when new.type='in' then 'purchase' else 'sale' end) then raise exception 'NEXO:Documento no válido.';end if;
 update nexo.products set stock=stock+case when new.type='in' then new.quantity else -new.quantity end,updated_at=greatest(updated_at,new.created_at) where id=new.product_id and owner=new.owner and archived=0 and (new.type='in' or stock>=new.quantity);
 if not found then raise exception 'NEXO:La operación no se guardó. Revisa las existencias y los productos activos.';end if;
 return new;
end $$;
revoke all on function nexo.apply_movement() from public,anon,authenticated;
grant execute on function nexo.apply_movement() to service_role;
create trigger movement_apply before insert on nexo.movements for each row execute function nexo.apply_movement();
create function nexo.add_product(p_owner text,p jsonb,p_id text default null) returns text language plpgsql security invoker set search_path='' as $$
declare v_id text:=coalesce(p_id,gen_random_uuid()::text);v_sku text:=upper(coalesce(nullif(trim(p->>'sku'),''),'NX-'||substr(replace(gen_random_uuid()::text,'-',''),1,12)));
begin
 insert into nexo.products(id,owner,name,sku,barcode,category,supplier,unit,cost,price,minimum) values(v_id,p_owner,trim(p->>'name'),v_sku,coalesce(trim(p->>'barcode'),''),trim(p->>'category'),coalesce(trim(p->>'supplier'),''),p->>'unit',(p->>'cost')::bigint,(p->>'price')::bigint,(p->>'minimum')::integer);return v_id;
end $$;
revoke all on function nexo.add_product(text,jsonb,text) from public,anon,authenticated;
grant execute on function nexo.add_product(text,jsonb,text) to service_role;
create function public.nexo_gateway(p_user text,p_email text,p_name text,p_workspace text,p_method text,p_body jsonb,p_nonce uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner text:=coalesce(nullif(p_workspace,''),p_user);v_role text;v_action text:=p_body->>'action';v_id text;v_hash text;v_prior text;v_data jsonb;v_row jsonb;v_line jsonb;v_type text;v_ref text;v_total bigint;v_product nexo.products%rowtype;v_movement nexo.movements%rowtype;v_count integer;
begin
 if current_user not in('service_role','postgres') then raise insufficient_privilege;end if;
 if p_user is null or length(p_user) not between 1 and 200 or p_email is null or length(p_email)>160 then raise exception 'NEXO:Identidad no válida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nexo-user:'||p_user,0));
 delete from nexo.transport_requests where user_id=p_user and created_at<now()-interval '1 hour';
 if (select count(*) from nexo.transport_requests where user_id=p_user and created_at>now()-interval '1 minute')>=240 then raise exception 'NEXO:Demasiadas solicitudes. Espera un minuto.';end if;
 insert into nexo.transport_requests(nonce,user_id) values(p_nonce,p_user);
 if p_method='BOOTSTRAP' then
  perform pg_advisory_xact_lock(hashtextextended('nexo-owner:'||p_user,0));
  if exists(select 1 from nexo.migrations where owner=p_user) then return jsonb_build_object('ok',true,'migrated',false);end if;
  if exists(select 1 from nexo.products where owner=p_user) then raise exception 'NEXO:El destino contiene datos. La migración requiere revisión.';end if;
  for v_row in select value from jsonb_array_elements(coalesce(p_body->'products','[]')) loop
   perform nexo.add_product(p_user,v_row,v_row->>'id');
   update nexo.products set created_at=(v_row->>'created_at')::timestamptz,updated_at=(v_row->>'updated_at')::timestamptz where id=v_row->>'id' and owner=p_user;
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_body->'movements','[]')) with ordinality x(value,n) order by n loop
   insert into nexo.movements(id,owner,product_id,type,quantity,note,actor,created_at) values(v_row->>'id',p_user,v_row->>'product_id',v_row->>'type',(v_row->>'quantity')::integer,v_row->>'note',v_row->>'actor',(v_row->>'created_at')::timestamptz);
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_body->'products','[]')) loop
   select * into v_product from nexo.products where id=v_row->>'id' and owner=p_user;
   if v_product.stock<>(v_row->>'stock')::bigint then raise exception 'NEXO:Las existencias de origen no coinciden con el historial. No se migró ningún dato.';end if;
   update nexo.products set archived=(v_row->>'archived')::integer,updated_at=(v_row->>'updated_at')::timestamptz where id=v_product.id;
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_body->'members','[]')) loop
   insert into nexo.members(id,owner,email,role) values(v_row->>'id',p_user,lower(v_row->>'email'),'operator');
  end loop;
  if p_body->'workspace' is not null and p_body->'workspace'<>'null'::jsonb then insert into nexo.workspaces(owner,name,description) values(p_user,p_body->'workspace'->>'name',coalesce(p_body->'workspace'->>'description',''));end if;
  insert into nexo.migrations(owner,product_count,movement_count) values(p_user,jsonb_array_length(coalesce(p_body->'products','[]')),jsonb_array_length(coalesce(p_body->'movements','[]')));
  return jsonb_build_object('ok',true,'migrated',true);
 end if;
 v_role:=case when v_owner=p_user then 'admin' else (select role from nexo.members where owner=v_owner and user_id=p_user and accepted=1) end;
 if v_role is null then raise exception 'NEXO:No tienes acceso a este negocio.';end if;
 if p_method='GET' then
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.archived,p.name) from nexo.products p where p.owner=v_owner),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(to_jsonb(m)) from(select m.*,p.name as product_name,p.sku from nexo.movements m join nexo.products p on p.id=m.product_id where m.owner=v_owner order by m.created_at desc,m.id desc limit 2000)m),'[]'::jsonb),
 'members',case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'email',m.email,'role',m.role,'accepted',m.accepted)) from nexo.members m where m.owner=v_owner),'[]'::jsonb) else '[]'::jsonb end,
 'documents',coalesce((select jsonb_agg(to_jsonb(d)) from(select * from nexo.documents where owner=v_owner order by created_at desc limit 500)d),'[]'::jsonb),
 'workspace',jsonb_build_object('owner',v_owner,'name',coalesce((select name from nexo.workspaces where owner=v_owner),'Mi negocio'),'description',coalesce((select description from nexo.workspaces where owner=v_owner),'')),
 'workspaces',jsonb_build_array(jsonb_build_object('owner',p_user,'name',coalesce((select name from nexo.workspaces where owner=p_user),'Mi negocio'),'role','admin'))||coalesce((select jsonb_agg(jsonb_build_object('owner',m.owner,'name',coalesce(w.name,'Negocio compartido'),'role',m.role)) from nexo.members m left join nexo.workspaces w on w.owner=m.owner where m.user_id=p_user and m.accepted=1),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',coalesce(w.name,'Negocio compartido'))) from nexo.members m left join nexo.workspaces w on w.owner=m.owner where m.email=lower(p_email) and m.accepted=0),'[]'::jsonb),
 'user',jsonb_build_object('name',coalesce(p_name,p_email),'email',p_email,'role',v_role));
 end if;
 if p_method<>'POST' then raise exception 'NEXO:Método no válido.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nexo-owner:'||v_owner,0));
 if v_action='acceptInvitation' then update nexo.members set accepted=1,user_id=p_user where id=p_body->>'id' and email=lower(p_email) and accepted=0;if not found then raise exception 'NEXO:La invitación ya no está disponible.';end if;return jsonb_build_object('ok',true);end if;
 if v_action='movement' then
  v_id:=p_body->>'id';select * into v_movement from nexo.movements where id=v_id and owner=v_owner;
  if found then if v_movement.product_id<>p_body->>'productId' or v_movement.type<>p_body->>'type' or v_movement.quantity<>(p_body->>'quantity')::integer or v_movement.note<>p_body->>'note' then raise exception 'NEXO:Ese identificador pertenece a otro movimiento.';end if;return jsonb_build_object('ok',true);end if;
  insert into nexo.movements(id,owner,product_id,type,quantity,note,actor) values(v_id,v_owner,p_body->>'productId',p_body->>'type',(p_body->>'quantity')::integer,p_body->>'note',p_email);return jsonb_build_object('ok',true);
 end if;
 if v_action='document' then
  v_type:=p_body->>'type';if v_type='purchase' and v_role<>'admin' then raise exception 'NEXO:Solo el administrador puede registrar compras.';end if;
  v_id:=p_body->>'id';v_hash:=encode(sha256(convert_to(p_body::text,'UTF8')),'hex');select payload_hash into v_prior from nexo.documents where id=v_id and owner=v_owner;
  if found then if v_prior<>v_hash then raise exception 'NEXO:Esta solicitud ya se utilizó para otra operación.';end if;return jsonb_build_object('ok',true);end if;
  if jsonb_array_length(p_body->'lines') not between 1 and 50 or (select count(distinct value->>'productId') from jsonb_array_elements(p_body->'lines'))<>jsonb_array_length(p_body->'lines') then raise exception 'NEXO:Revisa los productos de la operación.';end if;
  select sum((value->>'quantity')::bigint*(value->>'unitPrice')::bigint) into v_total from jsonb_array_elements(p_body->'lines');
  v_ref:=coalesce(nullif(p_body->>'reference',''),upper(case when v_type='purchase' then 'COMPRA-' else 'VENTA-' end||substr(v_id,1,8)));
  insert into nexo.documents(id,owner,type,reference,contact,note,actor,total,payload_hash) values(v_id,v_owner,v_type,v_ref,p_body->>'contact',p_body->>'note',p_email,v_total,v_hash);
  for v_line in select value from jsonb_array_elements(p_body->'lines') order by value->>'productId' loop
   insert into nexo.movements(id,owner,product_id,type,quantity,note,actor,document_id,unit_price) values(gen_random_uuid()::text,v_owner,v_line->>'productId',case when v_type='purchase' then 'in' else 'out' end,(v_line->>'quantity')::integer,case when v_type='purchase' then 'Compra' else 'Venta' end||' · '||v_ref,p_email,v_id,(v_line->>'unitPrice')::bigint);
  end loop;return jsonb_build_object('ok',true,'id',v_id);
 end if;
 if v_role<>'admin' then raise exception 'NEXO:Esta acción requiere permisos de administrador.';end if;
 if v_action='workspace' then insert into nexo.workspaces(owner,name,description) values(v_owner,trim(p_body->>'name'),trim(p_body->>'description')) on conflict(owner) do update set name=excluded.name,description=excluded.description,updated_at=now();return jsonb_build_object('ok',true);end if;
 if v_action='product' then
  if p_body->>'id' is null then v_id:=nexo.add_product(v_owner,p_body);
  else v_id:=p_body->>'id';update nexo.products set name=trim(p_body->>'name'),sku=upper(coalesce(nullif(trim(p_body->>'sku'),''),'NX-'||substr(replace(gen_random_uuid()::text,'-',''),1,12))),barcode=coalesce(trim(p_body->>'barcode'),''),category=trim(p_body->>'category'),supplier=trim(p_body->>'supplier'),unit=p_body->>'unit',cost=(p_body->>'cost')::bigint,price=(p_body->>'price')::bigint,minimum=(p_body->>'minimum')::integer,updated_at=now() where id=v_id and owner=v_owner and archived=0;if not found then raise exception 'NEXO:El producto no está disponible para editar.';end if;end if;return jsonb_build_object('ok',true,'id',v_id);
 end if;
 if v_action='import' then
  v_id:=p_body->>'id';v_hash:=encode(sha256(convert_to(p_body::text,'UTF8')),'hex');select payload_hash into v_prior from nexo.requests where id=v_id and owner=v_owner;if found then if v_prior<>v_hash then raise exception 'NEXO:La importación ya se utilizó con otros datos.';end if;return jsonb_build_object('ok',true);end if;
  if jsonb_array_length(p_body->'rows') not between 1 and 100 then raise exception 'NEXO:Importa entre 1 y 100 productos.';end if;
  for v_row in select value from jsonb_array_elements(p_body->'rows') loop perform nexo.add_product(v_owner,v_row);end loop;
  insert into nexo.requests(id,owner,payload_hash) values(v_id,v_owner,v_hash);return jsonb_build_object('ok',true,'count',jsonb_array_length(p_body->'rows'));
 end if;
 if v_action='archive' then update nexo.products set archived=case when (p_body->>'archived')::boolean then 1 else 0 end,updated_at=now() where id=p_body->>'id' and owner=v_owner and (not (p_body->>'archived')::boolean or stock=0);if not found then raise exception 'NEXO:Solo puedes archivar productos sin existencias.';end if;return jsonb_build_object('ok',true);end if;
 if v_action='member' then if lower(p_body->>'email')=lower(p_email) then raise exception 'NEXO:Ya eres administrador de este negocio.';end if;insert into nexo.members(id,owner,email) values(gen_random_uuid()::text,v_owner,lower(p_body->>'email'));return jsonb_build_object('ok',true);end if;
 if v_action='removeMember' then delete from nexo.members where id=p_body->>'id' and owner=v_owner;if not found then raise exception 'NEXO:No se encontró el acceso.';end if;return jsonb_build_object('ok',true);end if;
 if v_action='demo' then
  if exists(select 1 from nexo.products where owner=v_owner) then raise exception 'NEXO:Los ejemplos solo se pueden cargar en un inventario vacío.';end if;
  for v_row in select value from jsonb_array_elements('[{"name":"Cuaderno A5 · puntos","sku":"PAP-001","category":"Papelería","supplier":"Papel & Co.","unit":"unidad","cost":850000,"price":1490000,"minimum":10,"stock":42},{"name":"Bolígrafo gel negro","sku":"PAP-002","category":"Papelería","unit":"unidad","cost":180000,"price":350000,"minimum":15,"stock":8},{"name":"Cable USB-C 1 m","sku":"TEC-001","category":"Tecnología","unit":"unidad","cost":650000,"price":1500000,"minimum":8,"stock":0},{"name":"Café de origen 250 g","sku":"ALI-001","category":"Alimentos","unit":"unidad","cost":1650000,"price":2800000,"minimum":10,"stock":6}]'::jsonb) loop
   v_id:=nexo.add_product(v_owner,v_row);if (v_row->>'stock')::integer>0 then insert into nexo.movements(id,owner,product_id,type,quantity,note,actor) values(gen_random_uuid()::text,v_owner,v_id,'in',(v_row->>'stock')::integer,'Existencias iniciales · datos de ejemplo',p_email);end if;
  end loop;return jsonb_build_object('ok',true);
 end if;
 raise exception 'NEXO:Acción desconocida.';
end $$;
revoke all on function public.nexo_gateway(text,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nexo_gateway(text,text,text,text,text,jsonb,uuid) to service_role;
