(function () {
  function normalizeMeasurements(value) {
    if (!value) return {};
    if (typeof value === "string") {
      try { return JSON.parse(value) || {}; } catch (_error) { return {}; }
    }
    return typeof value === "object" ? value : {};
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function currentAiImage() {
    var image = window.__selectAiProductImage;
    if (typeof image === "string" && image.trim()) return { src: image.trim() };
    if (image && typeof image === "object" && image.src) return image;
    return null;
  }

  function patchCloudSave() {
    var cloud = window.SelectCloud;
    if (!cloud || cloud.__productMetadataPatch) return cloud ? undefined : setTimeout(patchCloudSave, 50);
    var originalSave = cloud.saveSaved;
    var originalGet = cloud.getSaved;
    cloud.saveSaved = async function (product) {
      var aiImage = currentAiImage();
      if (product && aiImage) {
        var aiMeasurements = { ...normalizeMeasurements(product.measurements) };
        if (!hasOwn(aiMeasurements, "__productImage") && !product.productImage) {
          aiMeasurements.__productImage = aiImage;
          product = { ...product, productImage: aiImage, measurements: aiMeasurements };
        }
      }

      if (product && product.id && typeof originalGet === "function") {
        var measurements = { ...normalizeMeasurements(product.measurements) };
        var needsUpload = !hasOwn(measurements, "__uploadSites");
        var needsImage = !hasOwn(measurements, "__productImage");
        var needsCode = !hasOwn(measurements, "__productCode");
        if (needsUpload || needsImage || needsCode) {
          try {
            var existing = await originalGet.call(cloud, product.id);
            var existingMeasurements = normalizeMeasurements(existing && existing.measurements);
            if (needsUpload && hasOwn(existingMeasurements, "__uploadSites")) measurements.__uploadSites = existingMeasurements.__uploadSites;
            if (needsImage && hasOwn(existingMeasurements, "__productImage")) measurements.__productImage = existingMeasurements.__productImage;
            if (needsCode && hasOwn(existingMeasurements, "__productCode")) measurements.__productCode = existingMeasurements.__productCode;
            product = { ...product, measurements };
            if (hasOwn(measurements, "__productImage")) product.productImage = measurements.__productImage;
            if (hasOwn(measurements, "__productCode")) product.code = measurements.__productCode;
          } catch (_error) {}
        }
      }

      var saved = await originalSave.call(this, product);
      if (aiImage) window.__selectAiProductImage = null;
      return saved;
    };
    Object.defineProperty(cloud, "__productMetadataPatch", { value: true });
  }

  function decodeBase64Url(value) {
    var base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function readAiPayload() {
    try {
      var queryParams = new URLSearchParams(location.search);
      var hashParams = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
      var encoded = queryParams.get("aiData") || hashParams.get("aiData");
      if (!encoded) return null;
      var payload = JSON.parse(decodeBase64Url(encoded));
      return payload && typeof payload === "object" ? payload : null;
    } catch (_error) {
      return null;
    }
  }

  function setFormValue(element, value) {
    if (!element) return;
    element.value = value == null ? "" : String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
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

  function normalizeSize(value) {
    var raw = String(value || "").trim().toUpperCase();
    if (raw === "F") return "FREE";
    return raw;
  }

  function buildProductName(brand, value, size) {
    var cleanBrand = String(brand || "").trim().replace(/\s+/g, " ");
    var cleanSize = normalizeSize(size);
    var base = String(value || "").trim().replace(/\s+/g, " ");
    base = base.replace(/\s*\((?:XS|S|M|L|XL|2XL|3XL|FREE|F|\d{2,3})\)\s*$/i, "").trim();
    if (cleanBrand && base.toLowerCase().indexOf(cleanBrand.toLowerCase() + " ") === 0) base = base.slice(cleanBrand.length).trim();
    var suffix = cleanSize ? " (" + cleanSize + ")" : "";
    var fixedLength = Array.from(cleanBrand).length + (cleanBrand ? 1 : 0) + Array.from(suffix).length;
    var budget = Math.max(0, 25 - fixedLength);
    var trimmedBase = Array.from(base).slice(0, budget).join("").trimEnd();
    return trimmedBase + suffix;
  }

  function ensureBlankSizeOption(select) {
    if (!select) return;
    var blank = Array.from(select.options).find(function (option) { return option.value === ""; });
    if (!blank) {
      blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "-";
      select.insertBefore(blank, select.firstChild);
    }
  }

  function setSizeValue(select, value) {
    if (!select) return;
    ensureBlankSizeOption(select);
    var size = normalizeSize(value);
    if (!size) {
      setFormValue(select, "");
      return;
    }
    var exists = Array.from(select.options).some(function (option) { return option.value === size; });
    if (!exists) {
      var option = document.createElement("option");
      option.value = size;
      option.textContent = size;
      select.appendChild(option);
    }
    setFormValue(select, size);
  }

  function normalizeThumbnail(value) {
    if (typeof value === "string" && value.startsWith("data:image/")) return { src: value };
    if (value && typeof value === "object" && typeof value.src === "string" && value.src.startsWith("data:image/")) return { src: value.src };
    return null;
  }

  function selectProductType(productType) {
    if (!productType) return;
    var target = String(productType).trim();
    var buttons = Array.from(document.querySelectorAll("#types button"));
    var button = buttons.find(function (item) { return item.textContent.trim() === target; });
    if (button) button.click();
  }

  function clearMeasurements() {
    document.querySelectorAll("#measures input").forEach(function (input) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function addAiCaptionBox(caption) {
    var previous = document.getElementById("aiInstagramBox");
    if (previous) previous.remove();
    if (!caption) return;
    var notice = document.querySelector(".notice");
    if (!notice || !notice.parentNode) return;
    var box = document.createElement("div");
    box.id = "aiInstagramBox";
    box.style.cssText = "margin-top:20px;padding:16px;border:1px solid #cfdcf3;border-radius:13px;background:#f7faff";
    box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><b style="font-size:12px">AI 인스타그램 캡션</b><button type="button" id="aiCaptionCopy" style="height:30px;padding:0 11px;border:0;border-radius:8px;background:#356ae6;color:#fff;font-size:10px;font-weight:800">캡션 복사</button></div><textarea id="aiInstagramCaption" rows="7" readonly style="width:100%;padding:11px 13px;border:1px solid #d5dde7;border-radius:10px;background:#fff;color:#172033;line-height:1.55;resize:vertical"></textarea>';
    notice.parentNode.insertBefore(box, notice);
    var textarea = box.querySelector("#aiInstagramCaption");
    textarea.value = String(caption);
    box.querySelector("#aiCaptionCopy").addEventListener("click", async function () {
      var button = this;
      var ok = false;
      try { await navigator.clipboard.writeText(textarea.value); ok = true; } catch (_error) {}
      if (!ok) {
        textarea.focus();
        textarea.select();
        try { ok = document.execCommand("copy"); } catch (_error) {}
      }
      button.textContent = ok ? "✓ 복사 완료" : "직접 복사";
      setTimeout(function () { button.textContent = "캡션 복사"; }, 1300);
    });
  }

  function addAiThumbnailPreview(image) {
    var previous = document.getElementById("aiThumbnailPreview");
    if (previous) previous.remove();
    if (!image || !image.src) return;
    var notice = document.querySelector(".notice");
    if (!notice || !notice.parentNode) return;
    var box = document.createElement("div");
    box.id = "aiThumbnailPreview";
    box.style.cssText = "margin-top:16px;padding:12px;border:1px solid #dfe5ed;border-radius:12px;background:#fbfcfe;display:flex;align-items:center;gap:12px";
    box.innerHTML = '<img alt="상품 썸네일" style="width:54px;height:72px;object-fit:cover;border:1px solid #d6dee8;border-radius:8px;background:#fff"><div><b style="display:block;font-size:11px">상품목록 썸네일</b><span style="display:block;margin-top:4px;color:#7c8797;font-size:9px;line-height:1.5">정면 전체 이미지 1장만 저용량으로 저장됩니다.</span></div>';
    box.querySelector("img").src = image.src;
    notice.parentNode.insertBefore(box, notice);
  }

  function showAiStatus(message, isError) {
    var status = document.getElementById("saveStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", !!isError);
  }

  function patchLocalSaveButton() {
    var button = document.getElementById("saveProduct");
    if (!button || button.__aiThumbnailPatched) return;
    button.__aiThumbnailPatched = true;
    button.addEventListener("click", function () {
      var image = currentAiImage();
      if (!image || (window.SelectCloud && window.SelectCloud.user)) return;
      var brand = String(document.getElementById("brand")?.value || "").trim();
      var name = String(document.getElementById("name")?.value || "").trim();
      if (!name) return;
      setTimeout(function () {
        try {
          var products = JSON.parse(localStorage.getItem("select-saved-products") || "[]");
          var index = products.findIndex(function (item) {
            return String(item?.brand || "").trim() === brand && String(item?.name || "").trim() === name;
          });
          if (index < 0) return;
          var product = products[index];
          var measurements = { ...normalizeMeasurements(product.measurements), __productImage: image };
          products[index] = { ...product, productImage: image, measurements: measurements };
          localStorage.setItem("select-saved-products", JSON.stringify(products));
          window.__selectAiProductImage = null;
        } catch (_error) {}
      }, 350);
    }, true);
  }

  function applyAiPayload(payload) {
    var brand = document.getElementById("brand");
    var name = document.getElementById("name");
    var size = document.getElementById("size");
    var condition = document.getElementById("condition");
    var price = document.getElementById("price");
    var description = document.getElementById("desc");
    if (!brand || !name || !size || !condition || !description || !document.querySelector("#types button")) return false;

    var koreanBrand = normalizeBrandKorean(payload.brand || "");
    var labelSize = normalizeSize(payload.size || payload.labelSize || "");
    var thumbnail = normalizeThumbnail(payload.thumbnail || payload.productImage || payload.image);
    window.__selectAiProductImage = thumbnail;

    setFormValue(brand, koreanBrand);
    setFormValue(name, buildProductName(koreanBrand, payload.name, labelSize));
    selectProductType(payload.productType || payload.type || "상의");
    setSizeValue(size, labelSize);
    clearMeasurements();
    setFormValue(price, "");

    if (payload.condition && Array.from(condition.options).some(function (option) { return option.value === payload.condition; })) {
      setFormValue(condition, payload.condition);
    }
    setFormValue(description, payload.description || "");
    addAiCaptionBox(payload.instagramCaption || payload.instagram || "");
    addAiThumbnailPreview(thumbnail);
    patchLocalSaveButton();
    showAiStatus("AI 상품 정보를 불러왔습니다. 브랜드+상품명+표기 사이즈는 25자 이내로 맞췄고, 정면 썸네일 1장도 함께 준비했습니다. 실측과 가격만 직접 입력해 주세요.", false);
    return true;
  }

  function initAiPrefill() {
    var path = location.pathname.replace(/\/+$/, "/");
    if (!/\/select-shop-writer\/$/.test(path) && path !== "/") return;
    var payload = readAiPayload();
    if (!payload) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (applyAiPayload(payload) || attempts >= 40) {
        clearInterval(timer);
        if (attempts >= 40) showAiStatus("AI 상품 정보를 불러오지 못했습니다. 페이지를 새로고침해 주세요.", true);
      }
    }, 100);
  }

  patchCloudSave();
  if (document.readyState === "complete") setTimeout(initAiPrefill, 100);
  else window.addEventListener("load", function () { setTimeout(initAiPrefill, 100); });
})();
