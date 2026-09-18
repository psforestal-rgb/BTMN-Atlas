(function () {
  function hook() {
    if (typeof identificarEn !== 'function' || identificarEn._ctrlHook) {
      setTimeout(hook, 80);
      return;
    }
    const orig = identificarEn;
    identificarEn = async function (lat, lng) {
      await orig(lat, lng);
      const hits = (typeof identHits !== 'undefined' && identHits) ? identHits.slice() : [];
      window.dispatchEvent(new CustomEvent('btmn-identificado', {
        detail: { lat: lat, lng: lng, hits: hits }
      }));
    };
    identificarEn._ctrlHook = true;
  }
  hook();
})();
