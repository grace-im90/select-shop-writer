(function () {
  'use strict';
  if (!/\/products\/?$/.test(location.pathname) || window.__selectBunjangExportLoaded) return;
  window.__selectBunjangExportLoaded = true;
  const C = window.SelectBunjangExport;
  if (!C) return;
  const templateUrl = new URL('../assets/bgzt_template_202604.xlsx', document.currentScript?.src || location.href);
  const state = { selected: new Set(), rows: [], owner: null, busy: false, galleryBusy: false, gender: 'men', prepared: false, batchId: '', photos: [], photoRow: null };
  const $ = id => document.getElementById(id);
  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const owner = () => window.SelectCloud?.user?.id || 'local';
  const item = id => saved.find(p => String(p.id) === String(id));
  let templatePromise = null, previousFocus = null, galleryFocus = null, photoMode = 'append', started = false;
  function assertOwner(expected) { if (owner() !== expected) throw new Error('로그인 계정이 변경됐습니다. 상품을 다시 선택해 주세요.'); }
  function message(text, error = false, target = 'bjMessage') { const el = $(target); if (el) { el.textContent = text; el.classList.toggle('error', error); } }
  function dateRange() { return [$('bjFrom')?.value || '', $('bjTo')?.value || '']; }
  function selectionChanged() { state.prepared = false; if ($('bjPending')) $('bjPending').disabled = true; }
  function ensureToolbar() {
    if ($('bjToolbar')) return;
    const anchor = $('productStatusFilters') || document.querySelector('.tools');
    if (!anchor) return;
    const toolbar = document.createElement('section'); toolbar.id = 'bjToolbar'; toolbar.className = 'bj-toolbar'; toolbar.setAttribute('aria-label', '번개장터 일괄등록 파일');
    toolbar.innerHTML = '<h3>번개장터 일괄등록</h3><p>상품을 골라 엑셀과 사진을 한 번에 준비하세요. 등록완료·등록대기 상품은 선택에서 제외됩니다.</p>' +
      '<div class="bj-dates"><label>수정일 시작<input id="bjFrom" type="date"></label><label>수정일 종료<input id="bjTo" type="date"></label><button type="button" class="bj-button" id="bjToday">오늘</button><button type="button" class="bj-button" id="bjDatesReset">기간 해제</button></div>' +
      '<div class="bj-actions"><button type="button" class="bj-button" id="bjSelectMissing">조건에 맞는 번개 미등록 선택</button><button type="button" class="bj-button" id="bjClear">선택 해제</button><span id="bjCount" class="bj-count">0개 선택</span><button type="button" class="bj-button primary" id="bjReview">등록파일 준비</button></div><div id="bjMessage" class="bj-message" role="status" aria-live="polite"></div>';
    anchor.after(toolbar);
    const datesChanged = () => { page = 1; render(); };
    $('bjFrom').onchange = datesChanged; $('bjTo').onchange = datesChanged;
    $('bjToday').onclick = () => { $('bjFrom').value = $('bjTo').value = C.dateKey(new Date()); datesChanged(); };
    $('bjDatesReset').onclick = () => { $('bjFrom').value = $('bjTo').value = ''; datesChanged(); };
    $('bjClear').onclick = () => { state.selected.clear(); selectionChanged(); enhance(); };
    $('bjSelectMissing').onclick = () => {
      const [from,to] = dateRange(); if (from && to && from > to) return message('시작일은 종료일보다 늦을 수 없습니다.', true);
      const candidates = filtered().filter(C.eligible); state.selected = new Set(candidates.slice(0,C.LIMITS.products).map(p=>String(p.id))); selectionChanged(); enhance();
      message(candidates.length > 50 ? `조건에 맞는 ${candidates.length}개 중 최신 50개를 선택했습니다. 나머지는 다음 파일로 준비해 주세요.` : `${state.selected.size}개를 선택했습니다. 카테고리와 사진을 확인한 뒤 파일을 준비해 주세요.`);
    };
    $('bjReview').onclick = openReview;
  }
  function enhance() {
    ensureToolbar(); if (!$('bjToolbar')) return;
    if (state.owner !== owner()) {
      state.owner = owner(); state.selected.clear(); state.rows = []; selectionChanged();
      if ($('bjOverlay') && !$('bjOverlay').hidden) closeReview(true);
    }
    for (const id of state.selected) { const p = item(id); if (!p || !C.eligible(p)) state.selected.delete(id); }
    $('bjCount').textContent = `${state.selected.size}개 선택 · 최대 50개`;
    $('bjReview').disabled = state.busy || !state.selected.size;
    const [from,to] = dateRange();
    if (from && to && from > to) message('시작일은 종료일보다 늦을 수 없습니다.', true);
    const head = $('tableHead')?.querySelector('tr');
    if (head && !head.querySelector('[data-bj-select-head]')) {
      const cell = document.createElement('th'); cell.className = 'bj-select-cell'; cell.dataset.bjSelectHead = '';
      cell.innerHTML = '<input type="checkbox" id="bjSelectPage" aria-label="현재 페이지 번개 미등록 선택">'; head.prepend(cell);
      cell.querySelector('input').onchange = event => {
        for (const input of document.querySelectorAll('[data-bj-select]:not(:disabled)')) {
          if (event.target.checked && state.selected.size < 50) state.selected.add(input.dataset.bjSelect);
          if (!event.target.checked) state.selected.delete(input.dataset.bjSelect);
        }
        selectionChanged(); enhance();
      };
    }
    const pageInputs = [];
    for (const row of $('tableBody')?.querySelectorAll('tr') || []) {
      const index = Number(row.querySelector('[data-saved-open]')?.dataset.savedOpen), p = saved[index]; if (!p) continue;
      let cell = row.querySelector('[data-bj-selection]');
      if (!cell) { cell = document.createElement('td'); cell.dataset.bjSelection = ''; cell.className = 'bj-select-cell'; row.prepend(cell); }
      const id = String(p.id), pending = C.pending(p);
      cell.innerHTML = `<input type="checkbox" data-bj-select="${escHtml(id)}" aria-label="${escHtml(C.code(p)||p.name)} 번개 등록파일 선택" ${state.selected.has(id)?'checked':''} ${C.eligible(p)?'':'disabled'}>` +
        (pending ? `<span class="bj-pending">번개 대기</span><button type="button" class="bj-reset" data-bj-reset="${escHtml(id)}">대기 해제</button>` : '');
      if (C.eligible(p)) pageInputs.push(cell.querySelector('input'));
    }
    const all = $('bjSelectPage'); if (all) { all.disabled = !pageInputs.length; all.checked = pageInputs.length > 0 && pageInputs.every(input=>input.checked); all.indeterminate = !all.checked && pageInputs.some(input=>input.checked); }
  }
  async function metadata(id, changes, expected = owner()) {
    assertOwner(expected); const p = item(id); if (!p) throw new Error('상품을 찾지 못했습니다.');
    let updated;
    if (window.SelectCloud?.user) updated = await SelectCloud.updateSavedMetadata(id, changes);
    else {
      const stored = C.measurements(p), patch = typeof changes === 'function' ? changes(stored) : changes;
      updated = {...p,measurements:{...stored,...patch},updatedAt:new Date().toISOString()}; saveLocalSavedProduct(updated);
    }
    assertOwner(expected); const index = saved.findIndex(p=>String(p.id)===String(id)); if (index >= 0) saved[index] = updated;
    return updated;
  }
  async function batches(items, action, width = 3) {
    for (let start=0;start<items.length;start+=width) await Promise.all(items.slice(start,start+width).map(action));
  }
  function ensureDialog() {
    if ($('bjOverlay')) return;
    const overlay = document.createElement('div'); overlay.id = 'bjOverlay'; overlay.className = 'bj-overlay'; overlay.hidden = true;
    overlay.innerHTML = '<section class="bj-dialog" role="dialog" aria-modal="true" aria-labelledby="bjTitle"><div class="bj-head"><h2 id="bjTitle">번개장터 등록파일 준비</h2><button type="button" id="bjClose" class="bj-close" aria-label="등록파일 창 닫기">×</button></div><div class="bj-scroll"><p>카테고리·사이즈·가격·사진을 확인해 주세요. 저장된 대표사진은 한 장만 포함되며, 상세사진은 사진 관리에서 추가할 수 있습니다.</p><div class="bj-defaults"><label>카테고리 기본 성별<select id="bjGender"><option value="men">남성</option><option value="women">여성</option></select></label><label>일반택배 배송비<input id="bjShipping" type="number" min="0" step="100" value="4000">원 별도</label><span>직거래 불가 · 수량 1개</span></div><div class="bj-review-wrap"><table class="bj-review"><thead><tr><th>상품명 · 품번</th><th>번개 카테고리</th><th>사이즈</th><th>판매가격</th><th>상품 상태</th><th>사진</th></tr></thead><tbody id="bjRows"></tbody></table></div></div><div class="bj-foot"><div id="bjReviewMessage" class="bj-message" role="status" aria-live="polite"></div><button type="button" id="bjDownload" class="bj-button primary">엑셀·사진 ZIP 다운로드</button><a href="https://seller.bunjang.co.kr/proshop/feature/mass-upload/upload" target="_blank" rel="noopener noreferrer">번개장터 판매자센터 열기</a><button type="button" id="bjPending" class="bj-button" disabled>등록 요청을 마쳤어요</button><small>파일 준비만으로 판매글이 등록되지는 않습니다. 판매자센터에서 접수한 뒤 ‘등록 요청을 마쳤어요’를 눌러 중복 선택을 막아 주세요.</small></div></section>';
    document.body.appendChild(overlay); $('bjClose').onclick = () => closeReview(); overlay.onclick = event => { if (event.target === overlay) closeReview(); };
    $('bjDownload').onclick = prepareFiles; $('bjPending').onclick = markPending;
    $('bjGender').onchange = () => {
      state.gender = $('bjGender').value;
      for (const row of state.rows) if (!row.categoryEdited) { row.categoryId = C.categoryFor(row.product,state.gender); row.customCategory = false; }
      selectionChanged(); drawReview();
    };
    $('bjShipping').oninput = selectionChanged;
    $('bjRows').oninput = event => {
      const field = event.target.dataset.bjField, row = state.rows[Number(event.target.dataset.bjRow)]; if (!row || !field) return;
      row[field] = ['price','condition'].includes(field) ? Number(event.target.value) : event.target.value;
      selectionChanged(); message('',false,'bjReviewMessage');
    };
    $('bjRows').onchange = event => {
      if (event.target.dataset.bjField !== 'categoryId' || event.target.tagName !== 'SELECT') return;
      const row = state.rows[Number(event.target.dataset.bjRow)]; row.categoryEdited = true;
      row.customCategory = event.target.value === 'custom'; row.categoryId = row.customCategory ? '' : Number(event.target.value);
      selectionChanged(); drawReview();
    };
    $('bjRows').onclick = event => { const button = event.target.closest('[data-bj-photos]'); if (button) openGallery(Number(button.dataset.bjPhotos),button); };
  }
  function drawReview() {
    $('bjGender').value = state.gender;
    $('bjRows').innerHTML = state.rows.map((row,index)=>`<tr><td><input class="bj-title-input" maxlength="40" data-bj-field="title" data-bj-row="${index}" aria-label="${row.code} 상품명" value="${escHtml(row.title)}"><small>${escHtml(row.code)} · ${row.description.length}/2,000자</small></td><td><select class="bj-category" data-bj-field="categoryId" data-bj-row="${index}" aria-label="${row.code} 카테고리"><option value="">분류 선택</option>${C.categories.map(([id,label])=>`<option value="${id}" ${Number(row.categoryId)===id?'selected':''}>${label}</option>`).join('')}<option value="custom" ${row.customCategory?'selected':''}>다른 카테고리 ID 입력</option></select>${row.customCategory?`<input class="bj-custom" inputmode="numeric" data-bj-field="categoryId" data-bj-row="${index}" aria-label="${row.code} 카테고리 ID" value="${escHtml(row.categoryId)}" placeholder="판매자센터의 카테고리 ID">`:''}</td><td><input class="bj-size" data-bj-field="size" data-bj-row="${index}" aria-label="${row.code} 사이즈" value="${escHtml(row.size)}"></td><td><input class="bj-price" type="number" min="1" data-bj-field="price" data-bj-row="${index}" aria-label="${row.code} 판매가격" value="${row.price||''}"></td><td><select data-bj-field="condition" data-bj-row="${index}" aria-label="${row.code} 상품 상태"><option value="">선택</option>${[[1,'새 상품 (미사용)'],[2,'사용감 없음'],[3,'사용감 적음'],[4,'사용감 많음'],[5,'고장/파손']].map(([id,label])=>`<option value="${id}" ${Number(row.condition)===id?'selected':''}>${label}</option>`).join('')}</select></td><td><button type="button" class="bj-button" data-bj-photos="${index}" aria-label="${row.code} 사진 관리">사진 ${row.photos.length}장 관리</button><small>${row.photos.length===1?'대표컷만 포함됩니다.':'최대 12장 · 표시 순서로 저장'}</small></td></tr>`).join('');
  }
  async function openReview() {
    if (state.busy || !state.selected.size) return;
    const expected = owner(), ids = [...state.selected]; state.busy = true; enhance(); message('선택한 상품 원본을 불러오고 있습니다.');
    try {
      const rows = [];
      await batches(ids, async id => { const p = await hydrateSaved(id); assertOwner(expected); if (!p || !C.eligible(p)) throw new Error((C.code(p)||id)+' 상품은 이미 등록됐거나 등록대기·판매완료 상태입니다.'); rows.push(C.details(p,savedText(p),state.gender)); },4);
      state.rows = ids.map(id=>rows.find(row=>row.id===id)); selectionChanged(); ensureDialog(); drawReview(); previousFocus = document.activeElement;
      $('bjOverlay').hidden = false; document.body.classList.add('bj-modal-open'); $('bjClose').focus(); message('',false,'bjReviewMessage'); message('');
    } catch (error) { message(error.message||'상품 정보를 불러오지 못했습니다.',true); }
    finally { state.busy = false; enhance(); }
  }
  function closeReview(force = false) {
    if ((state.busy || state.galleryBusy) && !force) return;
    if ($('bjGallery')) $('bjGallery').hidden = true;
    if ($('bjOverlay')) { $('bjOverlay').hidden = true; $('bjOverlay').inert = false; }
    document.body.classList.remove('bj-modal-open'); previousFocus?.focus?.();
  }
  function ensureGallery() {
    if ($('bjGallery')) return;
    const overlay = document.createElement('div'); overlay.id = 'bjGallery'; overlay.className = 'bj-overlay'; overlay.hidden = true;
    overlay.innerHTML = '<section class="bj-dialog bj-gallery" role="dialog" aria-modal="true" aria-labelledby="bjGalleryTitle"><div class="bj-head"><h2 id="bjGalleryTitle">상품 사진 관리</h2><button type="button" class="bj-close" id="bjGalleryClose" aria-label="사진 관리 닫기">×</button></div><div class="bj-scroll"><p>앞면·뒷면·디테일·라벨 순서로 최대 12장을 준비해 주세요. 첫 사진이 대표 이미지가 됩니다. 사진은 비율을 유지해 최대 1,280px로 압축 저장합니다.</p><div class="bj-actions"><button type="button" class="bj-button" id="bjPhotoAdd">사진 추가</button><button type="button" class="bj-button" id="bjPhotoReplace">전체 교체</button><button type="button" class="bj-button" id="bjPhotoPrimary">대표사진만 사용</button><input type="file" id="bjPhotoInput" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden></div><div id="bjGalleryList" class="bj-gallery-list"></div></div><div class="bj-foot"><div id="bjGalleryMessage" class="bj-message" role="status" aria-live="polite"></div><button type="button" class="bj-button primary" id="bjGallerySave">사진 저장</button></div></section>';
    document.body.appendChild(overlay); $('bjGalleryClose').onclick = closeGallery; overlay.onclick = event => { if (event.target === overlay) closeGallery(); };
    for (const [id,mode] of [['bjPhotoAdd','append'],['bjPhotoReplace','replace']]) $(id).onclick = () => { if (state.galleryBusy) return; photoMode = mode; $('bjPhotoInput').value = ''; $('bjPhotoInput').click(); };
    $('bjPhotoPrimary').onclick = () => { const p=state.rows[state.photoRow].product, copy={...p,measurements:{...C.measurements(p)}}; delete copy.measurements.__bunjangPhotos; state.photos=C.images(copy); drawGallery(); };
    $('bjPhotoInput').onchange = async event => {
      const files=[...event.target.files]; if (!files.length) return;
      const starting=photoMode==='replace'?[]:state.photos;
      if (starting.length+files.length>12) return message('한 상품에 사진 12장까지 추가할 수 있습니다.',true,'bjGalleryMessage');
      state.galleryBusy=true; galleryButtons();
      try {
        const expected=owner(), added=[];
        for (let n=0;n<files.length;n++) { message(`사진 준비 중 ${n+1}/${files.length}`,false,'bjGalleryMessage'); added.push({src:await compressedPhoto(files[n])}); assertOwner(expected); }
        state.photos=[...starting,...added]; drawGallery(); message('사진 저장을 누르면 다음에도 이 사진 묶음을 사용할 수 있습니다.',false,'bjGalleryMessage');
      } catch(error) { message(error.message||'사진을 준비하지 못했습니다.',true,'bjGalleryMessage'); }
      finally {state.galleryBusy=false;galleryButtons();}
    };
    $('bjGalleryList').onclick = event => {
      const action=event.target.dataset.bjPhotoAction,index=Number(event.target.dataset.index); if (!action||state.galleryBusy) return;
      if(action==='remove')state.photos.splice(index,1);
      else {const other=index+(action==='before'?-1:1);if(other>=0&&other<state.photos.length)[state.photos[index],state.photos[other]]=[state.photos[other],state.photos[index]];}
      drawGallery();
    };
    $('bjGallerySave').onclick = async () => {
      if (state.galleryBusy) return; state.galleryBusy=true; galleryButtons();
      try {
        const row=state.rows[state.photoRow], expected=owner();
        const updated=await metadata(row.id,{__bunjangPhotos:state.photos.map(p=>({src:p.src})),__bunjangPhotoCount:state.photos.length},expected);
        row.product=updated;row.photos=C.images(updated);selectionChanged();drawReview();state.galleryBusy=false;closeGallery();
        message(`${row.code} 사진 ${row.photos.length}장을 저장했습니다.`,false,'bjReviewMessage');
      } catch(error) {message(error.message||'사진을 저장하지 못했습니다.',true,'bjGalleryMessage');}
      finally {state.galleryBusy=false;galleryButtons();}
    };
  }
  function galleryButtons() { for(const button of $('bjGallery')?.querySelectorAll('button')||[]) button.disabled=state.galleryBusy; }
  function openGallery(index,button) { ensureGallery();state.photoRow=index;state.photos=state.rows[index].photos.map(p=>({...p}));galleryFocus=button;$('bjGalleryTitle').textContent=state.rows[index].code+' 상품 사진';drawGallery();message('',false,'bjGalleryMessage');$('bjOverlay').inert=true;$('bjGallery').hidden=false;$('bjGalleryClose').focus(); }
  function closeGallery() {if(state.galleryBusy)return;$('bjGallery').hidden=true;$('bjOverlay').inert=false;(galleryFocus?.isConnected?galleryFocus:$('bjClose'))?.focus();}
  function drawGallery() { $('bjGalleryList').innerHTML=state.photos.map((photo,index)=>`<div class="bj-photo"><img src="${escHtml(photo.src)}" alt="선택 사진 ${index+1}"><span>${index+1}${index===0?' · 대표 이미지':''}</span><div class="bj-photo-controls"><button type="button" data-bj-photo-action="before" data-index="${index}" ${index===0?'disabled':''} aria-label="사진 ${index+1} 앞으로">앞으로</button><button type="button" data-bj-photo-action="after" data-index="${index}" ${index===state.photos.length-1?'disabled':''} aria-label="사진 ${index+1} 뒤로">뒤로</button><button type="button" data-bj-photo-action="remove" data-index="${index}" aria-label="사진 ${index+1} 제외">제외</button></div></div>`).join(''); }
  async function loadImage(blob) {
    const src=URL.createObjectURL(blob);
    try {return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('지원하지 않는 사진입니다. JPEG 또는 PNG 파일로 다시 선택해 주세요.'));image.src=src;});}
    finally {URL.revokeObjectURL(src);}
  }
  async function compressedPhoto(blob) {
    if (blob.size>30*1024*1024) throw new Error('사진 한 장은 30MB 이하로 준비해 주세요.');
    const image=await loadImage(blob);
    for(const bound of [1280,1024,800]){
      const scale=Math.min(1,bound/image.naturalWidth,bound/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('사진 변환을 지원하지 않는 브라우저입니다.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.7,.55]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length*3/4<=300*1024)return data;}
    }
    throw new Error('사진 용량을 줄이지 못했습니다. 작은 JPEG 파일을 선택해 주세요.');
  }
  async function fetchBlob(src) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try {const response=await fetch(src,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('사진을 불러오지 못했습니다.');return await response.blob();}
    finally{clearTimeout(timer);}
  }
  async function photoFile(src) {
    let blob=await fetchBlob(src),bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes[0]===0xff&&bytes[1]===0xd8)return{bytes,ext:'jpg'};
    if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return{bytes,ext:'png'};
    blob=await fetchBlob(await compressedPhoto(blob));return{bytes:new Uint8Array(await blob.arrayBuffer()),ext:'jpg'};
  }
  function busy(value) {state.busy=value;for(const button of $('bjOverlay').querySelectorAll('button'))button.disabled=value;for(const field of $('bjOverlay').querySelectorAll('input,select'))field.disabled=value;$('bjPending').disabled=value||!state.prepared;enhance();}
  function download(blob,name) {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function prepareFiles() {
    if(state.busy)return;const errors=C.errors(state.rows),fee=Number($('bjShipping').value);
    if(!Number.isSafeInteger(fee)||fee<0||fee>999999)errors.push('배송비를 0원 이상의 정수로 입력해 주세요.');
    if(errors.length)return message(errors.join('\n'),true,'bjReviewMessage');
    if(!window.JSZip)return message('파일 준비 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.',true,'bjReviewMessage');
    const expected=owner();state.prepared=false;busy(true);
    try{
      const zip=new JSZip(),filenames={},photoTotal=state.rows.reduce((n,row)=>n+row.photos.length,0);let done=0,bytesTotal=0;
      for(const row of state.rows){
        filenames[row.id]=[];
        for(let n=0;n<row.photos.length;n++){
          message(`사진 준비 중 ${++done}/${photoTotal} · ${row.code}`,false,'bjReviewMessage');
          let photo;try{photo=await photoFile(row.photos[n].src);}catch(error){throw new Error(`${row.code} 사진 ${n+1}: ${error.message}`);}assertOwner(expected);
          bytesTotal+=photo.bytes.byteLength;if(bytesTotal>100*1024*1024)throw new Error('사진 합계가 100MB를 넘습니다. 상품을 나눠서 준비해 주세요.');
          const name=row.code+'_'+String(n+1).padStart(2,'0')+'.'+photo.ext;filenames[row.id].push(name);zip.file('photos/'+name,photo.bytes);
        }
      }
      message('엑셀 파일을 만들고 있습니다.',false,'bjReviewMessage');
      if(!templatePromise)templatePromise=fetch(templateUrl,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('엑셀 양식을 불러오지 못했습니다.');return r.arrayBuffer();}).catch(error=>{templatePromise=null;throw error;});
      const workbook=await JSZip.loadAsync(await templatePromise),sheet=workbook.file('xl/worksheets/sheet1.xml');
      if(!sheet)throw new Error('엑셀 양식이 올바르지 않습니다.');
      workbook.file('xl/worksheets/sheet1.xml',C.fillWorksheet(await sheet.async('string'),C.workbookRows(state.rows,filenames,fee)),{createFolders:false});
      const stamp=C.dateKey(new Date()).replace(/-/g,''),base=`bunjang_${stamp}_${state.rows.length}items`;
      zip.file(base+'.xlsx',await workbook.generateAsync({type:'uint8array',compression:'DEFLATE'}));
      zip.file('등록안내.txt',`번개장터 등록파일\n상품 ${state.rows.length}개 / 사진 ${photoTotal}장\n\n1. 압축을 풉니다.\n2. 번개장터 판매자센터 > 상품 일괄등록 > 상품 등록하기에서 엑셀 파일을 업로드합니다.\n3. 이미지 통합 업로드에서 photos 폴더의 사진 전체를 선택합니다.\n4. 오류 표시와 상품 정보를 확인한 뒤 전체 상품 등록을 누릅니다.\n5. 접수 성공 후 상품 목차의 ‘등록 요청을 마쳤어요’를 누릅니다.\n6. 실제 판매글이 생성되면 목차의 ‘번개장터 업로드 완료’를 체크합니다.\n\n일반택배 ${fee.toLocaleString('ko-KR')}원 별도 / 직거래 불가 / 상품별 수량 1개\n파일 준비만으로 판매글이 자동 등록되지 않습니다. 같은 파일을 중복 등록하지 마세요.\n\nhttps://seller.bunjang.co.kr/proshop/feature/mass-upload/upload\n`);
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'});assertOwner(expected);
      state.batchId='bj-'+Date.now();let saveFailed=false;
      await batches(state.rows,async row=>{try{const updated=await metadata(row.id,m=>({__bunjangSettings:{...m.__bunjangSettings,title:row.title,categoryId:Number(row.categoryId),size:row.size,condition:Number(row.condition)},__bunjangExport:{...m.__bunjangExport,preparedAt:new Date().toISOString(),batchId:state.batchId}}),expected);row.product=updated;}catch(error){assertOwner(expected);saveFailed=true;}});
      assertOwner(expected);download(blob,base+'.zip');state.prepared=true;
      message(`${state.rows.length}개 상품 · 사진 ${photoTotal}장 파일을 준비했습니다. 압축을 풀어 엑셀과 사진을 업로드하세요.${saveFailed?' 일부 설정을 저장하지 못했지만 등록파일에는 입력한 값이 반영돼 있습니다.':''}`,false,'bjReviewMessage');
    }catch(error){message(error.message||'등록파일을 만들지 못했습니다.',true,'bjReviewMessage');}
    finally{busy(false);}
  }
  async function markPending() {
    if(state.busy||!state.prepared)return;const expected=owner();busy(true);
    try{
      const at=new Date().toISOString();
      await batches(state.rows,row=>metadata(row.id,m=>({__bunjangExport:{...m.__bunjangExport,pendingAt:at,batchId:state.batchId}}),expected));
      state.selected.clear();state.prepared=false;busy(false);closeReview();render();message(`${state.rows.length}개 상품을 번개 등록대기로 표시했습니다. 실제 판매글을 확인한 뒤 기존 번개장터 업로드 완료를 체크해 주세요.`);
    }catch(error){message(error.message||'일부 등록대기 표시를 저장하지 못했습니다. 다시 시도해 주세요.',true,'bjReviewMessage');}
    finally{busy(false);}
  }
  document.addEventListener('change',event=>{
    const id=event.target.dataset.bjSelect;if(!id)return;
    if(event.target.checked&&state.selected.size>=50){event.target.checked=false;return message('상품은 한 번에 50개까지 선택할 수 있습니다.',true);}
    if(event.target.checked&&C.eligible(item(id)))state.selected.add(id);else state.selected.delete(id);selectionChanged();enhance();
  });
  document.addEventListener('click',async event=>{
    const id=event.target.dataset.bjReset;if(!id||state.busy)return;event.target.disabled=true;
    try{await metadata(id,m=>({__bunjangExport:{...m.__bunjangExport,pendingAt:null}}));render();message('등록대기 표시를 해제했습니다. 실제 번개장터 판매글은 변경하지 않았습니다.');}
    catch(error){message(error.message||'대기 표시를 해제하지 못했습니다.',true);event.target.disabled=false;}
  });
  document.addEventListener('keydown',event=>{
    const overlay=$('bjGallery')&&!$('bjGallery').hidden?$('bjGallery'):$('bjOverlay')&&!$('bjOverlay').hidden?$('bjOverlay'):null;if(!overlay)return;
    if(event.key==='Escape'){event.preventDefault();overlay.id==='bjGallery'?closeGallery():closeReview();}
    if(event.key==='Tab'){
      const controls=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled),a[href]')].filter(e=>!e.hidden),first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  function start(){
    if(started)return;
    if(typeof render!=='function'||typeof filtered!=='function')return;
    started=true;
    const baseRender=render,baseFiltered=filtered,baseToggle=toggleUploadSite;
    filtered=function(){const[from,to]=dateRange();return baseFiltered().filter(p=>C.inDateRange(p,from,to));};
    render=function(){baseRender();enhance();};
    toggleUploadSite=async function(){const result=await baseToggle.apply(this,arguments);enhance();return result;};
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
