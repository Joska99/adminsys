/* Minimal fake DOM so the real ES render modules can run under plain node
   (no jsdom, no browser). Captures innerHTML per element id so tests can
   assert what each render function produced. */

class El {
  constructor() {
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {}, background: "" };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild() {}
  click() {}
}

const els = {};
function byId(id) {
  return (els[id] ||= new El());
}

globalThis.__els = els;
globalThis.document = {
  getElementById: byId,
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  createElement() { return new El(); },
};

export { els };
