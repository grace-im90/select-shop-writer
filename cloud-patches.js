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
        if (needsUpload || needsImage) {
          try {
            var existing = await originalGet.call(cloud, product.id);
            var existingMeasurements = normalizeMeasurements(existing && existing.measurements);
            if (needsUpload && hasOwn(existingMeasurements, "__uploadSites")) measurements.__uploadSites = existingMeasurements.__uploadSites;
            if (needsImage && hasOwn(existingMeasurements, "__productImage")) measurements.__productImage = existingMeasurements.__productImage;
            product = { ...product, measurements };
            if (hasOwn(measurements, "__productImage")) product.productImage = measurements.__productImage;
          } catch (_error) {}
        }
      }
      return originalSave.call(this, product);
    };
    Object.defineProperty(cloud, "__productMetadataPatch", { value: true });
  }

  patchCloudSave();
})();
