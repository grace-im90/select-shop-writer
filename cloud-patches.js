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

  function patchCloudSave() {
    var cloud = window.SelectCloud;
    if (!cloud || cloud.__productMetadataPatch) return cloud ? undefined : setTimeout(patchCloudSave, 50);
    var originalSave = cloud.saveSaved;
    var originalGet = cloud.getSaved;
    cloud.saveSaved = async function (product) {
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
      return originalSave.call(this, product);
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
      var params = new URLSearchParams(location.search);
      var encoded = params.get("aiData");
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

  function trimProductName(value) {
    return Array.from(String(value || "").trim()).slice(0, 25).join("");
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
    select.value = "";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
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

  function showAiStatus(message, isError) {
    var status = document.getElementById("saveStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", !!isError);
  }

  function applyAiPayload(payload) {
    var brand = document.getElementById("brand");
    var name = document.getElementById("name");
    var size = document.getElementById("size");
    var condition = document.getElementById("condition");
    var price = document.getElementById("price");
    var description = document.getElementById("desc");
    if (!brand || !name || !size || !condition || !description || !document.querySelector("#types button")) return false;

    setFormValue(brand, payload.brand || "");
    setFormValue(name, trimProductName(payload.name));
    selectProductType(payload.productType || payload.type || "상의");
    ensureBlankSizeOption(size);
    clearMeasurements();
    setFormValue(price, "");

    if (payload.condition && Array.from(condition.options).some(function (option) { return option.value === payload.condition; })) {
      setFormValue(condition, payload.condition);
    }
    setFormValue(description, payload.description || "");
    addAiCaptionBox(payload.instagramCaption || payload.instagram || "");
    showAiStatus("AI 상품 정보를 불러왔습니다. 사이즈와 실측, 가격만 직접 입력해 주세요.", false);
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
