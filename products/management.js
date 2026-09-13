(function () {
  if (!/\/products\/?$/.test(location.pathname)) return;
  if (window.__selectProductManagementLoaded) return;
  window.__selectProductManagementLoaded = true;

  const FILTER_KEY = "select-products-upload-filter";
  const filters = [
    ["all", "ì „ì²´"],
    ["todo", "ì˜¨ë¼ì¸ ë¯¸ì—…ë¡œë“œ"],
    ["partial", "ì¼ë¶€ ì—…ë¡œë“œ"],
    ["done", "ì—…ë¡œë“œ ì™„ë£Œ"],
    ["carrotMissing", "ë‹¹ê·¼ ë¯¸ì—…ë¡œë“œ"],
    ["bunjangMissing", "ë²ˆê°œ ë¯¸ì—…ë¡œë“œ"],
    ["fruitsMissing", "í›„ë¥´ì¸  ë¯¸ì—…ë¡œë“œ"],
    ["noImage", "ì‚¬ì§„ ì—†ìŒ"]
  ];
  let activeFilter = localStorage.getItem(FILTER_KEY) || "all";
  if (!filters.some(([key]) => key === activeFilter)) activeFilter = "all";
  let pendingImageIndex = null;
  let enhancing = false;

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
    const sites = [["carrot", "ë‹¹ê·¼"], ["bunjang", "ë²ˆê°œìž¥í„°"], ["fruits", "í›„ë¥´ì¸ "]];
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
    if (count === 3) return ["done", "ì—…ë¡œë“œ ì™„ë£Œ", "3/3"];
    if (count > 0) return ["partial", "ì¼ë¶€ ì—…ë¡œë“œ", `${count}/3`];
    return ["todo", "ì˜¨ë¼ì¸ ëŒ€ê¸°", "0/3"];
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
      ".product-shot{display:flex;align-items:center;gap:7px}",
      ".shot-thumb{width:44px;height:56px;overflow:hidden;border:1px solid #d6dee8;border-radius:8px;background:#f4f7fb;padding:0}",
      ".shot-thumb img{display:block;width:100%;height:100%;object-fit:cover}",
      ".shot-add{height:31px;padding:0 10px;border:1px dashed #b7c4d8;border-radius:8px;background:#f8faff;color:#526075;font-size:9px;font-weight:800}",
      ".shot-tools{display:flex;flex-direction:column;gap:4px}",
      ".shot-tools button{height:24px;padding:0 7px;border:0;border-radius:6px;background:#edf3ff;color:#356ae6;font-size:8.5px;font-weight:800}",
      ".shot-tools button.delete{background:#fff0f0;color:#c33}",
      ".product-status{display:flex;flex-direction:column;gap:4px;min-width:82px}",
      ".status-pill{display:inline-flex;align-items:center;justify-content:center;width:max-content;height:25px;padding:0 8px;border-radius:7px;font-size:9px;font-weight:850}",
      ".status-pill.todo{background:#fff7ed;color:#b45309}",
      ".status-pill.partial{background:#eef6ff;color:#2563eb}",
      ".status-pill.done{background:#ecfdf5;color:#05845f}",
      ".product-status small{color:#8a95a5;font-size:8.5px}",
      "@media(max-width:760px){.status-filters{padding:0 10px 11px}.product-shot-cell{min-width:84px}.shot-thumb{width:38px;height:48px}.shot-tools button{width:42px;padding:0}.status-pill{height:23px;padding:0 7px}}"
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
    return `<div class="product-status"><span class="status-pill ${kind}">${label}</span><small>${progress} ì—…ë¡œë“œ</small></div>`;
  }

  function shotMarkup(product, index) {
    const image = productImage(product);
    if (!image) {
      return `<div class="product-shot"><button type="button" class="shot-add" data-image-action="choose" data-image-index="${index}">ì‚¬ì§„ ì¶”ê°€</button></div>`;
    }
    return [
      '<div class="product-shot">',
      `<button type="button" class="shot-thumb" data-image-action="choose" data-image-index="${index}" title="ëŒ€í‘œì»· êµì²´"><img src="${safeEsc(image.src)}" alt=""></button>`,
      '<div class="shot-tools">',
      `<button type="button" data-image-action="choose" data-image-index="${index}">êµì²´</button>`,
      `<button type="button" class="delete" data-image-action="remove" data-image-index="${index}">ì‚­ì œ</button>`,
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
      if (button.dataset.imageAction === "remove") {
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
        shotHead.textContent = "ì œí’ˆì»·";
        headers[0].after(shotHead);
      }
      if (!row.querySelector("[data-upload-status-head]")) {
        const nameHead = [...row.children].find(cell => cell.textContent.trim() === "ìƒí’ˆëª…");
        if (nameHead) {
          const statusHead = document.createElement("th");
          statusHead.dataset.uploadStatusHead = "";
          statusHead.textContent = "ìƒíƒœ";
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
      let statusCell = tableRow.querySelector("[data-upload-status-cell]");
      if (!statusCell) {
        statusCell = document.createElement("td");
        statusCell.dataset.uploadStatusCell = "";
        tableRow.querySelector(".product-name")?.after(statusCell);
      }
      statusCell.innerHTML = statusMarkup(product);
    });
  }

  function updateStatusText() {
    const status = document.getElementById("status");
    if (!status || typeof mode === "undefined" || mode !== "saved" || activeFilter === "all") return;
    const label = filters.find(([key]) => key === activeFilter)?.[1] || "í•„í„°";
    if (!status.textContent.includes("í•„í„°")) status.textContent += ` Â· í•„í„°: ${label}`;
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      ensureStyles();
      ensureImageInput();
      ensureFilterBar();
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
      reader.onerror = () => reject(new Error("ì´ë¯¸ì§€ íŒŒì¼ì„ ì½ì§€ ëª»í–ˆìŠµë‹ˆë‹¤."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("ì´ë®¾ã²ž®–ðƒ®Ú#®~³²b“²ž ƒ®ªï¶Z#²*×®.#®.¸ˆ¤¤ì(€€€€€¥µ…”¹ÍÉŒ€ôÍÉŒì(€€€ô¤ì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸¥µ…•5•Ñ…É½µ¥±”¡™¥±”¤ì(€€€¥˜€ …™¥±”¹ÑåÁ”ñð€…™¥±”¹ÑåÁ”¹ÍÑ…ÉÑÍ]¥Ñ  ‰¥µ…”¼ˆ¤¤Ñ¡É½Ü¹•ÜÉÉ½È ‹²vÓ®¾ã²ž ƒ¶23²vó®ž0ƒ²ÚSªÂ¶V€ƒ²"`ƒ²z#²*×®.#®.¸ˆ¤ì(€€€½¹ÍÐÍ½ÕÉ”€ô…Ý…¥Ð™¥±•Q½…Ñ…UI0¡™¥±”¤ì(€€€½¹ÍÐ¥µ…”€ô…Ý…¥Ð±½…‘%µ…”¡Í½ÕÉ”¤ì(€€€½¹ÍÐµ…á]¥‘Ñ €ô€ÜÈÀì(€€€½¹ÍÐµ…á!•¥¡Ð€ô€äÀÀì(€€€½¹ÍÐÍ…±”€ô5…Ñ ¹µ¥¸ Ä°µ…á]¥‘Ñ €¼¥µ…”¹¹…ÑÕÉ…±]¥‘Ñ °µ…á!•¥¡Ð€¼¥µ…”¹¹…ÑÕÉ…±!•¥¡Ð¤ì(€€€½¹ÍÐÝ¥‘Ñ €ô5…Ñ ¹µ…à Ä°5…Ñ ¹É½Õ¹¡¥µ…”¹¹…ÑÕÉ…±]¥‘Ñ €¨Í…±”¤¤ì(€€€½¹ÍÐ¡•¥¡Ð€ô5…Ñ ¹µ…à Ä°5…Ñ ¹É½Õ¹¡¥µ…”¹¹…ÑÕÉ…±!•¥¡Ð€¨Í…±”¤¤ì(€€€½¹ÍÐ…¹Ù…Ì€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰…¹Ù…Ìˆ¤ì(€€€…¹Ù…Ì¹Ý¥‘Ñ €ôÝ¥‘Ñ ì(€€€…¹Ù…Ì¹¡•¥¡Ð€ô¡•¥¡Ðì(€€€½¹ÍÐ½¹Ñ•áÐ€ô…¹Ù…Ì¹•Ñ½¹Ñ•áÐ ˆÉˆ¤ì(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ô€ˆ™™˜ˆì(€€€½¹Ñ•áÐ¹™¥±±I•Ð À°€À°Ý¥‘Ñ °¡•¥¡Ð¤ì(€€€½¹Ñ•áÐ¹‘É…Ý%µ…”¡¥µ…”°€À°€À°Ý¥‘Ñ °¡•¥¡Ð¤ì(€€€É•ÑÕÉ¸ì(€€€€€ÍÉŒè…¹Ù…Ì¹Ñ½…Ñ…UI0 ‰¥µ…”½©Á•œˆ°€À¸à¤°(€€€€€¹…µ”è™¥±”¹¹…µ”ñð€‰ÁÉ½‘ÕÐµÁ¡½Ñ¼¹©Áœˆ°(€€€€€ÑåÁ”è€‰¥µ…”½©Á•œˆ°(€€€€€½É¥¥¹…±QåÁ”è™¥±”¹ÑåÁ”°(€€€€€ÕÁ‘…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤(€€€ôì(€ô((€™Õ¹Ñ¥½¸Ý¥Ñ¡AÉ½‘ÕÑ%µ…”¡ÁÉ½‘ÕÐ°¥µ…”¤ì(€€€É•ÑÕÉ¸ì(€€€€€€¸¸¹ÁÉ½‘ÕÐ°(€€€€€ÁÉ½‘ÕÑ%µ…”è¥µ…”°(€€€€€µ•…ÍÕÉ•µ•¹ÑÌèì€¸¸¹Í…™•5•…ÍÕÉ•µ•¹ÑÌ¡ÁÉ½‘ÕÐ¤°}}ÁÉ½‘ÕÑ%µ…”è¥µ…”ô°(€€€€€ÕÁ‘…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤(€€€ôì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸Í…Ù•AÉ½‘ÕÑ%µ…”¡¥¹‘•à°¥µ…”¤ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍ…Ù•‘m¥¹‘•átì(€€€¥˜€ …ÁÉ•Ù¥½ÕÌ¤É•ÑÕÉ¸ì(€€€½¹ÍÐÕÁ‘…Ñ•€ôÝ¥Ñ¡AÉ½‘ÕÑ%µ…”¡ÁÉ•Ù¥½ÕÌ°¥µ…”¤ì(€€€Í…Ù•‘m¥¹‘•át€ôÕÁ‘…Ñ•ì(€€€ÑÉäì(€€€€€¥˜€¡Ý¥¹‘½Ü¹M•±•Ñ±½Õ€˜˜M•±•Ñ±½Õ¹ÕÍ•È¤…Ý…¥ÐM•±•Ñ±½Õ¹Í…Ù•M…Ù•¡ÕÁ‘…Ñ•¤ì(€€€€€•±Í”¥˜€¡ÑåÁ•½˜Í…Ù•1½…±M…Ù•‘AÉ½‘ÕÐ€ôôô€‰™Õ¹Ñ¥½¸ˆ¤Í…Ù•1½…±M…Ù•‘AÉ½‘ÕÐ¡ÕÁ‘…Ñ•¤ì(€€€€€…Ý…¥Ð±½…‘M…Ù• ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€Í…Ù•‘m¥¹‘•át€ôÁÉ•Ù¥½ÕÌì(€€€€€É•¹‘•È ¤ì(€€€€€Ñ¡É½Ü•ÉÉ½Èì(€€€ô(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸ÕÁ‘…Ñ•AÉ½‘ÕÑ%µ…”¡¥¹‘•à°™¥±”¤ì(€€€½¹ÍÐ‰ÕÑÑ½¹Ì€ô‘½Õµ•¹Ð¹ÅÕ•ÉåM•±•Ñ½É±°¡m‘…Ñ„µ¥µ…”µ¥¹‘•àôˆ‘í¥¹‘•áô‰u€¤ì(€€€‰ÕÑÑ½¹Ì¹™½É… ¡‰ÕÑÑ½¸€ôøì(€€€€€‰ÕÑÑ½¸¹‘¥Í…‰±•€ôÑÉÕ”ì(€€€€€‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹ÁÉ•Ù¥½ÕÍQ•áÐ€ô‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ðì(€€€€€¥˜€¡‰ÕÑÑ½¸¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰Í¡½Ðµ…‘ˆ¤¤‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²‚²z”ƒ²’D¸¸¸ˆì(€€€ô¤ì(€€€ÑÉäì(€€€€€…Ý…¥ÐÍ…Ù•AÉ½‘ÕÑ%µ…”¡¥¹‘•à°…Ý…¥Ð¥µ…•5•Ñ…É½µ¥±”¡™¥±”¤¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€…±•ÉÐ¡•ÉÉ½È¹µ•ÍÍ…”ñð€‹®2¶Fs²îß²vƒ²‚²z—¶Vc²ž ƒ®ªï¶Z#²*×®.#®.¸ˆ¤ì(€€€ô™¥¹…±±äì(€€€€€‰ÕÑÑ½¹Ì¹™½É… ¡‰ÕÑÑ½¸€ôøì(€€€€€€€‰ÕÑÑ½¸¹‘¥Í…‰±•€ô™…±Í”ì(€€€€€€€¥˜€¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹ÁÉ•Ù¥½ÕÍQ•áÐ¤‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ð€ô‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹ÁÉ•Ù¥½ÕÍQ•áÐì(€€€€€ô¤ì(€€€ô(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸É•µ½Ù•AÉ½‘ÕÑ%µ…”¡¥¹‘•à¤ì(€€€¥˜€ …½¹™¥É´ ‹®2¶Fs²îß²vƒ²
·²‚s¶Vƒªæ3²jPüˆ¤¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€…Ý…¥ÐÍ…Ù•AÉ½‘ÕÑ%µ…”¡¥¹‘•à°¹Õ±°¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€…±•ÉÐ¡•ÉÉ½È¹µ•ÍÍ…”ñð€‹®2¶Fs²îß²vƒ²
·²‚s¶Vc²ž ƒ®ªï¶Z#²*×®.#®.¸ˆ¤ì(€€€ô(€ô((€™Õ¹Ñ¥½¸Á…Ñ¡AÉ½‘ÕÑA…” ¤ì(€€€¥˜€¡ÑåÁ•½˜™¥±Ñ•É•€„ôô€‰™Õ¹Ñ¥½¸ˆñðÑåÁ•½˜É•¹‘•È€„ôô€‰™Õ¹Ñ¥½¸ˆ¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ‰…Í•¥±Ñ•É•€ô™¥±Ñ•É•ì(€€€½¹ÍÐ‰…Í•I•¹‘•È€ôÉ•¹‘•Èì(€€€™¥±Ñ•É•€ô™Õ¹Ñ¥½¸€ ¤ì(€€€€€½¹ÍÐÉ½ÝÌ€ô‰…Í•¥±Ñ•É• ¤ì(€€€€€¥˜€¡ÑåÁ•½˜µ½‘”€ôôô€‰Õ¹‘•™¥¹•ˆñðµ½‘”€„ôô€‰Í…Ù•ˆ¤É•ÑÕÉ¸É½ÝÌì(€€€€€É•ÑÕÉ¸É½ÝÌ¹™¥±Ñ•È¡ÁÉ½‘ÕÐ€ôøµ…Ñ¡•Í¥±Ñ•È¡ÁÉ½‘ÕÐ¤¤ì(€€€ôì(€€€É•¹‘•È€ô™Õ¹Ñ¥½¸€ ¤ì(€€€€€‰…Í•I•¹‘•È ¤ì(€€€€€•¹¡…¹” ¤ì(€€€ôì(€€€¥˜€¡ÑåÁ•½˜Ñ½±•UÁ±½…‘M¥Ñ”€ôôô€‰™Õ¹Ñ¥½¸ˆ¤ì(€€€€€½¹ÍÐ‰…Í•Q½±•UÁ±½…‘M¥Ñ”€ôÑ½±•UÁ±½…‘M¥Ñ”ì(€€€€€Ñ½±•UÁ±½…‘M¥Ñ”€ô…Íå¹Œ™Õ¹Ñ¥½¸€ ¤ì(€€€€€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð‰…Í•Q½±•UÁ±½…‘M¥Ñ”¹…ÁÁ±ä¡Ñ¡¥Ì°…ÉÕµ•¹ÑÌ¤ì(€€€€€€€¥˜€¡ÑåÁ•½˜µ½‘”€„ôô€‰Õ¹‘•™¥¹•ˆ€˜˜µ½‘”€ôôô€‰Í…Ù•ˆ¤ì(€€€€€€€€€¥˜€¡…Ñ¥Ù•¥±Ñ•È€ôôô€‰…±°ˆ¤•¹¡…¹” ¤ì(€€€€€€€€€•±Í”ì(€€€€€€€€€€€¥˜€¡ÑåÁ•½˜Á…”€„ôô€‰Õ¹‘•™¥¹•ˆ¤Á…”€ô€Äì(€€€€€€€€€€€É•¹‘•È ¤ì(€€€€€€€€€ô(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸É•ÍÕ±Ðì(€€€€€ôì(€€€ô(€€€É•¹‘•È ¤ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô((€½¹ÍÐÍÑ…ÉÐ€ô€ ¤€ôøì(€€€•¹ÍÕÉ•MÑå±•Ì ¤ì(€€€•¹ÍÕÉ•%µ…•%¹ÁÕÐ ¤ì(€€€¥˜€ …Á…Ñ¡AÉ½‘ÕÑA…” ¤¤Í•ÑQ¥µ•½ÕÐ¡ÍÑ…ÉÐ°€ÄÀÀ¤ì(€ôì((€¥˜€¡‘½Õµ•¹Ð¹É•…‘åMÑ…Ñ”€ôôô€‰±½…‘¥¹œˆ¤‘½Õµ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰=5½¹Ñ•¹Ñ1½…‘•ˆ°ÍÑ…ÉÐ¤ì(€•±Í”ÍÑ…ÉÐ ¤ì)ô¤ ¤ì(