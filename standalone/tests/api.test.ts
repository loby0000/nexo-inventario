import {afterEach,describe,it,expect,vi} from 'vitest';
import {AuthRetryableFetchError,type SupabaseClient} from '@supabase/supabase-js';
import {apiClient} from '../client/api';
afterEach(()=>vi.unstubAllGlobals());
const auth=(session:unknown,error:unknown=null)=>({auth:{getSession:async()=>({data:{session},error})}} as unknown as SupabaseClient);
describe('temporary Auth and API failures preserve offline eligibility',()=>{
 it('does not turn a refresh network failure into an authentication denial',async()=>{
  vi.stubGlobal('navigator',{onLine:true});
  const f=vi.fn();vi.stubGlobal('fetch',f);
  await expect(apiClient(auth(null,new AuthRetryableFetchError('unreachable',503)))('bootstrap')).rejects.toMatchObject({status:0});
  expect(f).not.toHaveBeenCalled();
 });
 it('still rejects a genuinely missing online session',async()=>{
  vi.stubGlobal('navigator',{onLine:true});
  await expect(apiClient(auth(null))('bootstrap')).rejects.toMatchObject({status:401});
 });
 it('classifies an HTML upstream outage as a server failure',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>unavailable</html>',{status:502})));
  await expect(apiClient(auth({access_token:'test'}))('bootstrap')).rejects.toMatchObject({status:502});
 });
 it('preserves the authorization denial returned by the server',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:'Revocado'},{status:403})));
  await expect(apiClient(auth({access_token:'test'}))('bootstrap')).rejects.toMatchObject({status:403});
 });
});
