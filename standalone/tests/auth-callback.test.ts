import {describe,it,expect} from 'vitest';
import {callbackFlow} from '../client/auth-callback';
describe('authentication callback flow',()=>{
  it('accepts an admin invitation session only on the exact callback route',()=>{
    expect(callbackFlow(new URL('https://nexo.test/auth/callback?recovery=1#type=invite&access_token=test&refresh_token=test'))).toBe('implicit');
  });
  it.each([
    '/auth/callback?code=pkce',
    '/auth/callback?recovery=1&code=pkce',
    '/auth/callback#type=recovery&access_token=test&refresh_token=test',
    '/auth/callback#type=invite&access_token=test',
    '/#type=invite&access_token=test&refresh_token=test',
  ])('keeps PKCE for %s',(path)=>{
    expect(callbackFlow(new URL('https://nexo.test'+path))).toBe('pkce');
  });
});
