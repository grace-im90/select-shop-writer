(function () {
  const SUPABASE_URL = "https://tlscqkscqhpxpvrmebyz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vou0943C-8FaPVzCWEypLQ_5yTwqgI8";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let currentUser = null;
  let readyResolve;
  const readyPromise = new Promise(resolve => { readyResolve = resolve; });
  const listeners = [];

  function savedFromRow(row) {
    return {
      id: row.id,
      brand: row.brand || "",
      name: row.name || "",
      productType: row.product_type || "상의",
      size: row.size || "표기 없음",
      condition: row.condition || "B+ 좋은 상태",
      price: Number(row.price || 0),
      description: row.description || "",
      measurements: row.measurements || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
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
    if (!status) return;
    status.textContent = message || (currentUser ? `${currentUser.email} · 클라우드 동기화 중` : "로그인하면 PC와 휴대폰에서 같은 데이터를 볼 수 있습니다.");
    status.classList.toggle("connected", Boolean(currentUser));
    [email, password, login, signup].forEach(element => element?.classList.toggle("hidden", Boolean(currentUser)));
    logout?.classList.toggle("hidden", !currentUser);
  }

  async function initialize() {
    const { data } = await client.auth.getSession();
    currentUser = data.session?.user || null;
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
    if (onChange) listeners.push(onChange);
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
    readyPromise.then(() => onChange && onChange(currentUser));
    updateAuthUI();
  }

  async function listSaved() {
    await readyPromise;
    if (!currentUser) return null;
    const { data, error } = await client.from("saved_products").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return data.map(savedFromRow);
  }

  async function getSaved(id) {
    await readyPromise;
    if (!currentUser) return null;
    const { data, error } = await client.from("saved_products").select("*").eq("id", id).single();
    if (error) throw error;
    return savedFromRow(data);
  }

  async function saveSaved(product) {
    await readyPromise;
    if (!currentUser) return null;
    const payload = {
      brand: product.brand,
      name: product.name,
      product_type: product.productType,
      size: product.size,
      condition: product.condition,
      price: product.price,
      description: product.description,
      measurements: product.measurements,
      updated_at: new Date().toISOString()
    };
    let query;
    if (product.id && String(product.id).length < 13) {
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

  window.SelectCloud = {
    client,
    ready: () => readyPromise,
    get user() { return currentUser; },
    bindAuth,
    listSaved,
    getSaved,
    saveSaved,
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
