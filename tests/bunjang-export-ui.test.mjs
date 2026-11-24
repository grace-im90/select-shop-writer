import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const photo={src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9xkAAAAASUVORK5CYII='};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(test){for(let n=0;n<150;n++){if(test())return;await tick();}assert.fail('UI did not settle');}
function fixture(id,metadata={}){return{id,brand:'브랜드',name:'니트 (M)',productType:'상의',size:'M',condition:'A 매우 좋은 상태',price:35000,createdAt:'2026-11-24T00:00:00Z',updatedAt:'2026-11-24T00:00:00Z',measurements:{__productCode:'S'+String(id).padStart(3,'0'),__productImage:photo,__draft:{brand:'브랜드',name:'니트 (M)',size:'M',productType:'상의',condition:'A 매우 좋은 상태',price:35000,description:'본문\n\n두 번째 문단',notice:'구매 안내'},...metadata}};}
function harness(products){
  const dom=new JSDOM(source('products/index.html'),{url:'https://grace-im90.github.io/select-shop-writer/products/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,downloads=[];let account=null;
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortController=AbortController;w.Blob=Blob;w.alert=()=>{};w.confirm=()=>true;
  w.localStorage.setItem('select-saved-products',JSON.stringify(products));
  w.SelectCloud={get user(){return account;},ready:async()=>{},bindAuth(callback){queueMicrotask(callback);},setStatus(){},nextProductCode:()=> 'S999'};
  w.eval(source('products/storage.js'));
  for(const script of w.document.querySelectorAll('script:not([src])'))new Script(script.textContent).runInContext(dom.getInternalVMContext());
  w.eval(source('products/management.js'));w.eval(source('assets/vendor/jszip.min.js'));w.eval(source('products/bunjang-export-core.js'));
  const urls=new Map();let lastBlob;
  w.URL.createObjectURL=blob=>{lastBlob=blob;const url='blob:test-'+urls.size;urls.set(url,blob);return url;};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:urls.get(this.href)||lastBlob});};
  w.fetch=async url=>String(url).includes('bgzt_template')?new Response(readFileSync(new URL('../assets/bgzt_template_202604.xlsx',import.meta.url))):fetch(String(url));
  w.eval(source('products/bunjang-export.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return{w,dom,downloads,el:id=>w.document.getElementById(id),stored:()=>JSON.parse(w.localStorage.getItem('select-saved-products')),switchAccount:()=>{account={id:'different-owner'};w.eval('render()');},close:()=>w.close()};
}
test('selection and date filter exclude posted, pending, and sold products',async()=>{
  const a=harness([fixture(1),fixture(2,{__uploadSites:{bunjang:true}}),fixture(3,{__bunjangExport:{pendingAt:'date'}}),fixture(4,{__soldAt:'date'})]);
  try{await until(()=>a.el('bjToolbar'));a.el('bjSelectMissing').click();assert.match(a.el('bjCount').textContent,/1개 선택/);assert.equal(a.w.document.querySelector('[data-bj-select="2"]').disabled,true);assert.equal(a.w.document.querySelector('[data-bj-select="3"]').disabled,true);a.el('bjFrom').value='2026-11-25';a.el('bjFrom').dispatchEvent(new a.w.Event('change'));assert.equal(a.w.document.querySelectorAll('#tableBody tr').length,0);}finally{a.close();}
});
test('download builds one workbook plus ordered photos without marking products uploaded, pending is explicit',async()=>{
  const a=harness([fixture(1,{__bunjangPhotos:[photo,photo]})]);
  try{
    await until(()=>a.el('bjToolbar'));a.el('bjSelectMissing').click();a.el('bjReview').click();await until(()=>a.el('bjOverlay')&&!a.el('bjOverlay').hidden);
    assert.equal(a.el('bjPending').disabled,true);a.el('bjDownload').click();await until(()=>a.downloads.length===1);
    const bundle=await a.w.JSZip.loadAsync(await a.downloads[0].blob.arrayBuffer());assert.ok(bundle.file('photos/S001_01.png'));assert.ok(bundle.file('photos/S001_02.png'));assert.ok(bundle.file('등록안내.txt'));
    const workbookName=Object.keys(bundle.files).find(name=>name.endsWith('.xlsx'));assert.ok(workbookName);const workbook=await a.w.JSZip.loadAsync(await bundle.file(workbookName).async('uint8array'));assert.match(await workbook.file('xl/worksheets/sheet1.xml').async('string'),/S001_01.png, S001_02.png/);
    assert.notEqual(a.stored()[0].measurements.__uploadSites?.bunjang,true);assert.equal(a.stored()[0].measurements.__bunjangExport.pendingAt,undefined);
    await until(()=>!a.el('bjPending').disabled);a.el('bjPending').click();await until(()=>Boolean(a.stored()[0].measurements.__bunjangExport.pendingAt));assert.notEqual(a.stored()[0].measurements.__uploadSites?.bunjang,true);
  }finally{a.close();}
});
test('missing photo blocks export and account changes close any open review',async()=>{
  const a=harness([fixture(1,{__bunjangPhotos:[]})]);
  try{await until(()=>a.el('bjToolbar'));a.el('bjSelectMissing').click();a.el('bjReview').click();await until(()=>a.el('bjOverlay')&&!a.el('bjOverlay').hidden);a.el('bjDownload').click();assert.match(a.el('bjReviewMessage').textContent,/사진/);assert.equal(a.downloads.length,0);a.switchAccount();assert.equal(a.el('bjOverlay').hidden,true);assert.match(a.el('bjCount').textContent,/0개 선택/);}finally{a.close();}
});
test('custom category stays visible after input and saved category survives changing default gender',async()=>{
  const a=harness([fixture(1,{__bunjangSettings:{categoryId:310260800}})]);
  try{await until(()=>a.el('bjToolbar'));a.el('bjSelectMissing').click();a.el('bjReview').click();await until(()=>a.el('bjOverlay')&&!a.el('bjOverlay').hidden);a.el('bjGender').value='men';a.el('bjGender').dispatchEvent(new a.w.Event('change'));let select=a.w.document.querySelector('.bj-category');assert.equal(select.value,'310260800');select.value='custom';select.dispatchEvent(new a.w.Event('change',{bubbles:true}));let field=a.w.document.querySelector('.bj-custom');field.value='320210500';field.dispatchEvent(new a.w.Event('input',{bubbles:true}));field.dispatchEvent(new a.w.Event('change',{bubbles:true}));assert.equal(a.w.document.querySelector('.bj-custom').value,'320210500');}finally{a.close();}
});
