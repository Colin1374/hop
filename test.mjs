// Test harness: load index.html script in a vm sandbox with stub DOM,
// then exercise parse() + resolveTco() with stubbed oembed responses.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error("no script block found");
const code = m[1];

// ---- stubs ----
const elements = {};
function fakeEl(id) {
  return {
    id, value: "", checked: false, disabled: false, textContent: "",
    _html: "", children: [],
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set className(v) { this._c = v; }, get className() { return this._c; },
    addEventListener() {}, appendChild(c) { this.children.push(c); },
  };
}
["in", "results", "openAll", "auto", "clear", "hist"].forEach((id) => {
  elements[id] = fakeEl(id);
});
const store = {};
const sandbox = {
  console,
  document: {
    getElementById: (id) => elements[id] || fakeEl(id),
    createElement: () => fakeEl(),
  },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  navigator: {},
  setTimeout: (fn) => { fn(); },  // run immediately for test determinism
  clearTimeout() {},
  location: { href: "" },
  fetch: () => Promise.reject(new Error("no network in test")),
};
sandbox.window = { open: () => ({}) };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, "\n  got:", a, "\n  want:", e); }
}
async function flush() { // drain vm/host promise chains
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

// ---- tests ----
const P = sandbox.parse;

// 1. plain tweet link, x.com, tracking param stripped
let r = P("https://x.com/elonmusk/status/1234567890?s=20");
eq(r.map((i) => [i.kind, i.dest]),
   [["tweet", "https://nitter.click/elonmusk/status/1234567890"]],
   "x.com tweet, tracking param stripped, no phantom profile card");

// 2. twitter.com variant + /statuses/ normalized
r = P("https://twitter.com/jack/statuses/20");
eq(r.map((i) => [i.kind, i.dest]),
   [["tweet", "https://nitter.click/jack/status/20"]],
   "twitter.com /statuses/ normalized");

// 3. messy message: profile link + bare @mention + pending t.co (order matters)
r = P("check https://t.co/AbC123 lol and https://x.com/jack and also @naval said");
eq(r.map((i) => [i.kind, i.label]),
   [["profile", "@jack"], ["pending", "resolving t.co…"], ["profile", "@naval"]],
   "message: profile url, pending t.co, bare @mention");
eq(r[0].dest, "https://nitter.click/jack", "profile link dest");
eq(r[2].dest, "https://nitter.click/naval", "bare mention dest");

// 4. email must NOT match as @handle
r = P("mail me at bob@example.com ok");
eq(r.length, 0, "email not treated as @handle");

// 5. xcancel input → idempotent host swap
r = P("https://nitter.click/elonmusk/status/999");
eq(r.map((i) => [i.kind, i.dest]),
   [["tweet", "https://nitter.click/elonmusk/status/999"]],
   "xcancel input stays xcancel");

// 6. reserved path skipped, /i/web/status/ converted
r = P("https://x.com/search?q=hi https://x.com/i/web/status/999");
eq(r.map((i) => [i.kind, i.dest]),
   [["tweet", "https://nitter.click/i/web/status/999"]],
   "search ignored, i/web link converted");

// 7. tweet path suffixes preserved
r = P("https://x.com/jack/status/20/photo/1 https://twitter.com/a/photo/1");
eq(r.map((i) => i.dest),
   ["https://nitter.click/jack/status/20/photo/1", "https://nitter.click/a/photo/1"],
   "photo suffix paths kept");

// 8. exact duplicate link deduped
r = P("https://x.com/a/status/1 https://x.com/a/status/1");
eq(r.length, 1, "duplicate links deduped");

// 9. query on tweet → canonicalized away (params on tweets are tracking noise)
r = P("https://x.com/jack/status/123?p=1");
eq(r.map((i) => [i.kind, i.dest]),
   [["tweet", "https://nitter.click/jack/status/123"]],
   "tweet query dropped, single card");

// 10. trailing punctuation glued to profile url
r = P("see https://x.com/jack. nice");
eq(r.map((i) => [i.kind, i.dest]),
   [["profile", "https://nitter.click/jack"]],
   "trailing period stripped from profile url");

// 11. parenthesized mention counts
r = P("wow (@jack) posted");
eq(r.map((i) => [i.kind, i.dest]),
   [["profile", "https://nitter.click/jack"]],
   "(@handle) in parens detected");

// 12. t.co resolution via stubbed oembed (happy path)
sandbox.fetch = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ url: "https://x.com/elonmusk/status/1234567890" }),
});
const item = { kind: "pending", label: "", dest: null, original: "https://t.co/xyz", done: false };
sandbox.resolveTco("https://t.co/xyz", item);
await flush();
eq([item.kind, item.dest],
   ["tweet", "https://nitter.click/elonmusk/status/1234567890"],
   "t.co resolved via oembed to xcancel tweet");

// 13. t.co pointing off-platform
sandbox.fetch = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ url: "https://example.com/page" }),
});
const item2 = { kind: "pending", label: "", dest: null, original: "https://t.co/off", done: false };
sandbox.resolveTco("https://t.co/off", item2);
await flush();
eq([item2.kind, item2.dest], ["fail", null], "t.co to non-post → fail card, no dest");

// 14. oembed http error
sandbox.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
const item3 = { kind: "pending", label: "", dest: null, original: "https://t.co/err", done: false };
sandbox.resolveTco("https://t.co/err", item3);
await flush();
eq(item3.kind, "fail", "oembed error → fail card");

// 15. XSS attempt through handle/label text is escaped by esc()
const evil = '<img src=x onerror=alert(1)>"&';
eq(sandbox.esc(evil),
   '&lt;img src=x onerror=alert(1)&gt;&quot;&amp;',
   "esc() neutralizes markup in untrusted strings");

// 18. popup blocked on mobile → same-tab navigation fallback
sandbox.window.open = () => null;
sandbox.location.href = "";
const it18 = { kind: "tweet", label: "x", dest: "https://nitter.click/jack/status/1", original: "https://x.com/jack/status/1" };
sandbox.openDest(it18);
eq(sandbox.location.href, "https://nitter.click/jack/status/1", "popup blocked → navigates in same tab");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
