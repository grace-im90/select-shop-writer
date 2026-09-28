(function () {
  const locations = ["1호점", "2호점", "창고"];
  const pending = new Map();

  function locationOf(product) {
    const value = measurementsOf(product).__storageLocation;
    return locations.includes(value) ? value : "";
  }

  function control(product) {
    const id = String(product.id);
    const value = pending.has(id) ? pending.get(id) : locationOf(product);
    const label = [product.brand, product.name, "보관 위치"].filter(Boolean).join(" ");
    return `<select class="storage-location" data-storage-id="${esc(id)}" aria-label="${esc(label)}" ${pending.has(id) ? 'disabled aria-busy="true"' : ""}>
      <option value="" disabled ${value ? "" : "selected"}>위치 선택</option>
      ${locations.map(location => `<option value="${location}" ${value === location ? "selected" : ""}>${location}</option>`).join("")}
    </select>`;
  }

  async function change(select) {
    const id = select.dataset.storageId;
    const value = select.value;
    if (!locations.includes(value) || pending.has(id)) return;
    const previous = saved.find(product => String(product.id) === id);
    if (!previous) return;
    pending.set(id, value);
    select.disabled = true;
    select.setAttribute("aria-busy", "true");
    let selected = locationOf(previous);
    try {
      const patch = { __storageLocation: value };
      let updated;
      if (window.SelectCloud?.user) {
        updated = await SelectCloud.updateSavedMetadata(id, patch);
      } else {
        updated = { ...previous, measurements: { ...measurementsOf(previous), ...patch }, updatedAt: new Date().toISOString() };
        saveLocalSavedProduct(updated);
      }
      const index = saved.findIndex(product => String(product.id) === id);
      if (index >= 0) saved[index] = updated;
      selected = value;
    } catch (error) {
      alert(error.message || "보관 위치를 저장하지 못했습니다. 다시 선택해 주세요.");
    } finally {
      pending.delete(id);
      document.querySelectorAll("[data-storage-id]").forEach(control => {
        if (control.dataset.storageId !== id) return;
        control.value = selected;
        control.disabled = false;
        control.removeAttribute("aria-busy");
      });
    }
  }

  window.SelectProductStorage = { control };
  document.addEventListener("change", event => {
    if (event.target.matches("select[data-storage-id]")) change(event.target);
  });
})();
