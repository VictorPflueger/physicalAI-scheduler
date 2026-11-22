// A small stand-in for the browser's DOM: enough for js/dom.js's h() and the presenter's views
// (js/view.js renderStory, js/diagram.js), so every state of the page can be drawn in Node and read
// back as HTML. Text is escaped as the browser would serialise it.

const escapeText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeText(s).replace(/"/g, "&quot;");
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

class FakeText {
  constructor(text) { this.nodeType = 3; this.data = String(text); }
  get textContent() { return this.data; }
  get outerHTML() { return escapeText(this.data); }
}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    this.childNodes = [];
    this.dataset = {};
    this.attrs = {};
    this.className = "";
    this.hidden = false;
    this.open = false;
    const el = this;
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = {
      add: (...c) => { const s = new Set(el.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); el.className = [...s].join(" "); },
      remove: (...c) => { el.className = el.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(" "); },
      toggle: (c, on) => { const has = el.classList.contains(c); const want = on === undefined ? !has : !!on; if (want) el.classList.add(c); else el.classList.remove(c); return want; },
      contains: (c) => el.className.split(/\s+/).includes(c)
    };
  }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  append(...kids) { for (const k of kids) if (k !== null && k !== undefined) this.childNodes.push(k.nodeType ? k : new FakeText(k)); }
  appendChild(k) { this.append(k); return k; }
  prepend(...kids) { const old = this.childNodes; this.childNodes = []; this.append(...kids); this.childNodes.push(...old); }
  replaceChildren(...kids) { this.childNodes = []; this.append(...kids); }
  insertBefore(node, ref) {
    const at = this.childNodes.indexOf(node);
    if (at >= 0) this.childNodes.splice(at, 1);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node);
    return node;
  }
  removeChild(node) { const i = this.childNodes.indexOf(node); if (i >= 0) this.childNodes.splice(i, 1); return node; }
  remove() {}
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  toggleAttribute(k, on) { const want = on === undefined ? !(k in this.attrs) : !!on; if (want) this.attrs[k] = ""; else delete this.attrs[k]; return want; }
  addEventListener() {}
  removeEventListener() {}
  contains() { return false; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  animate() { return { finished: Promise.resolve(), cancel() {} }; }
  focus() {}
  set textContent(v) { this.childNodes = v === "" || v === null || v === undefined ? [] : [new FakeText(v)]; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  get innerHTML() { return this.childNodes.map((c) => c.outerHTML).join(""); }
  get outerHTML() {
    const attrs = { ...this.attrs };
    if (this.className) attrs.class = this.className;
    for (const [k, v] of Object.entries(this.dataset)) attrs[`data-${kebab(k)}`] = v;
    if (this.hidden) attrs.hidden = "";
    if (this.open) attrs.open = "";
    const a = Object.entries(attrs).map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join("");
    return `<${this.localName}${a}>${this.innerHTML}</${this.localName}>`;
  }
}

/**
 * Installs the stand-in as globalThis.document. Elements asked for by id are created on first use and
 * kept, as the page's own elements are. Returns { byId(id) }.
 */
export function installFakeDom() {
  const ids = new Map();
  const byId = (id) => {
    if (!ids.has(id)) { const e = new FakeElement("div"); e.attrs.id = id; ids.set(id, e); }
    return ids.get(id);
  };
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    getElementById: byId,
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
    documentElement: new FakeElement("html")
  };
  return { byId };
}
