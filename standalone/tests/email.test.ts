import {afterEach,describe,it,expect,vi} from 'vitest';
import {deliverInvitation,invitationMailReady} from '../server/email';
afterEach(()=>vi.unstubAllGlobals());
const config={MAIL_FROM:'owner@example.test',APP_ORIGIN:'https://nexo.test',BREVO_API_KEY:'private-brevo',MAIL_PROVIDER:'brevo'};
describe('invitation provider boundary',()=>{
 it('uses the Brevo API schema and keeps the key in the server header',async()=>{
  const f=vi.fn().mockResolvedValue(Response.json({messageId:'test'},{status:201}));vi.stubGlobal('fetch',f);
  expect(await deliverInvitation(config,'employee@example.test','Empresa <A>','id')).toBe(true);
  const [url,request]=f.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(request.headers['api-key']).toBe('private-brevo');
  expect(request.body).not.toContain('private-brevo');
  expect(JSON.parse(request.body).textContent).toContain('Crear mi cuenta');
  expect(JSON.parse(request.body).textContent).toContain('Recuperar acceso');
  expect(JSON.parse(request.body)).toMatchObject({sender:{email:config.MAIL_FROM},to:[{email:'employee@example.test'}],textContent:expect.stringContaining('https://nexo.test/invitaciones/id')});
 });
 it('requires credentials for the selected provider before sending',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect(invitationMailReady({...config,BREVO_API_KEY:undefined,RESEND_API_KEY:'other-provider'})).toBe(false);
  expect(await deliverInvitation({...config,BREVO_API_KEY:undefined},'employee@example.test','A','id')).toBe(false);
  expect(f).not.toHaveBeenCalled();
 });
 it('keeps failed delivery unsuccessful',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({message:'quota exceeded'},{status:429})));
  expect(await deliverInvitation(config,'employee@example.test','A','id')).toBe(false);
 });
 it('gives each explicit resend a new provider idempotency key',async()=>{
  const f=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({id:'test'})));vi.stubGlobal('fetch',f);
  const resend={...config,MAIL_PROVIDER:'resend',RESEND_API_KEY:'private-resend'};
  await deliverInvitation(resend,'employee@example.test','A','same-invitation');
  await deliverInvitation(resend,'employee@example.test','A','same-invitation');
  expect(f.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(f.mock.calls[1][1].headers['Idempotency-Key']);
 });
});
