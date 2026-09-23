/* Account-scoped, best-effort photo cache. The server remains authoritative. */
(function () {
  let database;
  function open() {
    if (database) return database;
    database = new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      try {
        const request = indexedDB.open("select-product-photos", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "key" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch (_error) { resolve(null); }
    });
    return database;
  }
  async function read(owner, id) {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const request = db.transaction("photos").objectStore("photos").get(`${owner}:${id}`);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_error) { resolve(null); }
    });
  }
  async function write(owner, id, entry) {
    const db = await open();
    if (!db) return;
    try {
      const transaction = db.transaction("photos", "readwrite");
      transaction.objectStore("photos").put({ ...entry, key: `${owner}:${id}` });
      transaction.onerror = () => {}; // Quota or private-mode errors must not block the list.
    } catch (_error) {}
  }
  window.SelectPhotoCache = { read, write };
})();
