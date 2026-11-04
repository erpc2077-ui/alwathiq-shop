/* الوثيق: عامل الخدمة (كاشينغ). ارفع رقم VERSION عند كل تحديث كبير. */
const VERSION = "v2";
const SHELL = "shell-" + VERSION, STATIC = "static-" + VERSION, IMG = "img-" + VERSION;
const IMG_MAX = 150;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["./", "./manifest.webmanifest"]).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()).catch(() => {})
    .then(() => caches.keys())
    .then((ks) => Promise.all(ks.filter((k) => ![SHELL, STATIC, IMG].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name), ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

/* الصفحة: الشبكة أولاً (تحديثات فورية) ثم النسخة المخزّنة عند ضعف/انقطاع الاتصال */
async function page(req, pre) {
  try {
    const r = (pre && (await pre)) || (await fetch(req));
    if (r && r.ok) (await caches.open(SHELL)).put("./", r.clone());
    return r;
  } catch (e) {
    return (await caches.match("./")) || Response.error();
  }
}

/* الخطوط والمكتبات: من الكاش فوراً وتُحدَّث بالخلفية */
async function swr(req) {
  const c = await caches.open(STATIC), hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}

/* الصور: تُحمَّل مرة واحدة فقط ثم تُقدَّم من الكاش (أسماء الملفات ثابتة لا تتغير) */
async function img(req) {
  const c = await caches.open(IMG), hit = await c.match(req.url);
  if (hit) return hit;
  try {
    let r;
    try { r = await fetch(req.url, { mode: "cors", credentials: "omit" }); } catch (e) { r = await fetch(req); }
    if (r && (r.ok || r.type === "opaque")) { c.put(req.url, r.clone()); trim(IMG, IMG_MAX); }
    return r;
  } catch (e) { return Response.error(); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  /* بيانات Supabase (المخزون، الطلبات، الدخول): دائماً من الشبكة بلا كاش */
  if (u.hostname.endsWith(".supabase.co") && !u.pathname.startsWith("/storage/v1/object/public/")) return;
  if (u.hostname.endsWith(".supabase.co")) return void e.respondWith(img(req));
  if (req.mode === "navigate") return void e.respondWith(page(req, e.preloadResponse));
  if (u.origin === location.origin && u.pathname.endsWith("/sw.js")) return;
  if (req.destination === "image") return void e.respondWith(img(req));
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(u.hostname) || u.origin === location.origin)
    return void e.respondWith(swr(req));
});
