import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const C=require('../products/bunjang-export-core.js');
const JSZip=require('../assets/vendor/jszip.min.js');
const photo={src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9xkAAAAASUVORK5CYII='};
const product=(id=1,measurements={})=>({id,brand:'테스트',name:'후드티 (M)',productType:'상의',size:'M',condition:'A 매우 좋은 상태',price:35000,updatedAt:'2026-11-23T16:00:00Z',measurements:{__productCode:'S'+String(id).padStart(3,'0'),__productImage:photo,...measurements}});
test('eligible excludes sold, uploaded, pending, and missing products',()=>{
  assert.equal(C.eligible(product()),true);assert.equal(C.eligible(undefined),false);
  for(const p of [product(1,{__soldAt:'2026-11-24'}),product(1,{__status:'sold'}),product(1,{__uploadSites:{bunjang:true}}),product(1,{__uploadSites:['번개장터']}),product(1,{__bunjangExport:{pendingAt:'2026-11-24'}})])assert.equal(C.eligible(p),false);
  assert.equal(C.pending(product(1,{__uploadSites:{bunjang:true},__bunjangExport:{pendingAt:'old'}})),false);
});
test('date filtering uses Korean calendar dates at the UTC boundary',()=>{
  const p=product();assert.equal(C.dateKey(p.updatedAt),'2026-11-24');assert.equal(C.inDateRange(p,'2026-11-24','2026-11-24'),true);assert.equal(C.inDateRange(p,'','2026-11-23'),false);
});
test('title keeps product code once, removes unsupported characters, and stays within 40 characters',()=>{
  assert.equal(C.title('브랜드×브랜드 후드티 (M) S001','S001'),'브랜드 x 브랜드 후드티 (M) S001');
  const title=C.title('한글'.repeat(80)+'😀','S001');assert.ok(title.length<=40);assert.ok(title.endsWith(' S001'));assert.equal(title.includes('😀'),false);
});
test('explicit export gallery overrides a thumbnail without inventing extra pictures',()=>{
  assert.deepEqual(C.images(product()),[photo]);assert.deepEqual(C.images(product(1,{__bunjangPhotos:[]})),[]);
  assert.equal(C.images(product(1,{__bunjangPhotos:[photo,photo,photo]})).length,3);
  assert.deepEqual(C.images(product(1,{__productImageDeletedAt:'date'})),[]);
});
test('category gender and saved choices remain reviewable',()=>{
  assert.equal(C.details(product(),'본문','women').categoryId,310260700);
  const r=C.details(product(1,{__bunjangSettings:{categoryId:310260700,size:'Free',condition:3}}),'본문','men');
  assert.equal(r.categoryId,310260700);assert.equal(r.categoryEdited,true);assert.equal(r.size,'Free');assert.equal(r.condition,3);
  assert.equal(C.categoryFor({...product(),name:'원피스',productType:'원피스'}),'');
});
test('validation blocks missing data, duplicate codes, oversized text, and excessive photo counts',()=>{
  const r=C.details(product(),'본문');assert.deepEqual(C.errors([r]),[]);
  for(const patch of [{price:0},{categoryId:''},{size:'표기 없음'},{condition:''},{photos:[]},{description:'a'.repeat(2001)}])assert.ok(C.errors([{...r,...patch}]).length);
  assert.ok(C.errors([r,{...r,id:'other'}]).some(e=>e.includes('중복')));
  assert.ok(C.errors([{...r,photos:Array(13).fill(photo)}]).some(e=>e.includes('1~12')));
});
test('workbook column positions and photo order match the proven Bunjang template',()=>{
  const r=C.details(product(),'첫 줄\n\n본문 & <상세>');const cells=C.workbookRows([r],{'1':['S001_01.png','S001_02.jpg']},4000)[0];
  assert.equal(cells.length,36);assert.equal(cells[0],r.title);assert.equal(cells[1],320210600);assert.equal(cells[3],'M');assert.equal(cells[22],2);assert.equal(cells[23],r.description);assert.equal(cells[24],35000);assert.equal(cells[25],'별도');assert.equal(cells[26],4000);assert.equal(cells[29],'불가능');assert.equal(cells[33],'S001_01.png, S001_02.jpg');assert.equal(cells[34],1);
});
test('real template preserves its first five rows and every other workbook member',async()=>{
  const template=await readFile(new URL('../assets/bgzt_template_202604.xlsx',import.meta.url)),zip=await JSZip.loadAsync(template);
  const source=await zip.file('xl/worksheets/sheet1.xml').async('string'),r=C.details(product(),'첫 줄\n\nA&B <상세>'),data=C.workbookRows([r],{'1':['S001_01.png']});
  const updated=C.fillWorksheet(source,data),headers=s=>(s.match(/<row\b[^>]*>[\s\S]*?<\/row>/g)||[]).filter(row=>Number(row.match(/\br="(\d+)"/)?.[1])<=5);
  assert.deepEqual(headers(updated),headers(source));assert.equal(headers(updated).length,5);assert.match(updated,/r="A6"/);assert.match(updated,/r="AH6"/);assert.match(updated,/A&amp;B &lt;상세&gt;/);assert.ok(updated.includes('첫 줄\n\n'));
  zip.file('xl/worksheets/sheet1.xml',updated,{createFolders:false});const result=await JSZip.loadAsync(await zip.generateAsync({type:'uint8array'}));
  const original=await JSZip.loadAsync(template);assert.deepEqual(Object.keys(result.files).sort(),Object.keys(original.files).sort());
  for(const name of Object.keys(original.files).filter(n=>!original.files[n].dir&&n!=='xl/worksheets/sheet1.xml'))assert.deepEqual(await result.file(name).async('uint8array'),await original.file(name).async('uint8array'));
});
