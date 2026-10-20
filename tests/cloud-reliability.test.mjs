import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
const source=readFileSync(new URL('../cloud-core.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function harness(getSession){
  let authChange;
  const status={textContent:'',classList:{toggle(){}}};
  const elements=new Map([['cloudStatus',status]]);
  const client={auth:{
    getSession,
    onAuthStateChange(callback){authChange=callback;},
    signInWithPassword:async()=>({error:null})
  },from(){throw new Error('Database must not be queried before authentication is ready');}};
  const w={supabase:{createClient:()=>client}};
  const context=createContext({window:w,document:{getElementById:id=>elements.get(id)||null},
    setTimeout,clearTimeout,AbortController,console});
  new Script(source).runInContext(context);
  return {cloud:w.SelectCloud,status,change:session=>authChange('SIGNED_IN',session)};
}
test('an initial auth error is reported and a later successful sign-in recovers without reloading',async()=>{
  const a=harness(async()=>({data:{session:null},error:new Error('session unavailable')}));
  await assert.rejects(a.cloud.ready(),/session unavailable/);
  await assert.rejects(a.cloud.listSaved(),/session unavailable/);
  assert.match(a.status.textContent,/session unavailable/);
  a.change({user:{id:'owner',email:'test@example.invalid'}});
  assert.equal((await a.cloud.ready()).id,'owner');
  await tick();assert.match(a.status.textContent,/test@example.invalid/);
});
test('one failing synchronization listener does not block the other listeners or auth changes',async()=>{
  const a=harness(async()=>({data:{session:{user:{id:'owner',email:'test@example.invalid'}}},error:null}));
  let calls=0;
  a.cloud.bindAuth(async()=>{throw new Error('listener offline');});
  a.cloud.bindAuth(async()=>{calls++;});
  await a.cloud.ready();await tick();
  assert.ok(calls>=1);
  const before=calls;
  a.change({user:{id:'other',email:'other@example.invalid'}});
  await tick();
  assert.ok(calls>before);assert.equal(a.cloud.user.id,'other');
});
test('a late session lookup cannot overwrite a more recent auth event',async()=>{
  let release;
  const a=harness(()=>new Promise(resolve=>{release=resolve;}));
  a.change({user:{id:'signed-in',email:'test@example.invalid'}});
  release({data:{session:null},error:null});
  await tick();assert.equal((await a.cloud.ready()).id,'signed-in');
});
