import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const root = new URL('../', import.meta.url);
const source = file => readFileSync(new URL(file, root), 'utf8');
const photo = { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9xkAAAAASUVORK5CYII=' };
const payload = {brand:'라코스테',name:'네이비 블루종',size:'48',productType:'아우터',condition:'',description:'검증용 상품입니다.',instagramCaption:'네이비 블루종 🧥\n#셀렉상회',thumbnail:photo};
const plain = value => JSON.parse(JSON.stringify(value));
function harness({file='index.html', url='https://grace-im90.github.io/select-shop-writer/', storage={}, cloud=null}={}) {
  const dom = new JSDOM(source(file), {url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.TextDecoder=TextDecoder; w.TextEncoder=TextEncoder; w.scrollTo=()=>{};
  const copied=[];w.navigator.clipboard={writeText:async value=>copied.push(value)};
  for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  w.SelectCloud=cloud||{user:null,bindAuth(){},ready:async()=>{},setStatus(){},listSaved:async()=>[],listCatalog:async()=>[]};
  if(file==='index.html')w.eval(source('product-editor.js'));
  const context=dom.getInternalVMContext();
  for(const script of w.document.querySelectorAll('script:not([src])'))new Script(script.textContent).runInContext(context);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {w,dom,copied,el:id=>w.document.getElementById(id),eval:code=>new Script(code).runInContext(context)};
}
const transferUrl=p=>'https://grace-im90.github.io/select-shop-writer/?app=26&new=1#aiData='+Buffer.from(JSON.stringify(p)).toString('base64url');

test('AI link fills photo/caption, leaves unknowns blank, and consumes link',()=>{
  const a=harness({url:transferUrl(payload)});
  assert.equal(a.el('brand').value,'라코스테');assert.equal(a.el('name').value,'네이비 블루종 (48)');
  assert.equal(a.el('size').value,'48');assert.equal(a.el('condition').value,'');assert.equal(a.el('price').value,'');
  assert.ok([...a.w.document.querySelectorAll('#measures input')].every(x=>x.value===''));
  assert.equal(a.el('instagramCaption').value,payload.instagramCaption);
  assert.equal(a.el('productPhotoPreview').getAttribute('src'),photo.src);
  assert.equal(a.el('saveProduct').textContent,'＋ 상품 저장');assert.equal(a.w.location.hash,'');
  assert.equal(new URL(a.w.location.href).searchParams.has('new'),false);
  a.dom.window.close();
});

test('local save and list edit preserve caption/photo and reset the next product',async()=>{
  const a=harness({url:transferUrl(payload)});
  await a.el('copyInstagramCaption').onclick();assert.deepEqual(a.copied,[payload.instagramCaption]);
  await a.eval('saveCurrentProduct()');
  const saved=JSON.parse(a.w.localStorage.getItem('select-saved-products'));
  assert.equal(saved.length,1);assert.equal(saved[0].measurements.__instagramCaption,payload.instagramCaption);
  assert.deepEqual(saved[0].measurements.__productImage,photo);assert.equal(a.el('instagramCaption').value,'');assert.equal(a.el('productPhotoPreview').hidden,true);
  a.w.SelectProductEditor.prefill({...payload,name:'다음 블루종',instagramCaption:'',thumbnail:null});
  await a.eval('saveCurrentProduct()');
  const rows=JSON.parse(a.w.localStorage.getItem('select-saved-products'));
  assert.equal(rows.length,2);assert.equal(rows[0].measurements.__productImage,null);assert.equal(rows[0].measurements.__instagramCaption,'');
  const b=harness({file:'products/index.html',storage:{'select-saved-products':JSON.stringify(saved)}});
  b.w.fixture=saved;b.eval('saved=fixture;showEdit(0)');assert.equal(b.el('editInstagramCaption').value,payload.instagramCaption);assert.equal(b.el('editCondition').value,'');
  b.el('editInstagramCaption').value='수정한 캡션';await b.eval('saveEdit()');
  const edited=JSON.parse(b.w.localStorage.getItem('select-saved-products'))[0];
  assert.equal(edited.measurements.__instagramCaption,'수정한 캡션');assert.deepEqual(edited.measurements.__productImage,photo);
  a.w.fixture=edited;a.eval('applySavedProduct(fixture)');assert.equal(a.el('instagramCaption').value,'수정한 캡션');
  a.el('removeProductPhoto').click();await a.eval('saveCurrentProduct()');
  const removed=JSON.parse(a.w.localStorage.getItem('select-saved-products')).find(x=>x.id===edited.id);assert.equal(removed.measurements.__productImage,null);
  a.dom.window.close();b.dom.window.close();
});

test('draft reload restores caption and photo without replaying original payload',()=>{
  const a=harness({url:transferUrl(payload)});a.el('instagramCaption').value='직접 수정한 캡션';a.eval('saveWorkingDraft()');
  const stored=a.w.localStorage.getItem('select-current-writing-draft');
  const b=harness({storage:{'select-current-writing-draft':stored}});
  assert.equal(b.el('instagramCaption').value,'직접 수정한 캡션');assert.equal(b.el('productPhotoPreview').getAttribute('src'),photo.src);assert.equal(b.el('condition').value,'');
  a.dom.window.close();b.dom.window.close();
});

test('cloud save verifies media and caption; failure retains the draft',async()=>{
  let saved;
  const cloud={user:{email:'fixture@example.invalid'},bindAuth(){},saveSaved:async p=>(saved=plain(p)),getSaved:async()=>saved};
  const a=harness({url:transferUrl(payload),cloud});await a.eval('saveCurrentProduct()');
  assert.equal(saved.measurements.__draft.instagramCaption,payload.instagramCaption);assert.deepEqual(saved.measurements.__productImage,photo);assert.match(a.el('saveStatus').textContent,/클라우드 저장 완료/);
  a.w.SelectProductEditor.prefill(payload);cloud.getSaved=async()=>({...saved,measurements:{...saved.measurements,__productImage:null}});
  await a.eval('saveCurrentProduct()');assert.match(a.el('saveStatus').textContent,/저장되지 않았습니다/);assert.equal(a.el('instagramCaption').value,payload.instagramCaption);
  a.dom.window.close();
});

test('invalid imports do not replace the current form or execute markup',()=>{
  const a=harness({url:transferUrl(payload)});
  for(const change of [{name:'아주 긴 이름 '.repeat(20)},{size:'<img src=x>'},{thumbnail:'https://example.com/private'},{productType:'invalid'}])assert.throws(()=>a.w.SelectProductEditor.prefill({...payload,...change}));
  assert.equal(a.el('name').value,'네이비 블루종 (48)');
  a.w.SelectProductEditor.prefill({...payload,description:'<script>throw Error()</script>',thumbnail:null,condition:''});
  assert.equal(a.el('viewDesc').textContent,'<script>throw Error()</script>');assert.equal(a.el('viewDesc').children.length,0);
  a.dom.window.close();
});

test('legacy English-brand AI payload remains compatible',()=>{
 const a=harness({url:transferUrl({...payload,brand:'mont-bell',name:'mont-bell 카키 자켓',size:'L'})});
 assert.equal(a.el('brand').value,'몽벨');assert.equal(a.el('name').value,'카키 자켓 (L)');a.dom.window.close();
});
