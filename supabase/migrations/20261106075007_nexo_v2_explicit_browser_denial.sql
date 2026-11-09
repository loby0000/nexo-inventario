-- Defense in depth: browser roles have neither grants nor permissive policies.
do $$ declare t text;begin
 foreach t in array array['companies','company_members','company_invitations','devices','sync_operations','business_transfers','frozen_legacy_owners','transfer_backups'] loop
  execute format('create policy browser_deny on nexo.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end $$;
