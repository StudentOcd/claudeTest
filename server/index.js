// Leve server: serves the web app and the JSON API, stores data in data/leve.json.
//
//   npm start                                   -> http://localhost:3000 (this computer only)
//   HOST=0.0.0.0 APP_PASSWORD=secret npm start  -> reachable from your phone on the same Wi-Fi

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { JsonDb } from './db.js';
import { HttpClient } from './connectors/http.js';
import { ApiError, registerRoutes } from './api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler });
  };
  return {
    get: add('GET'),
    put: add('PUT'),
    post: add('POST'),
    delete: add('DELETE'),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      }
      return null;
    },
  };
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(data);
}

async function readBody(req, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'Request too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }
}

function checkAuth(req, password) {
  if (!password) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const expected = Buffer.from(password);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const IMG_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };

// Product photos saved by the crawler (your data folder first, then the ones shipped with the app).
async function serveProductImage(res, name, dirs) {
  if (!/^[a-z]+-[A-Za-z0-9_-]+\.(jpg|png|webp|avif|gif)$/.test(name)) return false;
  for (const dir of dirs) {
    const file = path.join(dir, name);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': IMG_TYPES[path.extname(name)], 'cache-control': 'public, max-age=604800' });
      res.end(data);
      return true;
    } catch {
      // try the next folder
    }
  }
  return false;
}

async function serveStatic(res, pathname) {
  let file;
  if (pathname.startsWith('/core/')) file = path.join(ROOT, 'src', pathname);
  else file = path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname);
  const base = pathname.startsWith('/core/') ? path.join(ROOT, 'src', 'core') : path.join(ROOT, 'public');
  const resolved = path.resolve(file);
  if (!resolved.startsWith(base + path.sep) && resolved !== path.join(base, 'index.html')) return false;
  try {
    const info = await stat(resolved);
    if (!info.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(resolved);
  const noCache = ext === '.html' || resolved.endsWith('sw.js');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': noCache ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  res.end(await readFile(resolved));
  return true;
}

export async function startServer({
  port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1',
  dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'),
  password = process.env.APP_PASSWORD || '',
  fetchImpl = globalThis.fetch,
  quiet = false,
  intervals = {},
  // Fetch products and photos in the background when none are downloaded yet.
  autoCrawl = process.env.LEVE_AUTO_CRAWL !== '0',
} = {}) {
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!loopback && !password && process.env.ALLOW_NO_PASSWORD !== '1') {
    throw new Error(
      `Refusing to listen on ${host} without a password. Start with APP_PASSWORD=choose-one (or ALLOW_NO_PASSWORD=1 if your network is trusted).`,
    );
  }

  const db = new JsonDb(dataDir);
  await db.load();

  const contact = () => db.state.settings.contactEmail || 'personal use';
  const http = new HttpClient({
    fetchImpl,
    cacheDir: path.join(dataDir, 'cache'),
    userAgent: `Mozilla/5.0 (compatible; Leve/1.0; ${contact()})`,
    intervals: {
      hevy: 300,
      'off-product': 4200,
      'off-search': 6500,
      openprices: 1000,
      'store-auchan': 2000,
      'store-pingodoce': 2000,
      mercadona: 700,
      'img-auchan': 300,
      'img-pingodoce': 300,
      'img-mercadona': 200,
      ...intervals,
    },
  });

  const router = createRouter();
  const productsDir = path.join(dataDir, 'products');
  const bundledProductsDir = path.join(ROOT, 'public', 'products');
  const routes = registerRoutes(router, { db, http, productsDir, bundledProductsDir });

  const server = createServer(async (req, res) => {
    try {
      if (!checkAuth(req, password)) {
        send(res, 401, 'Password required', { 'www-authenticate': 'Basic realm="Leve", charset="UTF-8"' });
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const route = router.match(req.method, url.pathname);
        if (!route) throw new ApiError(404, 'Not found');
        let body = {};
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          // JSON only: blocks cross-site form posts from other web pages.
          if (!String(req.headers['content-type'] || '').includes('application/json')) throw new ApiError(415, 'Send JSON');
          body = await readBody(req);
        }
        http.userAgent = `Mozilla/5.0 (compatible; Leve/1.0; ${contact()})`;
        const result = await route.handler({ params: route.params, query: Object.fromEntries(url.searchParams), body });
        send(res, 200, result ?? { ok: true });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'Method not allowed');
      if (url.pathname.startsWith('/product-img/')) {
        const dirs = [path.join(productsDir, 'img'), path.join(bundledProductsDir, 'img')];
        if (await serveProductImage(res, url.pathname.slice('/product-img/'.length), dirs)) return;
        send(res, 404, 'No photo');
        return;
      }
      if (await serveStatic(res, url.pathname)) return;
      // SPA fallback
      if (await serveStatic(res, '/')) return;
      send(res, 404, 'Not found');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Something went wrong on the server' : err.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (!quiet) {
    console.log(`\nLeve is running: http://localhost:${address.port}`);
    if (!loopback) {
      for (const list of Object.values(networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On your phone (same Wi-Fi): http://${a.address}:${address.port}`);
      }
    }
    console.log(`  Data file: ${db.file}\n`);
  }

  if (autoCrawl && routes.liveLookups()) {
    const catalog = await routes.catalog();
    const have = Object.values(catalog.products).some((p) => p.image);
    const ageDays = catalog.updatedAt ? (Date.now() - Date.parse(catalog.updatedAt)) / 86400000 : Infinity;
    if (!have || ageDays > 7) {
      const { jobId } = routes.startCrawl();
      if (!quiet) {
        console.log(`  ${have ? `Store data is ${Math.round(ageDays)} days old: refreshing prices` : 'No product photos yet: fetching products'} from the stores in the background (job ${jobId.slice(0, 8)}).\n`);
      }
    }
  }

  const close = async () => {
    await db.flush();
    await new Promise((r) => server.close(r));
  };
  return { server, db, port: address.port, close };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer()
    .then(({ close }) => {
      const stop = () => close().then(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
