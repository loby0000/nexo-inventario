import {describe,it,expect,vi,afterEach} from 'vitest';
import {boundedJson} from '../server/http-security';
import worker,{type Env} from '../server/worker';
import scanner from '../server/scanner-worker';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'server-private',APP_ORIGIN:'https://nexo.test',REGISTRATION_ENABLED:'false',MAIL_FROM:'',ASSETS:{fetch:()=>new Response('shell')}} as unknown as Env;
const req=(path:string,init:RequestInit={})=>new Request('https://nexo.test/api/'+path,init);
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('API hardening',()=>{
 it('rejects unknown routes and wrong methods without consulting Auth or the database',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await worker.fetch(req('not-a-route'),env)).status).toBe(404);
  const r=await worker.fetch(req('bootstrap',{method:'POST',body:'{}'}),env);
  expect(r.status).toBe(405);expect(r.headers.get('Allow')).toBe('GET');
  expect((await worker.fetch(req('config',{method:'POST',body:'{}'}),env)).status).toBe(405);
  expect(f).not.toHaveBeenCalled();
 });
 it('blocks cross-site requests even without an Origin header',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await worker.fetch(req('bootstrap',{headers:{'Sec-Fetch-Site':'cross-site',Authorization:'Bearer valid'}}),env)).status).toBe(403);
  expect(f).not.toHaveBeenCalled();
 });
 it('limits verified users before database access, never by a client-provided identity',async()=>{
  const f=vi.fn().mockResolvedValue(Response.json({id:'verified-user',email_confirmed_at:'now'}));vi.stubGlobal('fetch',f);
  const limit=vi.fn().mockResolvedValue({success:false});
  const r=await worker.fetch(req('bootstrap',{headers:{Authorization:'Bearer valid'}}),{...env,API_LIMITER:{limit}});
  expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('60');
  expect(limit).toHaveBeenCalledWith({key:'user:verified-user'});expect(f).toHaveBeenCalledTimes(1);
 });
 it('limits invitation bursts before mutating or sending mail',async()=>{
  const f=vi.fn().mockResolvedValue(Response.json({id:'verified-user',email_confirmed_at:'now'}));vi.stubGlobal('fetch',f);
  const limit=vi.fn().mockResolvedValue({success:false});
  const r=await worker.fetch(req('inventory?company=20000000-0000-4000-8000-000000000001',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({action:'member',email:'employee@example.com'})}),{...env,MAIL_PROVIDER:'brevo',BREVO_API_KEY:'fake',MAIL_FROM:'sender@example.com',INVITATION_LIMITER:{limit}});
  expect(r.status).toBe(429);expect(f).toHaveBeenCalledTimes(1);
 });
 it('sets no-store and browser protections on both success and errors',async()=>{
  for(const path of ['config','bootstrap','unknown']){
   const r=await worker.fetch(req(path),env);
   expect(r.headers.get('Cache-Control')).toBe('no-store');
   expect(r.headers.get('X-Frame-Options')).toBe('DENY');
   expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
   expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
   expect(await r.text()).not.toContain('server-private');
  }
 });
 it('rejects oversized bearer tokens without external requests',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await worker.fetch(req('bootstrap',{headers:{Authorization:'Bearer '+ 'a'.repeat(17000)}}),env)).status).toBe(401);expect(f).not.toHaveBeenCalled();
 });
});
describe('bounded request body',()=>{
 const post=(body:BodyInit,headers:Record<string,string>={'Content-Type':'application/json'})=>req('inventory',{method:'POST',headers,body,duplex:'half'} as RequestInit);
 it('rejects fake JSON MIME types and declared/actual oversized payloads',async()=>{
  await expect(boundedJson(post('{}',{'Content-Type':'application/jsonp'}))).rejects.toMatchObject({status:415});
  await expect(boundedJson(post('{}',{'Content-Type':'application/json','Content-Length':'999999'}))).rejects.toMatchObject({status:413});
  await expect(boundedJson(post('x'.repeat(30)),20)).rejects.toMatchObject({status:413});
  await expect(boundedJson(post('{bad}'))).rejects.toMatchObject({status:400});
  await expect(boundedJson(post('{"ok":true}',{'Content-Type':'application/json; charset=utf-8'}))).resolves.toEqual({ok:true});
 });
 it('terminates a stalled stream and cancels it',async()=>{
  vi.useFakeTimers();const cancel=vi.fn();
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel});
  const outcome=expect(boundedJson(post(stream),100,50)).rejects.toMatchObject({status:408});
  await vi.advanceTimersByTimeAsync(51);await outcome;expect(cancel).toHaveBeenCalled();
 });
 it('protects reader error responses and rejects oversized requests before forwarding',async()=>{
  const fetch=vi.fn();const se={APP_ORIGIN:'https://reader.test',UPSTREAM_ORIGIN:'https://nexo.test',ASSETS:{fetch},NEXO_API:{fetch}} as any;
  const r=await scanner.fetch(new Request('https://reader.test/api/scanner/grant',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)}),se);
  expect(r.status).toBe(413);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(fetch).not.toHaveBeenCalled();
 });
});
