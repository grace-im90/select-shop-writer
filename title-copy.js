(function () {
  "use strict";

  let notice;
  let noticeTimer;
  let latestRequest = 0;

  function showNotice(message, error = false) {
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "title-copy-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.setAttribute("aria-atomic", "true");
      document.body.appendChild(notice);
    }
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.dataset.error = String(error);
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 2400);
  }

  async function writeTitle(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_error) {
      // Older browsers and restricted clipboard contexts use the fallback below.
    }

    const previousFocus = document.activeElement;
    const area = document.createElement("textarea");
    area.value = text;
    area.readOnly = true;
    area.tabIndex = -1;
    area.setAttribute("aria-label", "복사할 상품명");
    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px";
    document.body.appendChild(area);
    try {
      area.focus({ preventScroll: true });
      area.select();
      area.setSelectionRange(0, text.length);
      return document.execCommand("copy") === true;
    } catch (_error) {
      return false;
    } finally {
      area.remove();
      previousFocus?.focus({ preventScroll: true });
    }
  }

  // Delegation also covers search results and pagination without rebinding.
  document.addEventListener("click", async function (event) {
    const button = event.target.closest?.("button[data-copy-title]");
    if (!button || button.disabled) return;
    const text = button.textContent.trim();
    if (!text) return;
    const request = ++latestRequest;
    const copied = await writeTitle(text);
    if (request !== latestRequest) return;
    if (copied) {
      showNotice("✓ 상품명이 복사되었습니다.");
    } else {
      showNotice("자동 복사가 차단됐습니다. 아래 창에서 상품명을 복사해 주세요.", true);
      window.prompt("상품명을 길게 누르거나 선택해 복사해 주세요.", text);
    }
  });
})();
