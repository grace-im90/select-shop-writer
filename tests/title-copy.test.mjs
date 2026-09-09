import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../title-copy.js", import.meta.url), "utf8");

function harness({ writeText, legacyResult = true, legacyThrows = false } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const children = [];
  const legacyCopies = [];
  const prompts = [];
  let timerId = 0;
  let restoredFocus = 0;
  const originalFocus = { focus() { restoredFocus++; } };
  const document = {
    activeElement: originalFocus,
    body: { appendChild(element) { children.push(element); } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    createElement(tag) {
      return {
        tag, dataset: {}, style: {}, attributes: {}, textContent: "",
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { document.activeElement = this; },
        select() { this.selected = true; },
        setSelectionRange(start, end) { this.range = [start, end]; },
        remove() { children.splice(children.indexOf(this), 1); }
      };
    },
    execCommand(command) {
      assert.equal(command, "copy");
      const area = children.find(element => element.tag === "textarea");
      assert.equal(area.selected, true);
      assert.equal(area.range.join(","), `0,${area.value.length}`);
      legacyCopies.push(area.value);
      if (legacyThrows) throw new Error("Copy blocked");
      return legacyResult;
    }
  };
  runInNewContext(source, {
    document,
    navigator: { clipboard: writeText ? { writeText } : undefined },
    window: { prompt(message, text) { prompts.push({ message, text }); } },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    children, legacyCopies, prompts, timers,
    get restoredFocus() { return restoredFocus; },
    get notice() { return children.find(element => element.tag === "div"); },
    click(target) { return listeners.get("click")({ target }); }
  };
}

function title(textContent, disabled = false) {
  return {
    textContent, disabled,
    closest(selector) {
      assert.equal(selector, "button[data-copy-title]");
      return this;
    }
  };
}

test("copies the full Korean title only after a click and confirms completion", async () => {
  const copied = [];
  let finishCopy;
  const app = harness({ writeText(text) {
    copied.push(text);
    return new Promise(resolve => { finishCopy = resolve; });
  } });
  assert.equal(copied.length, 0);
  assert.equal(app.notice, undefined);
  const text = '브랜드 긴 상품명 & <특수문자> "정품" '.repeat(20).trim();
  const copying = app.click(title(`  ${text}  `));
  assert.deepEqual(copied, [text]);
  assert.equal(app.notice, undefined);
  finishCopy();
  await copying;
  assert.match(app.notice.textContent, /상품명이 복사되었습니다/);
  assert.equal(app.notice.dataset.error, "false");
  assert.equal(app.notice.attributes.role, "status");
  assert.equal(app.notice.attributes["aria-live"], "polite");
  assert.equal(app.legacyCopies.length, 0);
});

test("delegation copies updated titles, new list rows, and nested click targets", async () => {
  const copied = [];
  const app = harness({ writeText: async text => { copied.push(text); } });
  const first = title("첫 번째 상품");
  await app.click(first);
  first.textContent = "수정된 상품";
  await app.click(first);
  const second = title("다음 페이지 상품");
  await app.click({ closest: () => second });
  assert.deepEqual(copied, ["첫 번째 상품", "수정된 상품", "다음 페이지 상품"]);
  assert.equal(app.children.length, 1);
  assert.equal(app.timers.size, 1);
  [...app.timers.values()][0]();
  assert.equal(app.notice.hidden, true);
  await app.click(second);
  assert.equal(app.notice.hidden, false);
});

test("ignores other controls, empty titles, and the disabled preview placeholder", async () => {
  const copied = [];
  const app = harness({ writeText: async text => { copied.push(text); } });
  for (const target of [{}, { closest: () => null }, title("  "), title("상품명을 입력해 주세요", true)]) {
    await app.click(target);
  }
  assert.equal(copied.length, 0);
  assert.equal(app.legacyCopies.length, 0);
  assert.equal(app.notice, undefined);
});

test("uses the legacy fallback when the clipboard API is unavailable", async () => {
  const app = harness();
  await app.click(title("폴로 셔츠"));
  assert.deepEqual(app.legacyCopies, ["폴로 셔츠"]);
  assert.equal(app.restoredFocus, 1);
  assert.equal(app.children.some(element => element.tag === "textarea"), false);
  assert.equal(app.notice.dataset.error, "false");
});

test("uses the legacy fallback after a rejected clipboard permission", async () => {
  const app = harness({ writeText: async () => { throw new Error("NotAllowedError"); } });
  await app.click(title("나이키 바람막이"));
  assert.deepEqual(app.legacyCopies, ["나이키 바람막이"]);
  assert.equal(app.restoredFocus, 1);
  assert.equal(app.prompts.length, 0);
  assert.equal(app.notice.dataset.error, "false");
});

for (const legacyThrows of [false, true]) {
  test(`offers manual copying when fallback ${legacyThrows ? "throws" : "returns false"}`, async () => {
    const app = harness({ legacyResult: false, legacyThrows });
    await app.click(title("복사할 상품명"));
    assert.equal(app.notice.dataset.error, "true");
    assert.doesNotMatch(app.notice.textContent, /복사되었습니다/);
    assert.equal(app.prompts.length, 1);
    assert.equal(app.prompts[0].text, "복사할 상품명");
    assert.equal(app.restoredFocus, 1);
    assert.equal(app.children.some(element => element.tag === "textarea"), false);
  });
}

test("a stale failure does not interrupt a newer successful copy", async () => {
  let failFirst;
  const app = harness({
    legacyResult: false,
    writeText(text) {
      if (text === "첫 상품") return new Promise((resolve, reject) => { failFirst = reject; });
      return Promise.resolve();
    }
  });
  const first = app.click(title("첫 상품"));
  await app.click(title("둘째 상품"));
  failFirst(new Error("Late failure"));
  await first;
  assert.equal(app.notice.dataset.error, "false");
  assert.equal(app.prompts.length, 0);
});

test("all three pages include the shared assets, native title buttons, and valid scripts", () => {
  for (const [path, prefix] of [["index.html", ""], ["products/index.html", "../"], ["products/sold/index.html", "../../"]]) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.ok(html.includes(`href="${prefix}title-copy.css?v=1"`), path);
    assert.ok(html.includes(`src="${prefix}title-copy.js?v=1"`), path);
    assert.match(html, /<button type="button"[^>]*data-copy-title/);
    assert.ok(html.includes("판매글 전체 복사"), path);
    for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(attributes)) assert.doesNotThrow(() => new Script(code, { filename: path }));
    }
  }
  const products = readFileSync(new URL("../products/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(products, /상품 목록 불러오기|id="excelFile"|function loadExcelFile/);
});
