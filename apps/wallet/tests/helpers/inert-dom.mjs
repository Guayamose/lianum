/** Minimal inert DOM ports for actual app/event execution in Node.
 * No layout engine, browser acceptance, network, signing or native execution. */
export function inertDocument(html) {
  class Element {
    constructor(tag) { this.tagName = tag.toLowerCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.handlers = new Map(); this.parentNode = null; this.disabled = false; this.hidden = false; this.checked = false; this.open = false; this.value = ''; this.text = ''; this.className = ''; this.classList = { toggle: (name, value) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)); if (value) names.add(name); else names.delete(name); this.className = [...names].join(' '); } }; }
    set textContent(value) { this.children = []; this.text = String(value); }
    get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
    get elements() { return Object.fromEntries(this.querySelectorAll('input,select').map(n => [n.name, n])); }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); else if (key === 'class') this.className = String(value); else if (['id', 'name', 'content', 'value', 'type'].includes(key)) this[key] = String(value); else if (['disabled', 'hidden', 'checked'].includes(key)) this[key] = true; }
    append(...nodes) { for (let item of nodes) { if (typeof item === 'string') { const n = new Element('#text'); n.textContent = item; item = n; } item.parentNode = this; this.children.push(item); } }
    replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
    replaceWith(node) { const parent = this.parentNode; if (!parent) return; const i = parent.children.indexOf(this); parent.children[i] = node; node.parentNode = parent; this.parentNode = null; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
    matches(selector) { const m = /^([a-z-]+)?(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/.exec(selector); if (!m) throw Error('UNSUPPORTED_INERT_SELECTOR ' + selector); const [, tag, key, value] = m; const property = key?.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this[key] ?? this.attributes[key]; return (!tag || tag === this.tagName) && (!key || value === undefined ? !key || property !== undefined : property === value); }
    querySelectorAll(selector) { const selectors = selector.split(',').map(s => s.trim()), result = []; const visit = n => { for (const child of n.children) { if (selectors.some(s => child.matches(s))) result.push(child); visit(child); } }; visit(this); return result; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    addEventListener(type, listener) { const values = this.handlers.get(type) ?? new Set(); values.add(listener); this.handlers.set(type, values); }
    removeEventListener(type, listener) { this.handlers.get(type)?.delete(listener); }
    dispatch(type) { const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const listener of [...this.handlers.get(type) ?? []]) listener(event); return event; }
    click() { if (!this.disabled) this.dispatch('click'); }
    showModal() { this.open = true; }
    close() { if (this.open) { this.open = false; this.dispatch('close'); } }
    focus() {} scrollIntoView() {}
  }
  const document = new Element('document'), stack = [document], voidTags = new Set(['meta','link','input','br','hr','img']);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([a-z][a-z0-9-]*)\s*>|<([a-z][a-z0-9-]*)([^>]*)>|([^<]+)/gi)) {
    if (match[1]) { while (stack.length > 1 && stack.at(-1).tagName !== match[1].toLowerCase()) stack.pop(); if (stack.length > 1) stack.pop(); }
    else if (match[2]) { const n = new Element(match[2]); for (const a of match[3].matchAll(/([a-z][a-z0-9-]*)(?:="([^"]*)")?/gi)) n.setAttribute(a[1], a[2] ?? ''); stack.at(-1).append(n); if (!voidTags.has(n.tagName)) stack.push(n); }
    else if (match[4]) stack.at(-1).append(match[4]);
  }
  document.createElement = tag => new Element(tag);
  document.getElementById = id => { const visit = n => n.id === id ? n : n.children.map(visit).find(Boolean); return visit(document) ?? null; };
  return document;
}
