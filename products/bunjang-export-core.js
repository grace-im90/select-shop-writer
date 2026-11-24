(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SelectBunjangExport = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ products: 50, photos: 500, photosPerProduct: 12, title: 40, description: 2000 });
  const categories = [
    [320300400,'남성 · 자켓'],[320300300,'남성 · 패딩'],[320300200,'남성 · 점퍼'],[320300100,'남성 · 코트'],[320300600,'남성 · 가디건'],[320300500,'남성 · 조끼/베스트'],
    [320210500,'남성 · 맨투맨'],[320210600,'남성 · 후드티/후드집업'],[320210700,'남성 · 니트/스웨터'],[320210400,'남성 · 셔츠'],[320210100,'남성 · 반팔 티셔츠'],[320210200,'남성 · 긴팔 티셔츠'],[320210300,'남성 · 민소매 티셔츠'],
    [310300400,'여성 · 자켓'],[310300200,'여성 · 패딩'],[310300100,'여성 · 점퍼'],[310300300,'여성 · 코트'],[310300600,'여성 · 가디건'],[310300500,'여성 · 조끼/베스트'],
    [310260600,'여성 · 맨투맨'],[310260700,'여성 · 후드티/후드집업'],[310260800,'여성 · 니트/스웨터'],[310260400,'여성 · 셔츠'],[310260500,'여성 · 블라우스'],[310260100,'여성 · 반팔 티셔츠'],[310260200,'여성 · 긴팔 티셔츠'],[310260300,'여성 · 민소매 티셔츠']
  ];
  function measurements(p) {
    if (typeof p?.measurements === 'string') { try { return JSON.parse(p.measurements) || {}; } catch (_) { return {}; } }
    return p?.measurements && typeof p.measurements === 'object' ? p.measurements : {};
  }
  function uploadState(p) {
    let state = p?.uploadSites ?? measurements(p).__uploadSites ?? {};
    if (typeof state === 'string') { try { state = JSON.parse(state); } catch (_) { state = {}; } }
    return Array.isArray(state) ? state.includes('bunjang') || state.includes('번개장터') : Boolean(state.bunjang || state['번개장터']);
  }
  function pending(p) { return !uploadState(p) && Boolean(measurements(p).__bunjangExport?.pendingAt); }
  function eligible(p) { return Boolean(p) && !p.soldAt && !measurements(p).__soldAt && measurements(p).__status !== 'sold' && !uploadState(p) && !pending(p); }
  function code(p) { return String(p?.code || measurements(p).__productCode || '').trim(); }
  function dateKey(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : '';
  }
  function inDateRange(p, from, to) { const date = dateKey(p.updatedAt || p.createdAt); return (!from && !to) || Boolean(date && (!from || date >= from) && (!to || date <= to)); }
  function title(value, productCode) {
    const suffix = String(productCode || '').trim();
    let name = String(value || '').normalize('NFC').replace(/×/g, ' x ').replace(/[^\p{L}\p{N}\s().,\-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (suffix && name.endsWith(' ' + suffix)) name = name.slice(0, -suffix.length - 1).trim();
    const room = LIMITS.title - (suffix ? suffix.length + 1 : 0);
    return [Array.from(name).slice(0, Math.max(0, room)).join('').trim(), suffix].filter(Boolean).join(' ');
  }
  function categoryFor(p, gender = 'men') {
    const d = measurements(p).__draft || {}, name = [p.brand,p.name,d.name].filter(Boolean).join(' ');
    let kind = '';
    if (/가디건/.test(name)) kind = '가디건';
    else if (/조끼|베스트/.test(name)) kind = '조끼/베스트';
    else if (/패딩|다운자켓|다운 자켓/.test(name)) kind = '패딩';
    else if (/코트/.test(name)) kind = '코트';
    else if (/맨투맨|스웨트셔츠/.test(name)) kind = '맨투맨';
    else if (/후드티|후드집업|후드 집업|후디/.test(name)) kind = '후드티/후드집업';
    else if (/니트|스웨터/.test(name)) kind = '니트/스웨터';
    else if (/블라우스/.test(name) && gender === 'women') kind = '블라우스';
    else if (/셔츠/.test(name) && !/티셔츠/.test(name)) kind = '셔츠';
    else if (/반팔/.test(name)) kind = '반팔 티셔츠';
    else if (/민소매|슬리브리스/.test(name)) kind = '민소매 티셔츠';
    else if (/긴팔|롱슬리브/.test(name)) kind = '긴팔 티셔츠';
    else if ((d.productType || p.productType) === '아우터') kind = '자켓';
    const prefix = gender === 'women' ? '여성' : '남성';
    return categories.find(([, label]) => label === prefix + ' · ' + kind)?.[0] || '';
  }
  function images(p) {
    const m = measurements(p);
    let photos = m.__bunjangPhotos;
    if (!Array.isArray(photos)) {
      let image = m.__productImageDeletedAt ? null : m.__productImage ?? p.productImage ?? m.__draft?.productImage;
      if (typeof image === 'string' && image.startsWith('{')) { try { image = JSON.parse(image); } catch (_) { image = null; } }
      photos = image ? [image] : [];
    }
    return photos.map(value => typeof value === 'string' ? { src: value } : value).filter(value => typeof value?.src === 'string' && /^(data:image\/(?:jpeg|jpg|png|webp|gif);base64,|https:\/\/)/i.test(value.src));
  }
  function condition(value) {
    const grade = String(value || '').trim().split(/\s/)[0];
    return ({ S: 1, A: 2, 'B+': 3, B: 3, C: 4 })[grade] || '';
  }
  function details(p, description, gender = 'men') {
    const m = measurements(p), d = m.__draft || {}, settings = m.__bunjangSettings || {}, productCode = code(p);
    const size = String(settings.size ?? d.size ?? p.size ?? '').trim();
    return {
      id: String(p.id), code: productCode, product: p,
      title: settings.title || title([d.brand ?? p.brand,d.name ?? p.name].filter(Boolean).join(' '), productCode),
      categoryId: settings.categoryId || categoryFor(p, gender), categoryEdited: Boolean(settings.categoryId), customCategory: Boolean(settings.categoryId && !categories.some(([id]) => id === Number(settings.categoryId))),
      size: /^free$/i.test(size) ? 'Free' : size,
      condition: settings.condition || condition(d.condition ?? p.condition),
      price: Number(String(d.price ?? m.__price ?? p.price ?? '').replace(/,/g, '')),
      description: String(description || ''), photos: images(p)
    };
  }
  function errors(rows) {
    const result = [], used = new Set();
    if (!rows.length) result.push('상품을 선택해 주세요.');
    if (rows.length > LIMITS.products) result.push('한 번에 상품 50개까지 준비할 수 있습니다.');
    let photos = 0;
    for (const row of rows) {
      const label = row.code || row.title || '품번 없는 상품', fail = message => result.push(label + ': ' + message);
      if (!/^[A-Za-z]\d{3,}$/.test(row.code)) fail('품번을 확인해 주세요.');
      if (used.has(row.code)) fail('품번이 중복되어 사진 파일을 구분할 수 없습니다.');
      used.add(row.code);
      if (!row.title?.trim() || row.title.trim() === row.code || row.title.length > LIMITS.title) fail('상품명을 40자 이내로 입력해 주세요.');
      if (!/^\d{6,9}$/.test(String(row.categoryId))) fail('카테고리를 선택해 주세요.');
      if (!/^(?:[2-6]?XS|XS|S|M|L|XL|[2-9]XL|Free)$/.test(row.size)) fail('표준 사이즈를 입력해 주세요. 예: S, M, L, XL, 2XL, Free');
      if (!Number.isSafeInteger(row.price) || row.price <= 0 || row.price > 999999999) fail('판매가격을 확인해 주세요.');
      if (![1,2,3,4,5].includes(Number(row.condition))) fail('상품 상태를 선택해 주세요.');
      if (!row.description.trim() || row.description.length > LIMITS.description) fail('판매글은 1~2,000자로 준비해 주세요.');
      if (!row.photos.length || row.photos.length > LIMITS.photosPerProduct) fail('사진을 1~12장 준비해 주세요.');
      if (row.product && !eligible(row.product)) fail('판매완료·번개 등록완료·등록대기 상품은 제외해 주세요.');
      photos += row.photos.length;
    }
    if (photos > LIMITS.photos) result.push('한 번에 사진 500장까지 업로드할 수 있습니다. 상품을 나눠 주세요.');
    return result;
  }
  function workbookRows(rows, filenames, fee = 4000) {
    return rows.map(row => {
      const cells = Array(36).fill(null);
      cells[0] = row.title; cells[1] = Number(row.categoryId); cells[3] = row.size;
      cells[22] = Number(row.condition); cells[23] = row.description; cells[24] = row.price;
      cells[25] = '별도'; cells[26] = fee; cells[29] = '불가능'; cells[33] = filenames[row.id].join(', '); cells[34] = 1;
      return cells;
    });
  }
  const xml = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function column(index) { let name = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
  function rowsXml(rows) {
    return rows.map((row,index) => '<row r="' + (index + 6) + '">' + row.map((value,col) => {
      const ref = column(col) + (index + 6);
      if (value == null) return '<c r="' + ref + '"/>';
      return typeof value === 'number' ? '<c r="' + ref + '"><v>' + value + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    }).join('') + '</row>').join('');
  }
  function fillWorksheet(source, rows) {
    const match = source.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
    if (!match) throw new Error('엑셀 양식의 데이터 영역을 찾지 못했습니다.');
    const headers = (match[1].match(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g) || []).filter(row => Number(row.match(/\br="(\d+)"/)?.[1]) <= 5).join('');
    if (!headers.includes('r="5"')) throw new Error('엑셀 양식의 안내 행이 올바르지 않습니다.');
    return source.replace(match[0], '<sheetData>' + headers + rowsXml(rows) + '</sheetData>').replace(/<dimension\b[^>]*\/>/, '<dimension ref="A1:AJ' + Math.max(5,rows.length + 5) + '"/>');
  }
  return { LIMITS, categories, measurements, uploadState, pending, eligible, code, dateKey, inDateRange, title, categoryFor, images, details, errors, workbookRows, fillWorksheet, rowsXml };
});
