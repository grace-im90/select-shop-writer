/* Product transfer and media fields shared by manual entry and AI imports. */
(function (root) {
  'use strict';
  const TYPES = ['상의', '하의', '아우터', '원피스', '신발'];
  const CONDITIONS = ['', 'S 미사용급', 'A 매우 좋은 상태', 'B+ 좋은 상태', 'B 자연스러운 사용감', 'C 사용감·하자 있음'];
  const text = value => typeof value === 'string' ? value.normalize('NFC').trim() : '';
  function image(value, stored = false) {
    const src = typeof value === 'string' ? value : value?.src;
    if (value == null || value === '') return null;
    if (typeof src !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src) || (!stored && src.length > 350000)) {
      throw new Error('대표사진은 250KB 이하의 JPEG·PNG·WebP 이미지로 준비해 주세요.');
    }
    return { src };
  }
  function normalize(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('상품 정보 형식이 올바르지 않습니다.');
    const brand = normalizeBrandKorean(text(payload.brand)), size = text(payload.size ?? payload.labelSize);
    let name = text(payload.itemName ?? payload.name);
    if (!brand || !name) throw new Error('브랜드와 상품명이 필요합니다.');
    const sourceBrand = text(payload.brand);
    if (sourceBrand && name.toLowerCase().startsWith(sourceBrand.toLowerCase() + ' ')) name = name.slice(sourceBrand.length).trim();
    if (name.startsWith(brand + ' ')) name = name.slice(brand.length).trim();
    if (size && name.endsWith('(' + size + ')')) name = name.slice(0, -size.length - 2).trim();
    if (size) name += ' (' + size + ')';
    if (Array.from(brand + ' ' + name).length > 25) throw new Error('브랜드·상품명·사이즈를 합쳐 25자 이내로 줄여 주세요.');
    if (size.length > 30 || /[<>]/.test(size)) throw new Error('표기 사이즈를 확인해 주세요.');
    const productType = text(payload.productType ?? payload.type) || '상의';
    const condition = text(payload.condition);
    if (!TYPES.includes(productType) || !CONDITIONS.includes(condition)) throw new Error('상품 종류 또는 컨디션을 확인해 주세요.');
    const description = text(payload.description), instagramCaption = text(payload.instagramCaption ?? payload.instagram);
    if (description.length > 10000 || instagramCaption.length > 5000) throw new Error('상품 설명이나 캡션이 너무 깁니다.');
    return { brand, name, size, productType, condition, description, instagramCaption,
      productImage: image(payload.thumbnail ?? payload.productImage ?? payload.image), price: '', measurements: {} };
  }
  var KOREAN_BRANDS = {
    "mont-bell": "몽벨", "montbell": "몽벨", "몽벨": "몽벨",
    "beslow": "비슬로우", "비슬로우": "비슬로우",
    "patagonia": "파타고니아", "파타고니아": "파타고니아",
    "nike": "나이키", "나이키": "나이키",
    "adidas": "아디다스", "아디다스": "아디다스",
    "the north face": "노스페이스", "north face": "노스페이스", "노스페이스": "노스페이스",
    "polo ralph lauren": "폴로 랄프 로렌", "ralph lauren": "폴로 랄프 로렌", "폴로 랄프 로렌": "폴로 랄프 로렌",
    "champion": "챔피온", "챔피온": "챔피온",
    "carhartt": "칼하트", "칼하트": "칼하트",
    "lacoste": "라코스테", "라코스테": "라코스테",
    "levi's": "리바이스", "levis": "리바이스", "리바이스": "리바이스",
    "gap": "갭", "갭": "갭",
    "eddie bauer": "에디바우어", "에디바우어": "에디바우어",
    "l.l.bean": "엘엘빈", "ll bean": "엘엘빈", "엘엘빈": "엘엘빈",
    "columbia": "컬럼비아", "컬럼비아": "컬럼비아",
    "new balance": "뉴발란스", "뉴발란스": "뉴발란스",
    "stussy": "스투시", "스투시": "스투시",
    "dickies": "디키즈", "디키즈": "디키즈",
    "tommy hilfiger": "타미 힐피거", "타미 힐피거": "타미 힐피거",
    "umbro": "엄브로", "엄브로": "엄브로",
    "asics": "아식스", "아식스": "아식스",
    "reebok": "리복", "리복": "리복",
    "puma": "푸마", "푸마": "푸마",
    "uniqlo": "유니클로", "유니클로": "유니클로"
  };

  function normalizeBrandKorean(value) {
    var raw = String(value || "").trim().replace(/\s+/g, " ");
    if (!raw) return "";
    return KOREAN_BRANDS[raw.toLowerCase()] || raw;
  }


  let productImage = null, pending = false, revision = 0;
  const el = id => document.getElementById(id);
  function preview() {
    const img = el('productPhotoPreview');
    if (!img) return;
    img.hidden = !productImage;
    if (productImage) img.src = productImage.src; else img.removeAttribute('src');
    el('removeProductPhoto').disabled = !productImage;
  }
  function read() { return { instagramCaption: el('instagramCaption')?.value || '', productImage }; }
  function restore(value = {}) {
    revision++;
    pending = false;
    try { productImage = image(value.productImage, true); } catch (_) { productImage = null; }
    if (el('instagramCaption')) el('instagramCaption').value = value.instagramCaption || '';
    preview();
  }
  function status(message, error = false) {
    el('productTransferStatus').textContent = message;
    el('productTransferStatus').classList.toggle('error', error);
  }
  function changed() { el('instagramCaption').dispatchEvent(new Event('input', { bubbles: true })); }
  async function photo(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('JPEG·PNG·WebP 사진을 선택해 주세요.');
    if (file.size > 25 * 1024 * 1024) throw new Error('25MB 이하의 사진을 선택해 주세요.');
    const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.')); reader.readAsDataURL(file); });
    const img = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = () => reject(new Error('사진을 열지 못했습니다.')); item.src = src; });
    const canvas = document.createElement('canvas'), scale = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.78, 0.6, 0.4, 0.25]) { const result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 350000) return image(result); }
    throw new Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
  }
  function prefill(payload) {
    const draft = normalize(payload); // Validate everything before replacing a draft.
    root.applyProductTransfer(draft);
    status('상품 정보를 불러왔습니다. 내용을 확인하고 상품을 저장해 주세요.');
  }
  function consumeLink() {
    const query = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
    const encoded = hash.get('aiData') || query.get('aiData');
    if (!encoded) return;
    try {
      if (encoded.length > 600000) throw new Error('링크가 너무 큽니다. 상품 정보 파일로 불러와 주세요.');
      const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
      prefill(JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))));
      // Remove payload after import so reload cannot overwrite edits or re-create saved items.
      hash.delete('aiData'); query.delete('aiData'); query.delete('new');
      history.replaceState(null, '', location.pathname + (query.size ? '?' + query.toString() : '') + (hash.size ? '#' + hash.toString() : ''));
    } catch (error) { status(error.message || '상품 정보를 불러오지 못했습니다.', true); }
  }
  function init() {
    if (!el('instagramCaption')) return;
    el('productPhoto').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      const ownRevision = ++revision; pending = true;
      status('대표사진을 준비하고 있습니다…');
      try { const result = await photo(file); if (ownRevision !== revision) return; productImage = result; preview(); changed(); status('대표사진을 준비했습니다. 상품 저장 시 함께 저장됩니다.'); }
      catch (error) { if (ownRevision === revision) status(error.message, true); }
      finally { if (ownRevision === revision) pending = false; event.target.value = ''; }
    });
    el('removeProductPhoto').onclick = () => { revision++; pending = false; productImage = null; preview(); changed(); status('대표사진을 제거했습니다.'); };
    el('copyInstagramCaption').onclick = async () => {
      const field = el('instagramCaption');
      try { await navigator.clipboard.writeText(field.value); status('인스타그램 캡션을 복사했습니다.'); }
      catch (_) { field.focus(); field.select(); status(document.execCommand('copy') ? '인스타그램 캡션을 복사했습니다.' : '캡션을 선택했습니다. 직접 복사해 주세요.'); }
    };
    el('productTransferFile').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      try { if (file.size > 600000) throw new Error('상품 정보 파일은 600KB 이하여야 합니다.'); prefill(JSON.parse(await file.text())); }
      catch (error) { status(error.message || '상품 정보 파일을 확인해 주세요.', true); }
      finally { event.target.value = ''; }
    });
    preview(); consumeLink();
  }
  root.SelectProductEditor = { normalize, image, read, restore, prefill, pending: () => pending };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window === 'undefined' ? globalThis : window);
