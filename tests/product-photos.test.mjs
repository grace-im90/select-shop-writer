import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const photo = { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9xkAAAAASUVORK5CYII=' };
const photo2 = { src: 'data:image/jpeg;base64,/9j/2Q==' };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(predicate) { for (let i=0;i<100;i++) { if (predicate()) return; await tick(); } assert.fail('UI did not reach the expected state'); }
function fixture(id, image = photo) {
  return { id, brand:'브랜드', name:'상품 '+id, product_type:'상의', size:'M', condition:'A 매우 좋은 상태',
    price:35000, description:'설명 '+id, created_at:`2026-09-${String(id).padStart(2,'0')}T00:00:00Z`, updated_at:'2026-09-23T00:00:00Z',
    measurements:{length:'65',__productCode:'S'+String(id).padStart(3,'0'),__productImage:image,__uploadSites:{},__instagramCaption:'캡션',
      __draft:{brand:'브랜드',name:'상품 '+id,productType:'상의',size:'M',price:35000,description:'상세 설명 '+id,notice:'구매 안내 '+id,instagramCaption:'캡션'}} };
}

function harness(rows, { cache = new Map(), visible = 3, file = 'products/index.html', local = false } = {}) {
  const dom = new JSDOM(source(file), {url:'https://grace-im90.github.io/select-shop-writer/'+file.replace('index.html',''),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, db=new Map(rows.map(row=>[String(row.id),clone(row)])), requests=[], alerts=[];
  let failRead=false, delayImages=null;
  w.AbortController=AbortController;
  w.alert=message=>alerts.push(message);w.confirm=()=>true;
  w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.scrollTo=()=>{};
  w.IntersectionObserver=class {
    constructor(callback){this.callback=callback;}
    disconnect(){} unobserve(){}
    observe(row){ const index=[...w.document.querySelectorAll('#tableBody tr')].indexOf(row);if(index<visible)queueMicrotask(()=>{if(row.isConnected)this.callback([{isIntersecting:true,target:row}]);}); }
  };
  w.SelectPhotoCache={read:async(owner,id)=>cache.get(owner+':'+id)||null,write:async(owner,id,entry)=>cache.set(owner+':'+id,clone(entry))};
  function query() {
    const q={selection:'*', operation:'read', filters:[], orders:[], one:false, patch:null,
      select(value='*'){this.selection=value;return this;},
      order(key,options){this.orders.push([key,options]);return this;},
      range(start,end){this.start=start;this.end=end;return this;},
      eq(key,value){this.filters.push(row=>String(row[key])===String(value));return this;},
      in(key,values){this.filters.push(row=>values.map(String).includes(String(row[key])));return this;},
      or(){this.filters.push(row=>row.measurements.__productImage!=null||row.measurements.__draft?.productImage!=null);return this;},
      update(value){this.operation='update';this.patch=value;return this;},
      insert(value){this.operation='insert';this.patch=value;return this;},
      single(){this.one=true;return this;}, maybeSingle(){this.one=true;return this;}, abortSignal(){return this;},
      then(resolve,reject){return this.run().then(resolve,reject);},
      async run(){
        let selected=[...db.values()].filter(row=>this.filters.every(fn=>fn(row)));
        requests.push({selection:this.selection,operation:this.operation,ids:selected.map(row=>row.id)});
        if(failRead&&this.operation==='read'&&this.one)return {data:null,error:new Error('offline')};
        if(this.selection==='id,measurements'&&delayImages)await delayImages;
        if(this.operation==='update'){selected=selected.map(row=>({...row,...clone(this.patch)}));selected.forEach(row=>db.set(String(row.id),row));}
        if(this.operation==='insert'){const row={id:Math.max(0,...[...db.keys()].map(Number))+1,created_at:new Date().toISOString(),...clone(this.patch)};db.set(String(row.id),row);selected=[row];}
        for(const [key,options]of [...this.orders].reverse())selected.sort((a,b)=>String(a[key]).localeCompare(String(b[key]),'en',{numeric:true})*(options.ascending?1:-1));
        if(this.start!=null)selected=selected.slice(this.start,this.end+1);
        const projected=selected.map(row=>{
          if(this.selection==='*')return clone(row);
          const result={};for(const field of this.selection.split(',')){
            if(field.includes(':')){const [alias,path]=field.split(':');const key=path.split('->')[1];result[alias]=row.measurements[key]??null;}
            else result[field]=row[field];
          }return clone(result);
        });
        return {data:this.one?projected[0]:projected,error:null};
      }
    };return q;
  }
  w.supabase={createClient:()=>({from:()=>query(),auth:{getSession:async()=>({data:{session:local?null:{user:{id:'owner',email:'test@example.invalid'}}}}),onAuthStateChange(){}}})};
  w.eval(source('cloud-core.js'));w.eval(source('cloud-patches.js'));
  w.eval(source('products/storage.js'));
  if(file==='index.html')w.eval(source('product-editor.js'));
  const context=dom.getInternalVMContext();
  for(const script of w.document.querySelectorAll('script:not([src])'))new Script(script.textContent).runInContext(context);
  if(file==='products/index.html')new Script(source('products/management.js')).runInContext(context);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {w,dom,db,requests,alerts,cache,run:code=>new Script(code).runInContext(context),el:id=>w.document.getElementById(id),
    failRead:value=>{failRead=value;},delayImages:value=>{delayImages=value;},
    images:()=>[...w.document.querySelectorAll('.shot-thumb img')],
    close:async()=>{await tick();await tick();dom.window.close();}};
}

test('real cloud API and page render existing photos, load only visible rows, and reuse photos on refresh',async()=>{
  const a=harness(Array.from({length:20},(_,i)=>fixture(i+1)));
  await until(()=>a.images().length===3);
  assert.ok(a.images().every(image=>image.getAttribute('src')===photo.src));
  const photoRequests=()=>a.requests.filter(r=>r.selection==='id,measurements');
  assert.equal(new Set(photoRequests().flatMap(r=>r.ids)).size,3);
  const index=a.requests.find(r=>r.selection.includes('m_productCode'));
  assert.ok(index);assert.ok(!index.selection.includes('__draft'));assert.ok(!index.selection.includes('description'));
  const before=photoRequests().length;
  await a.run('loadSaved()');await tick();
  assert.equal(a.images().length,3);assert.equal(photoRequests().length,before);
  assert.match(a.el('productStatusFilters').textContent,/사진 없음 0/);
  await a.close();
});

test('persistent account cache restores thumbnails without downloading them on a new page',async()=>{
  const cache=new Map();const a=harness([fixture(1)],{cache});await until(()=>a.images().length===1);await a.close();
  const b=harness([fixture(1)],{cache});await until(()=>b.images().length===1);
  assert.equal(b.requests.filter(r=>r.selection==='id,measurements').length,0);await b.close();
});

test('legacy string and draft photos recover while explicitly deleted photos stay deleted',async()=>{
  const legacy=fixture(1,photo.src),draft=fixture(2,null),deleted=fixture(3,null);
  draft.measurements.__draft.productImage=photo;
  deleted.measurements.__draft.productImage=photo;deleted.measurements.__productImageDeletedAt='2026-09-24';
  const a=harness([legacy,draft,deleted]);await until(()=>a.images().length===2);
  assert.match(a.el('productStatusFilters').textContent,/사진 없음 1/);
  await a.close();
});

test('opening details fetches complete text and editing an upload flag preserves photo and text',async()=>{
  const a=harness([fixture(1)]);await until(()=>a.images().length===1);
  await a.run('openSaved(0)');assert.match(a.el('detailBody').textContent,/상세 설명 1/);assert.match(a.el('detailBody').textContent,/구매 안내 1/);
  assert.match(a.el('detailPriceHint').textContent,/35,000원/);
  const input=a.w.document.querySelector('[data-upload-site="carrot"]');input.checked=true;
  await a.run('toggleUploadSite(0,"carrot",true,document.querySelector("[data-upload-site=carrot]"))');
  const row=a.db.get('1');assert.deepEqual(row.measurements.__productImage,photo);assert.equal(row.measurements.__draft.notice,'구매 안내 1');assert.equal(row.measurements.__uploadSites.carrot,true);await a.close();
});

test('failed original read cannot overwrite an existing image',async()=>{
  const a=harness([fixture(1)]);await until(()=>a.images().length===1);a.failRead(true);
  await assert.rejects(a.w.SelectCloud.saveSaved({id:1,name:'수정',measurements:{__productCode:'S001'}}),/offline/);
  assert.deepEqual(a.db.get('1').measurements.__productImage,photo);
  assert.equal(a.requests.filter(r=>r.operation==='update').length,0);await a.close();
});

test('a failed photo request offers a working retry without repeatedly requesting in the background',async()=>{
  const a=harness([fixture(1)]);const read=a.w.SelectCloud.listSavedImages;let calls=0;
  a.w.SelectCloud.listSavedImages=async()=>{calls++;throw new Error('offline');};
  await until(()=>a.w.document.querySelector('[data-image-action=retry]'));
  await tick();assert.equal(calls,1);
  a.w.SelectCloud.listSavedImages=read;a.w.document.querySelector('[data-image-action=retry]').click();
  await until(()=>a.images().length===1);await a.close();
});

test('restoring a sold product removes its sold state while retaining the photo',async()=>{
  const row=fixture(1);row.measurements.__soldAt='2026-09-23';row.measurements.__status='sold';
  const a=harness([row]);await a.w.SelectCloud.ready();
  const original=await a.w.SelectCloud.getSaved(1);delete original.measurements.__soldAt;delete original.measurements.__status;
  const restored=await a.w.SelectCloud.saveSaved(original);
  assert.equal(restored.measurements.__soldAt,undefined);assert.deepEqual(a.db.get('1').measurements.__productImage,photo);await a.close();
});

test('photo replacement and deletion stay on the target product and do not reload the whole list',async()=>{
  const a=harness([fixture(1),fixture(2)]);await until(()=>a.images().length===2);
  const indexRequests=()=>a.requests.filter(r=>r.selection.includes('m_productCode')).length;
  const initial=indexRequests();
  a.w.Image=class {constructor(){this.width=720;this.height=540;}set src(value){queueMicrotask(()=>this.onload());}};
  a.w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});
  a.w.HTMLCanvasElement.prototype.toDataURL=()=>photo2.src;
  a.w.document.querySelector('[data-image-action=preview]').click();
  assert.equal(a.el('productImageModal').hidden,false);
  a.w.document.querySelector('[data-modal-image-action=replace]').click();
  const input=a.el('productImageInput');Object.defineProperty(input,'files',{configurable:true,value:[new a.w.File(['photo'],'test.png',{type:'image/png'})]});
  await input.onchange();
  assert.deepEqual(a.db.get('2').measurements.__productImage,photo2);assert.deepEqual(a.db.get('1').measurements.__productImage,photo);
  assert.equal(indexRequests(),initial);
  a.w.document.querySelector('[data-image-action=preview]').click();a.w.document.querySelector('[data-modal-image-action=remove]').click();
  await until(()=>a.db.get('2').measurements.__productImage===null);
  await a.run('loadSaved()');await until(()=>a.images().length===1);
  assert.ok(a.db.get('2').measurements.__productImageDeletedAt);await a.close();
});

test('stale image responses cannot undo a newer photo saved during loading',async()=>{
  const a=harness([fixture(1)]);let release;a.delayImages(new Promise(resolve=>{release=resolve;}));
  await until(()=>a.requests.some(r=>r.selection==='id,measurements'));
  const newer=await a.w.SelectCloud.updateSavedMetadata(1,{__productImage:photo2});
  a.w.newer=newer;a.run('saved[0]=newer;render()');release();
  await until(()=>a.images().length===1);
  assert.equal(a.images()[0].getAttribute('src'),photo2.src);await a.close();
});

test('restoring a large pre-existing photo does not silently clear it',()=>{
  const dom=new JSDOM('<img id="productPhotoPreview"><button id="removeProductPhoto"></button><textarea id="instagramCaption"></textarea>',{runScripts:'outside-only'});
  dom.window.eval(source('product-editor.js'));
  const large={src:'data:image/jpeg;base64,'+'A'.repeat(360000)};
  dom.window.SelectProductEditor.restore({productImage:large});
  assert.equal(dom.window.SelectProductEditor.read().productImage.src,large.src);
  assert.throws(()=>dom.window.SelectProductEditor.image(large),/250KB/);
  dom.window.close();
});

test('sold numbers remain reserved and simultaneous new saves receive consecutive fresh numbers without photos',async()=>{
  const sold=fixture(1);sold.measurements.__productCode='S999';sold.measurements.__soldAt='2026-09-25';sold.measurements.__status='sold';
  const a=harness([sold,fixture(2)]);await a.w.SelectCloud.ready();
  const fresh={brand:'신상품',name:'사진 없는 상품',productType:'상의',size:'L',condition:'A',price:10000,description:'',measurements:{}};
  const created=await Promise.all([a.w.SelectCloud.saveSaved({...fresh,id:Date.now()}),a.w.SelectCloud.saveSaved({...fresh,id:Date.now()+1})]);
  assert.deepEqual(created.map(p=>p.measurements.__productCode),['S1000','S1001']);
  assert.equal(a.db.get('1').measurements.__productCode,'S999');
  await a.run('loadSaved()');
  const index=a.run('saved.findIndex(p=>p.id===2)');await a.run(`markSold(${index})`);
  assert.equal(a.db.get('2').measurements.__productCode,'S002');
  const latest=await a.w.SelectCloud.saveSaved({...fresh,id:Date.now()+2});assert.equal(latest.measurements.__productCode,'S1002');
  await a.w.SelectCloud.updateSavedMetadata(1,{__productCode:null});assert.equal(a.db.get('1').measurements.__productCode,'S999');
  await a.close();
});

test('old sold and active duplicates keep their numbers while missing codes are assigned after every reserved number',async()=>{
  const sold=fixture(1),active=fixture(2),missing=fixture(3);
  sold.measurements.__soldAt='2026-09-25';active.measurements.__productCode='S001';delete missing.measurements.__productCode;
  const a=harness([sold,active,missing]);await until(()=>a.db.get('3').measurements.__productCode);
  assert.equal(a.db.get('1').measurements.__productCode,'S001');assert.equal(a.db.get('2').measurements.__productCode,'S001');
  assert.equal(a.db.get('3').measurements.__productCode,'S002');await a.close();
});

test('location selection saves immediately and survives reload, edits, photo replacement, sale and restore',async()=>{
  const a=harness([fixture(1)]);await until(()=>a.images().length===1);
  const control=()=>a.w.document.querySelector('[data-storage-id="1"]');
  const actionGroup=control().closest('.actions');assert.ok(actionGroup.querySelector('[data-saved-sold]'));assert.equal(actionGroup.querySelector('[data-saved-sold]').nextElementSibling,control());
  assert.doesNotMatch(a.el('tableHead').textContent,/보관 위치/);
  assert.deepEqual([...control().options].filter(o=>!o.disabled).map(o=>o.value),['1호점','2호점','창고']);
  const before=a.requests.filter(r=>r.selection.includes('__soldAt')).length;
  control().value='2호점';control().dispatchEvent(new a.w.Event('change',{bubbles:true}));
  assert.equal(control().disabled,true);await until(()=>!control().disabled);
  assert.equal(a.db.get('1').measurements.__storageLocation,'2호점');assert.deepEqual(a.db.get('1').measurements.__productImage,photo);
  assert.equal(a.requests.filter(r=>r.selection.includes('__soldAt')).length,before);
  await a.run('loadSaved()');assert.equal(control().value,'2호점');
  await a.run('editSaved(0)');a.el('editName').value='수정한 상품';await a.run('saveEdit()');
  assert.equal(a.db.get('1').measurements.__storageLocation,'2호점');
  await a.w.SelectCloud.updateSavedMetadata(1,{__productImage:photo2});
  await a.run('markSold(0)');assert.equal(a.db.get('1').measurements.__storageLocation,'2호점');
  const sold=harness([...a.db.values()],{file:'products/sold/index.html'});await until(()=>sold.w.document.querySelector('[data-storage-id="1"]'));
  assert.match(sold.el('tableBody').textContent,/S001/);assert.equal(sold.w.document.querySelector('[data-storage-id="1"]').value,'2호점');
  await sold.run('restoreSold(0)');const restored=sold.db.get('1');
  assert.equal(restored.measurements.__productCode,'S001');assert.equal(restored.measurements.__storageLocation,'2호점');assert.deepEqual(restored.measurements.__productImage,photo2);
  await a.close();await sold.close();
});

test('failed location saves restore the previous selection without modifying product data',async()=>{
  const row=fixture(1);row.measurements.__storageLocation='창고';const a=harness([row]);await until(()=>a.images().length===1);
  a.failRead(true);const select=a.w.document.querySelector('[data-storage-id="1"]');select.value='1호점';select.dispatchEvent(new a.w.Event('change',{bubbles:true}));
  await until(()=>!select.disabled);assert.equal(select.value,'창고');assert.equal(a.db.get('1').measurements.__storageLocation,'창고');assert.equal(a.alerts.length,1);await a.close();
});

test('local writing and list editing preserve old numbers and locations and never fill sold-number gaps',async()=>{
  const a=harness([],{file:'index.html',local:true});await a.w.SelectCloud.ready();
  a.w.localStorage.setItem('select-saved-products',JSON.stringify([{id:1,name:'판매완료',measurements:{__productCode:'S900',__soldAt:'2026-09-25'}}]));
  a.el('name').value='새 상품';await a.run('saveCurrentProduct()');
  let products=JSON.parse(a.w.localStorage.getItem('select-saved-products'));assert.equal(products[0].measurements.__productCode,'S901');
  products[0].measurements.__storageLocation='창고';
  const b=harness([],{local:true});await b.w.SelectCloud.ready();b.w.localStorage.setItem('select-saved-products',JSON.stringify(products));await b.run('loadSaved()');
  const select=b.w.document.querySelector(`[data-storage-id="${products[0].id}"]`);select.value='1호점';select.dispatchEvent(new b.w.Event('change',{bubbles:true}));await until(()=>!select.disabled);
  await b.run('editSaved(0)');b.el('editName').value='수정한 새 상품';await b.run('saveEdit()');
  const edited=JSON.parse(b.w.localStorage.getItem('select-saved-products'))[0];assert.equal(edited.measurements.__productCode,'S901');assert.equal(edited.measurements.__storageLocation,'1호점');
  await a.close();await b.close();
});
