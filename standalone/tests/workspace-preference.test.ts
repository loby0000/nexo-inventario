import {afterEach,describe,it,expect,vi} from 'vitest';
import {preferredCompany,rememberCompany} from '../client/workspace-preference';
afterEach(()=>vi.unstubAllGlobals());
describe('remembering a company never grants access',()=>{
  it('restores only a company returned for this user',()=>{
    const values=new Map([['nexo-company:alice','b'],['nexo-company:bob','a']]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),setItem:(key:string,v:string)=>values.set(key,v)});
    expect(preferredCompany('alice',[{owner:'a'},{owner:'b'}])).toBe('b');
    expect(preferredCompany('bob',[{owner:'a'},{owner:'b'}])).toBe('a');
    expect(preferredCompany('another',[{owner:'a'},{owner:'b'}])).toBe('');
    expect(preferredCompany('alice',[{owner:'a'},{owner:'c'}])).toBe('');
    rememberCompany('alice','unauthorized',[{owner:'a'}]);
    expect(values.get('nexo-company:alice')).toBe('b');
  });
  it('keeps an active authorized selection and tolerates unavailable storage',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('full');}});
    expect(preferredCompany('alice',[{owner:'a'},{owner:'b'}],'b')).toBe('b');
    expect(preferredCompany('alice',[{owner:'a'}])).toBe('a');
    expect(preferredCompany('alice',[{owner:'a'},{owner:'b'}])).toBe('');
    expect(()=>rememberCompany('alice','a',[{owner:'a'}])).not.toThrow();
  });
});
