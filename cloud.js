(function () {
  var src = (document.currentScript && document.currentScript.src) || "";
  var base = src ? src.replace(/\/[^\/]*$/, "") : "https://grace-im90.github.io/select-shop-writer";
  function writeScript(path) {
    document.write('<script src="' + path + '"><\\/script>');
  }
  writeScript(base + "/cloud-core.js?v=1");
  writeScript(base + "/cloud-patches.js?v=1");
  if (/\/products\/?$/.test(location.pathname)) writeScript("management.js?v=1");
})();
