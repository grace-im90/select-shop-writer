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
    if (!cloud || cloud.__productMetadataPatch) return;
    var originalSave = cloud.saveSaved, originalGet = cloud.getSaved;
    cloud.saveSaved = async function (product) {
      var measurements = { ...normalizeMeasurements(product && product.measurements) };
      var keys = ["__uploadSites", "__productImage", "__productCode", "__instagramCaption"];
      if (product && product.id && keys.some(key => !hasOwn(measurements, key))) {
        try {
          var existing = await originalGet.call(cloud, product.id);
          var stored = normalizeMeasurements(existing && existing.measurements);
          keys.forEach(key => { if (!hasOwn(measurements, key) && hasOwn(stored, key)) measurements[key] = stored[key]; });
        } catch (_error) {}
      }
      return originalSave.call(this, { ...product, measurements });
    };
    Object.defineProperty(cloud, "__productMetadataPatch", { value: true });
  }
  patchCloudSave();
})();
