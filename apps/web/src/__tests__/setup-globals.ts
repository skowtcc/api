/*
 * preload step 1: install jsdom's browser globals onto globalThis. must run
 * before @testing-library/dom is imported by anything, because that module
 * captures `document.body` at evaluation time and freezes a fallback that
 * throws on every screen.* query if document was missing at module-load
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const window = dom.window;

const browserGlobals: Record<string, unknown> = {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
};

for (const [key, value] of Object.entries(browserGlobals)) {
  (globalThis as Record<string, unknown>)[key] = value;
}
