(function () {
  const SUPABASE_URL = "https://tlscqkscqhpxpvrmebyz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vou0943C-8FaPVzCWEypLQ_5yTwqgI8";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let currentUser = null;
  let readyResolve;
  const readyPromise = new Promise(resolve => { readyResolve = resolve; });
  const listeners = [];
  let initialized = false;
  const savingById = new Map();
  const indexRequests = new Map();

  function normalizeMeasurements(value) {
    if (!value) return {};
    if (typeof value === "string") {
      try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch (_error) { return {}; }
    }
    return typeof value === "object" ? value : {};
  }

  function productImage(product) {
    const stored = normalizeMeasurements(product?.measurements);
    if (stored.__productImageDeletedAt) return null;
    const candidates = [stored.__productImage, product?.productImage, stored.__draft?.productImage];
    for (let value of candidates) {
      if (typeof value === "string" && value.trim().startsWith("{")) {
        try { value = JSON.parse(value); } catch (_error) { continue; }
      }
      const src = typeof value === "string" ? value : value?.src;
      if (typeof src === "string" && /^(data:image\/(?:jpeg|jpg|png|webp|gif);base64,|https:\/\/)/i.test(src)) {
        return { ...(typeof value === "object" ? value : {}), src };
      }
    }
    return null;
  }

  async function requestWithTimeout(query) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        typeof query.abortSignal === "function" ? query.abortSignal(controller.signal) : query,
        new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort();
          reject(new Error("사진 요청 시간이 초과되었습니다. 다시 불러오기를 눌러 주세요."));
        }, 15000); })
      ]);
    } finally { clearTimeout(timer); }
  }

  function savedFromRow(row) {
    const measurements = { ...normalizeMeasurements(row.measurements) };
    if (!measurements.__draft || typeof measurements.__draft !== "object") {
      measurements.__draft = {
        brand: measurements.__brand ?? row.brand ?? "",
        name: measurements.__name ?? row.name ?? "",
        productType: measurements.__productType ?? row.product_type ?? "상의",
        size: measurements.__size ?? row.size ?? "표기 없음",
        condition: measurements.__condition ?? row.condition ?? "B+ 좋은 상태",
        price: Number(measurements.__price ?? row.price ?? 0),
        description: measurements.__description ?? row.description ?? "",
        notice: measurements.__notice ?? ""
      };
    }
    return {
      id: row.id,
      brand: row.brand || "",
      name: row.name || "",
      productType: row.product_type || "상의",
      size: row.size || "표기 없음",
      condition: row.condition || "B+ 좋은 상태",
      price: Number(row.price || 0),
      description: row.description || "",
      measurements,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  const savedIndexKeys = ["length", "shoulder", "chest", "sleeve", "waist", "hip", "thigh", "rise", "hem", "__draft", "__productCode", "__uploadSites", "__soldAt", "__status", "__brand", "__name", "__productType", "__size", "__condition", "__price", "__description", "__notice", "__instagramCaption", "__finalText", "__savedVersion"];
  const savedIndexSelect = ["id", "brand", "name", "product_type", "size", "condition", "price", "description", "created_at", "updated_at", ...savedIndexKeys.map(key => {
    const alias = "m_" + key.replace(/^__/, "");
    return `${alias}:measurements->${key}`;
  })].join(",");

  function savedIndexFromRow(row) {
    const measurements = {};
    savedIndexKeys.forEach(key => {
      const alias = "m_" + key.replace(/^__/, "");
      if (row[alias] !== undefined && row[alias] !== null) measurements[key] = row[alias];
    });
    return savedFromRow({ ...row, measurements });
  }

  function catalogFromRow(row) {
    return {
      code: row.code || "",
      barcode: row.barcode || "",
      name: row.name || "",
      brand: row.brand || "",
      size: row.size || "",
      type: row.product_type || "상의",
      price: Number(row.price || 0)
    };
  }

  async function notify() {
    updateAuthUI();
    for (const listener of listeners) await listener(currentUser);
  }

  function updateAuthUI(message) {
    const status = document.getElementById("cloudStatus");
    const email = document.getElementById("cloudEmail");
    const password = document.getElementById("cloudPassword");
    const login = document.getElementById("cloudLogin");
    const signup = document.getElementById("cloudSignup");
    const logout = document.getElementById("cloudLogout");
    const sync = document.getElementById("cloudSync");
    if (!status) return;
    status.textContent = message || (currentUser ? `${currentUser.email} · 클라우드 동기화 중` : "로그인하면 PC와 휴대폰에서 같은 데이터를 볼 수 있습니다.");
    status.classList.toggle("connected", Boolean(currentUser));
    [email, password, login, signup].forEach(element => element?.classList.toggle("hidden", Boolean(currentUser)));
    logout?.classList.toggle("hidden", !currentUser);
    sync?.classList.toggle("hidden", !currentUser);
  }

  async function initialize() {
    const { data } = await client.auth.getSession();
    currentUser = data.session?.user || null;
    initialized = true;
    readyResolve(currentUser);
    await notify();
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      setTimeout(() => notify(), 0);
    });
  }

  async function signIn(email, password) {
    updateAuthUI("로그인 중…");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password) {
    updateAuthUI("회원가입 중…");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) updateAuthUI("인증 메일을 확인한 뒤 로그인해 주세요.");
  }

  function bindAuth(onChange) {
    if (onChange) {
      listeners.push(onChange);
      if (initialized) setTimeout(() => onChange(currentUser), 0);
    }
    const email = document.getElementById("cloudEmail");
    const password = document.getElementById("cloudPassword");
    const login = document.getElementById("cloudLogin");
    const signup = document.getElementById("cloudSignup");
    const logout = document.getElementById("cloudLogout");
    login && (login.onclick = async () => {
      try {
        if (!email.value || !password.value) throw new Error("이메일과 비밀번호를 입력해 주세요.");
        await signIn(email.value.trim(), password.value);
      } catch (error) {
        updateAuthUI(error.message || "로그인하지 못했습니다.");
      }
    });
    signup && (signup.onclick = async () => {
      try {
        if (!email.value || password.value.length < 6) throw new Error("이메일과 6자리 이상의 비밀번호를 입력해 주세요.");
        await signUp(email.value.trim(), password.value);
      } catch (error) {
        updateAuthUI(error.message || "회원가입하지 못했습니다.");
      }
    });
    logout && (logout.onclick = () => client.auth.signOut());
    updateAuthUI();
  }

  async function listSaved(options = {}) {
    await readyPromise;
    if (!currentUser) return null;
    if (options.summary) {
      const owner = currentUser.id;
      if (indexRequests.has(owner)) return indexRequests.get(owner);
      const request = (async () => {
        const keys = ["__productCode", "__uploadSites", "__soldAt", "__status", "__productImageDeletedAt"];
        const selection = ["id", "brand", "name", "product_type", "size", "condition", "price", "created_at", "updated_at",
          ...keys.map(key => `m_${key.slice(2)}:measurements->${key}`)].join(",");
        const { data, error } = await client.from("saved_products").select(selection).order("created_at", { ascending: false }).order("id", { ascending: false });
        if (error) throw error;
        return data.map(row => {
          const measurements = {};
          keys.forEach(key => { if (row[`m_${key.slice(2)}`] != null) measurements[key] = row[`m_${key.slice(2)}`]; });
          return { id: row.id, brand: row.brand, name: row.name, productType: row.product_type,
            size: row.size, condition: row.condition, price: row.price, createdAt: row.created_at,
            updatedAt: row.updated_at, measurements, _summary: true };
        });
      })();
      indexRequests.set(owner, request);
      try { return await request; } finally { if (indexRequests.get(owner) === request) indexRequests.delete(owner); }
    }
    const { data, error } = await client.from("saved_products").select(savedIndexSelect).order("updated_at", { ascending: false });
    if (error) throw error;
    return data.map(savedIndexFromRow);
  }

  async function listSavedImages(ids) {
    await readyPromise;
    if (!currentUser || !Array.isArray(ids) || ids.length === 0) return [];
    const batches = [];
    for (let index = 0; index < ids.length; index += 8) batches.push(ids.slice(index, index + 8));
    const results = await Promise.all(batches.map(async batch => {
      const { data, error } = await requestWithTimeout(client.from("saved_products")
        .select("id,measurements")
        .in("id", batch));
      if (error) throw error;
      return data.map(row => {
        let measurements = row.measurements;
        if (typeof measurements === "string") {
          try { measurements = JSON.parse(measurements); } catch (_error) { measurements = {}; }
        }
        return { id: row.id, productImage: productImage({ measurements }) };
      });
    }));
    return results.flat();
  }

  async function listSavedImageIds() {
    await readyPromise;
    if (!currentUser) return [];
    const { data, error } = await requestWithTimeout(client.from("saved_products").select("id")
      .or("measurements->>__productImage.not.is.null,measurements->__draft->>productImage.not.is.null"));
    if (error) throw error;
    return data.map(row => String(row.id));
  }

  async function getSaved(id) {
    await readyPromise;
    if (!currentUser) return null;
    const { data, error } = await client.from("saved_products").select("*").eq("id", id).single();
    if (error) throw error;
    return savedFromRow(data);
  }

  function serializeSave(id, action) {
    const previous = savingById.get(String(id)) || Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    savingById.set(String(id), next);
    const cleanup = () => { if (savingById.get(String(id)) === next) savingById.delete(String(id)); };
    next.then(cleanup, cleanup);
    return next;
  }

  function saveSaved(product) {
    return serializeSave(product.id, () => saveSavedNow(product));
  }

  async function updateSavedMetadata(id, changes) {
    return serializeSave(id, async () => {
      const existing = await getSaved(id);
      if (!existing) throw new Error("상품 원본을 확인하지 못해 저장을 중단했습니다.");
      const patch = typeof changes === "function" ? changes(existing.measurements) : changes;
      return saveSavedNow({ ...existing, measurements: { ...existing.measurements, ...patch } }, existing);
    });
  }

  async function saveSavedNow(product, original = null) {
    await readyPromise;
    if (!currentUser) return null;
    const isExisting = product.id && String(product.id).length < 13;
    const existing = original || (isExisting ? await getSaved(product.id) : null);
    const incoming = normalizeMeasurements(product.measurements);
    const stored = normalizeMeasurements(existing?.measurements);
    const measurements = product._summary ? { ...stored, ...incoming } : { ...incoming };
    for (const key of ["__productImage", "__productCode", "__uploadSites", "__instagramCaption", "__productImageDeletedAt"]) {
      if (!Object.prototype.hasOwnProperty.call(incoming, key) && Object.prototype.hasOwnProperty.call(stored, key)) measurements[key] = stored[key];
    }
    // A missing image in a summary is not an instruction to delete the original.
    if (Object.prototype.hasOwnProperty.call(incoming, "__productImage")) {
      if (incoming.__productImage === null) {
        measurements.__productImageDeletedAt = new Date().toISOString();
        if (measurements.__draft) measurements.__draft = { ...measurements.__draft, productImage: null };
      } else if (productImage({ measurements: { __productImage: incoming.__productImage } })) {
        delete measurements.__productImageDeletedAt;
      }
    }
    product = { ...existing, ...product };
    const payload = {
      brand: product.brand,
      name: product.name,
      product_type: product.productType,
      size: product.size,
      condition: product.condition,
      price: product.price,
      description: product.description,
      measurements,
      updated_at: new Date().toISOString()
    };
    let query;
    if (isExisting) {
      query = client.from("saved_products").update(payload).eq("id", product.id).select().single();
    } else {
      query = client.from("saved_products").insert(payload).select().single();
    }
    const { data, error } = await query;
    if (error) throw error;
    return savedFromRow(data);
  }

  async function deleteSaved(id) {
    await readyPromise;
    if (!currentUser) return false;
    const { error } = await client.from("saved_products").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function listCatalog() {
    await readyPromise;
    if (!currentUser) return null;
    const { data, error } = await client.from("inventory_products").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return data.map(catalogFromRow);
  }

  async function syncCatalog(products, replace) {
    await readyPromise;
    if (!currentUser) return false;
    if (replace) {
      const { error } = await client.from("inventory_products").delete().eq("user_id", currentUser.id);
      if (error) throw error;
    }
    const rows = products.map(product => ({
      user_id: currentUser.id,
      product_key: product.barcode ? `barcode:${product.barcode}` : product.code ? `code:${product.code}` : `name:${product.name.toLowerCase().replace(/\s+/g, "")}`,
      code: product.code || "",
      barcode: product.barcode || "",
      name: product.name,
      brand: product.brand || "",
      size: product.size || "",
      product_type: product.type || "상의",
      price: Number(product.price || 0),
      updated_at: new Date().toISOString()
    }));
    for (let index = 0; index < rows.length; index += 300) {
      const { error } = await client.from("inventory_products").upsert(rows.slice(index, index + 300), { onConflict: "user_id,product_key" });
      if (error) throw error;
    }
    return true;
  }

  const uploadSites = [["carrot", "당근"], ["bunjang", "번개장터"], ["fruits", "후르츠"]];

  function uploadSource(product) {
    const measurements = normalizeMeasurements(product?.measurements);
    return product?.uploadSites ?? measurements.__uploadSites;
  }

  function uploadState(product) {
    let source = uploadSource(product) ?? {};
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch (_error) { source = {}; }
    }
    return Object.fromEntries(uploadSites.map(([key, label]) => [
      key,
      Array.isArray(source) ? source.includes(key) || source.includes(label) : Boolean(source?.[key] || source?.[label])
    ]));
  }

  function hasUploadMetadata(product) {
    return uploadSource(product) !== undefined && uploadSource(product) !== null;
  }

  function withUploadState(product, state) {
    return {
      ...product,
      uploadSites: state,
      measurements: { ...normalizeMeasurements(product?.measurements), __uploadSites: state }
    };
  }

  function localSavedProducts() {
    try { return JSON.parse(localStorage.getItem("select-saved-products") || "[]"); } catch (_error) { return []; }
  }

  function saveLocalUploadState(id, state) {
    const products = localSavedProducts();
    const index = products.findIndex(product => String(product.id) === String(id));
    if (index >= 0) {
      products[index] = withUploadState(products[index], state);
      localStorage.setItem("select-saved-products", JSON.stringify(products));
    }
  }

  function preserveLocalUploadState() {
    if (!window.Storage || Storage.prototype.__selectUploadSitesPatched) return;
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, "__selectUploadSitesPatched", { value: true });
    Storage.prototype.setItem = function (key, value) {
      if (key === "select-saved-products") {
        try {
          const next = JSON.parse(value);
          if (Array.isArray(next)) {
            const previous = localSavedProducts();
            const previousById = new Map(previous.map(product => [String(product.id), product]));
            value = JSON.stringify(next.map(product => {
              if (hasUploadMetadata(product)) return product;
              const previousState = uploadState(previousById.get(String(product.id)));
              return hasUploadMetadata(previousById.get(String(product.id))) ? withUploadState(product, previousState) : product;
            }));
          }
        } catch (_error) {}
      }
      return originalSetItem.call(this, key, value);
    };
  }

  function setupProductUploadChecks() {
    if (!/\/products\/?$/.test(location.pathname)) return;
    preserveLocalUploadState();
    const stateById = new Map();

    function ensureStyles() {
      if (document.getElementById("uploadSitesStyle")) return;
      const style = document.createElement("style");
      style.id = "uploadSitesStyle";
      style.textContent = ".upload-sites{display:flex;align-items:center;gap:6px;min-width:188px}.upload-check{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:1px solid #d6dee8;border-radius:7px;background:#fff;color:#526075;font-size:9px;font-weight:750}.upload-check.checked{border-color:#b9cdf8;background:#f7faff;color:#356ae6}.upload-check input{width:13px;height:13px;margin:0;accent-color:#356ae6}.upload-check.saving{opacity:.55}";
      document.head.appendChild(style);
    }

    function controlFor(id, key, label, checked) {
      const wrap = document.createElement("label");
      wrap.className = "upload-check" + (checked ? " checked" : "");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.setAttribute("aria-label", `${label} 업로드 완료`);
      input.onchange = () => saveUploadCheck(id, key, input.checked, input, wrap);
      const text = document.createElement("span");
      text.textContent = label;
      wrap.append(input, text);
      return wrap;
    }

    function controls(id) {
      const state = stateById.get(String(id)) || {};
      const box = document.createElement("div");
      box.className = "upload-sites";
      uploadSites.forEach(([key, label]) => box.appendChild(controlFor(id, key, label, Boolean(state[key]))));
      return box;
    }

    function enhanceTable() {
      ensureStyles();
      const head = document.getElementById("tableHead");
      const body = document.getElementById("tableBody");
      if (!head || !body) return;
      const headers = [...head.querySelectorAll("th")];
      const isSavedTable = head.textContent.includes("관리 가격");
      if (isSavedTable && !head.querySelector("[data-upload-sites-head]")) {
        const existingUploadHeader = headers.find(header => header.textContent.trim() === "업로드 확인");
        if (existingUploadHeader) existingUploadHeader.dataset.uploadSitesHead = "";
        const productHeader = headers.find(header => header.textContent.trim() === "상품명");
        if (!existingUploadHeader && productHeader) {
          const uploadHeader = document.createElement("th");
          uploadHeader.dataset.uploadSitesHead = "";
          uploadHeader.textContent = "업로드 확인";
          productHeader.after(uploadHeader);
        }
      }
      body.querySelectorAll("tr").forEach(row => {
        const deleteButton = row.querySelector("[data-delete]");
        if (!deleteButton) return;
        const existingCell = row.querySelector("[data-upload-sites-cell]");
        if (existingCell) {
          existingCell.replaceChildren(controls(deleteButton.dataset.delete));
          return;
        }
        if (row.querySelector(".upload-sites")) return;
        const nameCell = row.querySelector(".product-name");
        if (!nameCell) return;
        const cell = document.createElement("td");
        cell.dataset.uploadSitesCell = "";
        cell.appendChild(controls(deleteButton.dataset.delete));
        nameCell.after(cell);
      });
    }

    async function refreshUploadStates() {
      try {
        await readyPromise;
        const products = currentUser ? await listSaved() : localSavedProducts();
        stateById.clear();
        products.forEach(product => stateById.set(String(product.id), uploadState(product)));
      } catch (_error) {}
      enhanceTable();
    }

    async function saveUploadCheck(id, key, checked, input, label) {
      const previous = stateById.get(String(id)) || {};
      const next = { ...previous, [key]: checked };
      stateById.set(String(id), next);
      label.classList.toggle("checked", checked);
      label.classList.add("saving");
      input.disabled = true;
      try {
        await readyPromise;
        if (currentUser) {
          const product = await getSaved(id);
          if (product) await saveSaved(withUploadState(product, next));
        } else {
          saveLocalUploadState(id, next);
        }
      } catch (error) {
        stateById.set(String(id), previous);
        input.checked = !checked;
        label.classList.toggle("checked", !checked);
        alert(error.message || "업로드 체크 상태를 저장하지 못했습니다.");
      } finally {
        input.disabled = false;
        label.classList.remove("saving");
      }
    }

    const start = () => {
      refreshUploadStates();
      const body = document.getElementById("tableBody");
      const head = document.getElementById("tableHead");
      if (!body || !head) return setTimeout(start, 100);
      new MutationObserver(enhanceTable).observe(body, { childList: true });
      new MutationObserver(enhanceTable).observe(head, { childList: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
    listeners.push(refreshUploadStates);
  }

  window.SelectCloud = {
    __productMetadataPatch: true,
    client,
    ready: () => readyPromise,
    get user() { return currentUser; },
    bindAuth,
    listSaved,
    listSavedImages,
    listSavedImageIds,
    productImage,
    getSaved,
    saveSaved,
    updateSavedMetadata,
    deleteSaved,
    listCatalog,
    syncCatalog,
    setStatus: updateAuthUI
  };
  initialize().catch(error => {
    readyResolve(null);
    updateAuthUI(error.message || "클라우드 연결을 확인하지 못했습니다.");
  });
})();
