(function () {
  if (!/\/products\/?$/.test(location.pathname)) return;
  if (window.__selectProductManagementLoaded) return;
  window.__selectProductManagementLoaded = true;

  const FILTER_KEY = "select-products-upload-filter";
  const filters = [
    ["all", "전체"],
    ["todo", "온라인 미업로드"],
    ["partial", "일부 업로드"],
    ["done", "업로드 완료"],
    ["carrotMissing", "당근 미업로드"],
    ["bunjangMissing", "번개 미업로드"],
    ["fruitsMissing", "후르츠 미업로드"],
    ["noImage", "사진 없음"]
  ];
  let activeFilter = localStorage.getItem(FILTER_KEY) || "all";
  if (!filters.some(([key]) => key === activeFilter)) activeFilter = "all";
  let pendingImageIndex = null;
  let enhancing = false;
  let savingCodes = false;
  const pendingCodeSaves = new Map();

  function safeEsc(value) {
    if (typeof esc === "function") return esc(value);
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function safeMeasurements(product) {
    if (typeof measurementsOf === "function") return measurementsOf(product);
    const value = product?.measurements;
    if (!value) return {};
    if (typeof value === "string") {
      try { return JSON.parse(value) || {}; } catch (_error) { return {}; }
    }
    return typeof value === "object" ? value : {};
  }

  function safeUploadState(product) {
    if (typeof uploadState === "function") return uploadState(product);
    const measurements = safeMeasurements(product);
    let source = product?.uploadSites ?? measurements.__uploadSites ?? {};
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch (_error) { source = {}; }
    }
    const sites = [["carrot", "당근"], ["bunjang", "번개장터"], ["fruits", "후르츠"]];
    return Object.fromEntries(sites.map(([key, label]) => [
      key,
      Array.isArray(source) ? source.includes(key) || source.includes(label) : Boolean(source?.[key] || source?.[label])
    ]));
  }

  function uploadCount(product) {
    return Object.values(safeUploadState(product)).filter(Boolean).length;
  }

  function productImage(product) {
    let source = product?.productImage;
    if (source === undefined) source = safeMeasurements(product).__productImage;
    if (typeof source === "string" && source.trim()) return { src: source };
    if (source && typeof source === "object" && source.src) return source;
    return null;
  }

  function hasProductImage(product) {
    return Boolean(productImage(product));
  }

  function productCode(product) {
    return String(product?.code ?? safeMeasurements(product).__productCode ?? "").trim();
  }

  function withProductCode(product, code) {
    const measurements = { ...safeMeasurements(product), __productCode: code };
    return { ...product, code, measurements };
  }

  function allocateProductCode(used) {
    let number = 1;
    while (used.has("S" + String(number).padStart(3, "0"))) number++;
    return "S" + String(number).padStart(3, "0");
  }

  function activeSavedProducts() {
    try {
      return saved.filter(product => !isSold(product));
    } catch (_error) {
      return [];
    }
  }

  function matchesFilter(product, key = activeFilter) {
    const state = safeUploadState(product);
    const count = uploadCount(product);
    if (key === "todo") return count === 0;
    if (key === "partial") return count > 0 && count < 3;
    if (key === "done") return count === 3;
    if (key === "carrotMissing") return !state.carrot;
    if (key === "bunjangMissing") return !state.bunjang;
    if (key === "fruitsMissing") return !state.fruits;
    if (key === "noImage") return !hasProductImage(product);
    return true;
  }

  function statusInfo(product) {
    const count = uploadCount(product);
    if (count === 3) return ["done", "업로드 완료", "3/3"];
    if (count > 0) return ["partial", "일부 업로드", `${count}/3`];
    return ["todo", "온라인 대기", "0/3"];
  }

  function ensureStyles() {
    if (document.getElementById("productManagementStyle")) return;
    const style = document.createElement("style");
    style.id = "productManagementStyle";
    style.textContent = [
      ".status-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 14px 14px;border-bottom:1px solid #dfe5ed;background:#fff}",
      ".status-filters button{height:31px;padding:0 10px;border:1px solid #d6dee8;border-radius:8px;background:#fff;color:#526075;font-size:9px;font-weight:800}",
      ".status-filters button.on{border-color:#356ae6;background:#eaf1ff;color:#356ae6}",
      ".product-shot-cell{min-width:104px}",
      ".product-code-cell{min-width:54px;color:#356ae6;font-weight:850}",
      ".product-shot{display:flex;align-items:center;gap:7px}",
      ".shot-thumb{width:44px;height:56px;overflow:hidden;border:1px solid #d6dee8;border-radius:8px;background:#f4f7fb;padding:0}",
      ".shot-thumb img{display:block;width:100%;height:100%;object-fit:cover}",
      ".shot-add{height:31px;padding:0 10px;border:1px dashed #b7c4d8;border-radius:8px;background:#f8faff;color:#526075;font-size:9px;font-weight:800}",
      ".shot-tools{display:none;flex-direction:column;gap:4px}",
      ".product-shot.tools-open .shot-tools{display:flex}",
      ".shot-tools button{height:24px;padding:0 7px;border:0;border-radius:6px;background:#edf3ff;color:#356ae6;font-size:8.5px;font-weight:800}",
      ".shot-tools button.delete{background:#fff0f0;color:#c33}",
      ".product-status{display:flex;flex-direction:column;gap:4px;min-width:82px}",
      ".status-pill{display:inline-flex;align-items:center;justify-content:center;width:max-content;height:25px;padding:0 8px;border-radius:7px;font-size:9px;font-weight:850}",
      ".status-pill.todo{background:#fff7ed;color:#b45309}",
      ".status-pill.partial{background:#eef6ff;color:#2563eb}",
      ".status-pill.done{background:#ecfdf5;color:#05845f}",
      ".product-status small{color:#8a95a5;font-size:8.5px}",
      "@media(max-width:760px){.status-filters{padding:0 10px 11px}.product-shot-cell{min-width:84px}.product-code-cell{min-width:48px}.shot-thumb{width:38px;height:48px}.shot-tools button{width:42px;padding:0}.status-pill{height:23px;padding:0 7px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureImageInput() {
    let input = document.getElementById("productImageInput");
    if (input) return input;
    input = document.createElement("input");
    input.id = "productImageInput";
    input.type = "file";
    input.accept = "image/*";
    input.className = "hidden";
    input.onchange = async () => {
      const file = input.files?.[0];
      const index = pendingImageIndex;
      pendingImageIndex = null;
      input.value = "";
      if (file && Number.isFinite(index)) await updateProductImage(index, file);
    };
    document.body.appendChild(input);
    return input;
  }

  function ensureFilterBar() {
    let bar = document.getElementById("productStatusFilters");
    const tools = document.querySelector(".tools");
    if (!bar && tools) {
      bar = document.createElement("div");
      bar.id = "productStatusFilters";
      bar.className = "status-filters";
      tools.after(bar);
    }
    if (!bar) return;
    const isSavedMode = typeof mode !== "undefined" && mode === "saved";
    bar.classList.toggle("hidden", !isSavedMode);
    if (!isSavedMode) return;
    const source = activeSavedProducts();
    bar.innerHTML = filters.map(([key, label]) => {
      const count = source.filter(product => matchesFilter(product, key)).length;
      return `<button type="button" class="${activeFilter === key ? "on" : ""}" data-product-filter="${key}">${label} ${count}</button>`;
    }).join("");
    bar.querySelectorAll("[data-product-filter]").forEach(button => {
      button.onclick = () => {
        activeFilter = button.dataset.productFilter;
        localStorage.setItem(FILTER_KEY, activeFilter);
        if (typeof page !== "undefined") page = 1;
        render();
      };
    });
  }

  function statusMarkup(product) {
    const [kind, label, progress] = statusInfo(product);
    return `<div class="product-status"><span class="status-pill ${kind}">${label}</span><small>${progress} 업로드</small></div>`;
  }

  function shotMarkup(product, index) {
    const image = productImage(product);
    if (!image) {
      return `<div class="product-shot"><button type="button" class="shot-add" data-image-action="choose" data-image-index="${index}">사진 추가</button></div>`;
    }
    return [
      '<div class="product-shot">',
      `<button type="button" class="shot-thumb" data-image-action="toggle" data-image-index="${index}" title="사진 관리" aria-expanded="false"><img src="${safeEsc(image.src)}" alt="대표 제품 사진"></button>`,
      '<div class="shot-tools">',
      `<button type="button" data-image-action="choose" data-image-index="${index}">교체</button>`,
      `<button type="button" class="delete" data-image-action="remove" data-image-index="${index}">삭제</button>`,
      "</div>",
      "</div>"
    ].join("");
  }

  function bindBodyEvents(body) {
    if (body.__productManagementEvents) return;
    body.__productManagementEvents = true;
    body.addEventListener("click", event => {
      const button = event.target.closest("[data-image-action]");
      if (!button) return;
      const index = Number(button.dataset.imageIndex);
      if (!Number.isFinite(index)) return;
      if (button.dataset.imageAction === "toggle") {
        const shot = button.closest(".product-shot");
        const opening = !shot.classList.contains("tools-open");
        body.querySelectorAll(".product-shot.tools-open").forEach(item => {
          item.classList.remove("tools-open");
          item.querySelector(".shot-thumb")?.setAttribute("aria-expanded", "false");
        });
        shot.classList.toggle("tools-open", opening);
        button.setAttribute("aria-expanded", String(opening));
      } else if (button.dataset.imageAction === "remove") {
        removeProductImage(index);
      } else {
        pendingImageIndex = index;
        ensureImageInput().click();
      }
    });
  }

  function enhanceTable() {
    const head = document.getElementById("tableHead");
    const body = document.getElementById("tableBody");
    if (!head || !body || typeof mode === "undefined" || mode !== "saved") return;
    bindBodyEvents(body);
    const row = head.querySelector("tr");
    if (row) {
      const headers = [...row.children];
      if (!row.querySelector("[data-product-shot-head]") && headers[0]) {
        const shotHead = document.createElement("th");
        shotHead.dataset.productShotHead = "";
        shotHead.textContent = "제품컷";
        headers[0].after(shotHead);
      }
      if (!row.querySelector("[data-product-code-head]")) {
        const shotHead = row.querySelector("[data-product-shot-head]");
        if (shotHead) {
          const codeHead = document.createElement("th");
          codeHead.dataset.productCodeHead = "";
          codeHead.textContent = "품번";
          shotHead.after(codeHead);
        }
      }
      if (!row.querySelector("[data-upload-status-head]")) {
        const nameHead = [...row.children].find(cell => cell.textContent.trim() === "상품명");
        if (nameHead) {
          const statusHead = document.createElement("th");
          statusHead.dataset.uploadStatusHead = "";
          statusHead.textContent = "상태";
          nameHead.after(statusHead);
        }
      }
    }
    body.querySelectorAll("tr").forEach(tableRow => {
      const editButton = tableRow.querySelector("[data-saved-edit]");
      if (!editButton) return;
      const index = Number(editButton.dataset.savedEdit);
      const product = saved[index];
      if (!product) return;
      let shotCell = tableRow.querySelector("[data-product-shot-cell]");
      if (!shotCell) {
        shotCell = document.createElement("td");
        shotCell.className = "product-shot-cell";
        shotCell.dataset.productShotCell = "";
        tableRow.children[0]?.after(shotCell);
      }
      shotCell.innerHTML = shotMarkup(product, index);
      let codeCell = tableRow.querySelector("[data-product-code-cell]");
      if (!codeCell) {
        codeCell = document.createElement("td");
        codeCell.className = "product-code-cell";
        codeCell.dataset.productCodeCell = "";
        shotCell.after(codeCell);
      }
      const code = productCode(product);
      codeCell.textContent = code || "-";
      const titleButton = tableRow.querySelector("[data-copy-title]");
      if (titleButton) {
        const title = titleButton.textContent.trim();
        const size = String(product.size ?? safeMeasurements(product).__size ?? "").trim();
        titleButton.dataset.copyTitleValue = [title, size, code].filter(Boolean).join(" ");
      }
      let statusCell = tableRow.querySelector("[data-upload-status-cell]");
      if (!statusCell) {
        statusCell = document.createElement("td");
        statusCell.dataset.uploadStatusCell = "";
        tableRow.querySelector(".product-name")?.after(statusCell);
      }
      statusCell.innerHTML = statusMarkup(product);
    });
  }

  async function flushProductCodeSaves() {
    if (savingCodes || !pendingCodeSaves.size) return;
    savingCodes = true;
    let failed = false;
    try {
      while (pendingCodeSaves.size) {
        const [id, product] = pendingCodeSaves.entries().next().value;
        pendingCodeSaves.delete(id);
        try {
          if (window.SelectCloud && SelectCloud.user) await SelectCloud.saveSaved(product);
          else if (typeof saveLocalSavedProduct === "function") saveLocalSavedProduct(product);
        } catch (_error) {
          failed = true;
        }
      }
    } finally {
      savingCodes = false;
      if (pendingCodeSaves.size) flushProductCodeSaves();
      if (failed) alert("일부 품번을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    }
  }

  function ensureProductCodes() {
    if (typeof saved === "undefined") return;
    const candidates = saved
      .map((product, index) => ({ product, index }))
      .filter(({ product }) => !isSold(product))
      .sort((a, b) => String(a.product.createdAt || a.product.id || "").localeCompare(String(b.product.createdAt || b.product.id || "")));
    const allExisting = new Set(candidates.map(({ product }) => productCode(product)).filter(Boolean));
    const kept = new Set();
    candidates.forEach(({ product, index }) => {
      const current = productCode(product);
      if (current && !kept.has(current)) {
        kept.add(current);
        return;
      }
      const code = allocateProductCode(allExisting);
      allExisting.add(code);
      kept.add(code);
      const updated = withProductCode(product, code);
      saved[index] = updated;
      pendingCodeSaves.set(String(updated.id), updated);
    });
    flushProductCodeSaves();
  }

  function updateStatusText() {
    const status = document.getElementById("status");
    if (!status || typeof mode === "undefined" || mode !== "saved" || activeFilter === "all") return;
    const label = filters.find(([key]) => key === activeFilter)?.[1] || "필터";
    if (!status.textContent.includes("필터")) status.textContent += ` · 필터: ${label}`;
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      ensureStyles();
      ensureImageInput();
      ensureFilterBar();
      ensureProductCodes();
      enhanceTable();
      updateStatusText();
    } finally {
      enhancing = false;
    }
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      image.src = src;
    });
  }

  function imageDataBytes(dataUrl) {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return dataUrl.length;
    return Math.ceil((dataUrl.length - comma - 1) * 3 / 4);
  }

  function resizeToCanvas(image, maxWidth, maxHeight) {
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }

  function compressedImageSrc(image) {
    const maxBytes = 45 * 1024;
    const profiles = [
      { maxWidth: 360, maxHeight: 480 },
      { maxWidth: 300, maxHeight: 400 },
      { maxWidth: 240, maxHeight: 320 }
    ];
    const formats = [
      ["image/webp", [0.58, 0.48, 0.38]],
      ["image/jpeg", [0.62, 0.52, 0.42]]
    ];
    let smallest = "";
    let bestUnderLimit = "";
    profiles.forEach(profile => {
      const canvas = resizeToCanvas(image, profile.maxWidth, profile.maxHeight);
      formats.forEach(([type, qualities]) => {
        qualities.forEach(quality => {
          const src = canvas.toDataURL(type, quality);
          if (!src.startsWith(`data:${type}`)) return;
          if (!smallest || imageDataBytes(src) < imageDataBytes(smallest)) smallest = src;
          if (imageDataBytes(src) <= maxBytes && (!bestUnderLimit || imageDataBytes(src) < imageDataBytes(bestUnderLimit))) {
            bestUnderLimit = src;
          }
        });
      });
    });
    return bestUnderLimit || smallest;
  }

  async function imageMetaFromFile(file) {
    if (!file.type || !file.type.startsWith("image/")) throw new Error("이미지 파일만 추가할 수 있습니다.");
    const source = await fileToDataURL(file);
    const image = await loadImage(source);
    return {
      src: compressedImageSrc(image)
    };
  }

  function withProductImage(product, image) {
    const existingCode = productCode(product);
    const used = new Set(activeSavedProducts().filter(item => String(item.id) !== String(product.id)).map(productCode).filter(Boolean));
    const code = existingCode || (image ? allocateProductCode(used) : "");
    const measurements = { ...safeMeasurements(product), __productImage: image };
    if (code) measurements.__productCode = code;
    return {
      ...product,
      ...(code ? { code } : {}),
      productImage: image,
      measurements,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveProductImage(index, image) {
    const previous = saved[index];
    if (!previous) return;
    const updated = withProductImage(previous, image);
    saved[index] = updated;
    try {
      if (window.SelectCloud && SelectCloud.user) await SelectCloud.saveSaved(updated);
      else if (typeof saveLocalSavedProduct === "function") saveLocalSavedProduct(updated);
      await loadSaved();
    } catch (error) {
      saved[index] = previous;
      render();
      throw error;
    }
  }

  async function updateProductImage(index, file) {
    const buttons = document.querySelectorAll(`[data-image-index="${index}"]`);
    buttons.forEach(button => {
      button.disabled = true;
      button.dataset.previousText = button.textContent;
      if (button.classList.contains("shot-add")) button.textContent = "저장 중...";
    });
    try {
      await saveProductImage(index, await imageMetaFromFile(file));
    } catch (error) {
      alert(error.message || "대표컷을 저장하지 못했습니다.");
    } finally {
      buttons.forEach(button => {
        button.disabled = false;
        if (button.dataset.previousText) button.textContent = button.dataset.previousText;
      });
    }
  }

  async function removeProductImage(index) {
    if (!confirm("대표컷을 삭제할까요?")) return;
    try {
      await saveProductImage(index, null);
    } catch (error) {
      alert(error.message || "대표컷을 삭제하지 못했습니다.");
    }
  }

  function patchProductPage() {
    if (typeof filtered !== "function" || typeof render !== "function") return false;
    const baseFiltered = filtered;
    const baseRender = render;
    filtered = function () {
      const rows = baseFiltered();
      if (typeof mode === "undefined" || mode !== "saved") return rows;
      return rows.filter(product => matchesFilter(product));
    };
    render = function () {
      baseRender();
      enhance();
    };
    if (typeof toggleUploadSite === "function") {
      const baseToggleUploadSite = toggleUploadSite;
      toggleUploadSite = async function () {
        const result = await baseToggleUploadSite.apply(this, arguments);
        if (typeof mode !== "undefined" && mode === "saved") {
          if (activeFilter === "all") enhance();
          else {
            if (typeof page !== "undefined") page = 1;
            render();
          }
        }
        return result;
      };
    }
    render();
    return true;
  }

  const start = () => {
    ensureStyles();
    ensureImageInput();
    if (!patchProductPage()) setTimeout(start, 100);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
