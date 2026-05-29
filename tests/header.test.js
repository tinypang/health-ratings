/**
 * Header regression tests.
 *
 * The map header (containing the Grades / Violations dropdowns, search box,
 * and Stats/Changes button) is the only way users access the filters and
 * weekly diff modal. It must stay rendered at every viewport size — most
 * critically on mobile, where a stray `display:none` inside a media query
 * has previously been a real risk.
 *
 * These tests parse index.html with jsdom and assert:
 *   1. The header element and its key children are present in the DOM.
 *   2. No CSS rule (top-level OR inside any @media block) hides the header
 *      or its essential controls.
 *
 * We can't run a real layout engine inside jsdom, so #2 is a static CSS
 * audit: it catches `display:none`, `visibility:hidden`, and `opacity:0`
 * on the protected selectors, which covers every realistic regression
 * path for "the buttons aren't showing anymore on mobile".
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "index.html");
const HTML = fs.readFileSync(HTML_PATH, "utf8");

// Elements that must always be present and visible inside the header.
const REQUIRED_IDS = [
  "grades-btn",
  "violations-btn",
  "changes-btn",
  "search-input",
];

// Selectors a CSS hide-rule must NEVER target. We check the exact selector
// string after trimming, which catches `header`, `#grades-btn`, etc. — the
// kind of broad rule that would knock an essential control out at any width.
const PROTECTED_SELECTORS = new Set([
  "header",
  "#search-wrap",
  ...REQUIRED_IDS.map((id) => `#${id}`),
]);

const HIDING_DECLARATIONS = [
  /\bdisplay\s*:\s*none\b/i,
  /\bvisibility\s*:\s*hidden\b/i,
  /\bopacity\s*:\s*0(?:\.0+)?\b/i,
];

/**
 * Walks every CSS rule in every `<style>` block, including rules nested
 * inside `@media` queries, and yields `{ selector, body, mediaQuery }`
 * objects. Uses a brace-balanced scanner rather than regex so nested
 * `@media` blocks are handled correctly.
 */
function* iterCssRules(cssText) {
  const len = cssText.length;
  function* walk(start, end, mediaQuery) {
    let i = start;
    while (i < end) {
      // Skip whitespace and comments.
      while (i < end && /\s/.test(cssText[i])) i++;
      if (cssText.startsWith("/*", i)) {
        const close = cssText.indexOf("*/", i + 2);
        i = close === -1 ? end : close + 2;
        continue;
      }
      if (i >= end) break;

      // Find the opening brace of the next block.
      const open = cssText.indexOf("{", i);
      if (open === -1 || open >= end) break;

      // Find its matching close brace (balanced).
      let depth = 1;
      let j = open + 1;
      while (j < end && depth > 0) {
        const c = cssText[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        if (depth === 0) break;
        j++;
      }
      if (j >= end) break;

      const prelude = cssText.slice(i, open).trim();
      const body = cssText.slice(open + 1, j);

      if (prelude.startsWith("@media")) {
        yield* walk(open + 1, j, prelude);
      } else if (prelude.startsWith("@")) {
        // Other at-rules (@keyframes, etc.) — ignore contents.
      } else if (prelude) {
        // A normal rule. Split comma-separated selectors so each is checked.
        for (const sel of prelude.split(",")) {
          yield { selector: sel.trim(), body, mediaQuery };
        }
      }

      i = j + 1;
    }
  }
  yield* walk(0, len, null);
}

function getEmbeddedCss(html) {
  const dom = new JSDOM(html);
  return [...dom.window.document.querySelectorAll("style")]
    .map((s) => s.textContent)
    .join("\n");
}

describe("header structure", () => {
  const dom = new JSDOM(HTML);
  const doc = dom.window.document;
  const header = doc.querySelector("header");

  test("a <header> element exists", () => {
    expect(header).not.toBeNull();
  });

  test.each(REQUIRED_IDS)("header contains #%s", (id) => {
    const el = doc.getElementById(id);
    expect(el).not.toBeNull();
    // The element must live *inside* the header, not somewhere else.
    expect(header.contains(el)).toBe(true);
  });

  test("header has an inline ID-free element wrapping search controls", () => {
    // Sanity-check the layout: search input lives in #search-wrap inside the
    // header. If anyone rearranges this, mobile flex grow rules silently break.
    const wrap = doc.getElementById("search-wrap");
    expect(wrap).not.toBeNull();
    expect(header.contains(wrap)).toBe(true);
    expect(wrap.querySelector("#search-input")).not.toBeNull();
  });
});

describe("header CSS is never hidden", () => {
  const css = getEmbeddedCss(HTML);
  const rules = [...iterCssRules(css)];

  // Collect protected-selector rules per (mediaQuery, selector) so the
  // failure messages clearly identify which block introduced the regression.
  const protectedRules = rules.filter((r) => PROTECTED_SELECTORS.has(r.selector));

  test("CSS parser found a non-trivial number of rules", () => {
    // Guardrail: if the parser breaks, all assertions below would pass
    // vacuously. The real file has well over a hundred rules.
    expect(rules.length).toBeGreaterThan(50);
  });

  test.each([...PROTECTED_SELECTORS])(
    "no rule hides %s (any media query)",
    (selector) => {
      const matching = protectedRules.filter((r) => r.selector === selector);
      for (const rule of matching) {
        for (const hider of HIDING_DECLARATIONS) {
          if (hider.test(rule.body)) {
            const where = rule.mediaQuery
              ? `inside ${rule.mediaQuery}`
              : "at top level";
            throw new Error(
              `Selector \`${selector}\` is hidden ${where}.\n` +
                `Matched: ${hider}\n` +
                `Rule body: ${rule.body.trim()}`
            );
          }
        }
      }
    }
  );
});
