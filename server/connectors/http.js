// Polite HTTP client for the connectors: timeouts, per-service rate limits,
// response cache (memory + disk) and an optional robots.txt check.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isAllowed, parseRobots } from './robots.js';

export class HttpError extends Error {
  constructor(message, { status = 0, url = '', code = 'HTTP_ERROR' } = {}) {
    super(message);
    this.status = status;
    this.url = url;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpClient {
  /**
   * options:
   *   fetchImpl     fetch function (tests inject a fake)
   *   userAgent     identifies the app (Open Food Facts asks for "App/Version (contact)")
   *   cacheDir      directory for the disk cache (optional)
   *   intervals     { [rateKey]: minimum ms between requests }
   */
  constructor({ fetchImpl = globalThis.fetch, userAgent = 'Leve/1.0', cacheDir = null, intervals = {} } = {}) {
    this.fetchImpl = fetchImpl;
    this.userAgent = userAgent;
    this.cacheDir = cacheDir;
    this.intervals = intervals;
    this.memory = new Map();
    this.nextSlot = new Map();
    this.robots = new Map();
  }

  cacheKey(url, headers) {
    return createHash('sha1').update(url + JSON.stringify(headers || {})).digest('hex');
  }

  async readCache(key) {
    const hit = this.memory.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (!this.cacheDir) return undefined;
    try {
      const raw = JSON.parse(await readFile(path.join(this.cacheDir, `${key}.json`), 'utf8'));
      if (raw.expires > Date.now()) {
        this.memory.set(key, raw);
        return raw.value;
      }
    } catch {
      // no cache entry
    }
    return undefined;
  }

  async writeCache(key, value, ttlMs) {
    const entry = { expires: Date.now() + ttlMs, value };
    this.memory.set(key, entry);
    if (this.memory.size > 500) this.memory.delete(this.memory.keys().next().value);
    if (!this.cacheDir) return;
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(path.join(this.cacheDir, `${key}.json`), JSON.stringify(entry));
    } catch {
      // cache is best effort
    }
  }

  // Waits for this rate key's next free slot (requests are serialised per key).
  async throttle(rateKey) {
    const interval = this.intervals[rateKey] || 0;
    if (!interval) return;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(rateKey) || 0);
    this.nextSlot.set(rateKey, slot + interval);
    if (slot > now) await sleep(slot - now);
  }

  async robotsAllows(url) {
    const u = new URL(url);
    let entry = this.robots.get(u.origin);
    if (!entry || entry.expires < Date.now()) {
      let groups = [];
      try {
        const res = await this.fetchImpl(`${u.origin}/robots.txt`, {
          headers: { 'user-agent': this.userAgent },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) groups = parseRobots(await res.text());
      } catch {
        groups = [];
      }
      entry = { groups, expires: Date.now() + 24 * 3600 * 1000 };
      this.robots.set(u.origin, entry);
    }
    return isAllowed(entry.groups, this.userAgent, u.pathname + u.search);
  }

  /**
   * GET a URL. options: { as: 'json'|'text', headers, timeoutMs, cacheTtlMs, rateKey, respectRobots }
   */
  async get(url, { as = 'json', headers = {}, timeoutMs = 15000, cacheTtlMs = 0, rateKey = null, respectRobots = false } = {}) {
    const key = cacheTtlMs ? this.cacheKey(url, headers) : null;
    if (key) {
      const cached = await this.readCache(key);
      if (cached !== undefined) return cached;
    }
    if (respectRobots && !(await this.robotsAllows(url))) {
      throw new HttpError(`robots.txt of ${new URL(url).host} does not allow ${new URL(url).pathname}`, { url, code: 'ROBOTS' });
    }
    if (rateKey) await this.throttle(rateKey);
    let res;
    try {
      res = await this.fetchImpl(url, {
        headers: { 'user-agent': this.userAgent, accept: as === 'json' ? 'application/json' : 'text/html,*/*', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new HttpError(`Could not reach ${new URL(url).host}: ${err.message}`, { url, code: 'NETWORK' });
    }
    if (!res.ok) {
      let detail = '';
      try {
        // A short plain-text reason; an HTML error page says nothing useful here.
        const body = await res.text();
        if (!/^\s*</.test(body)) detail = body.replace(/\s+/g, ' ').trim().slice(0, 200);
      } catch {
        // ignore
      }
      throw new HttpError(`${new URL(url).host} answered ${res.status}${detail ? `: ${detail}` : ''}`, { status: res.status, url });
    }
    const value = as === 'json' ? await res.json() : await res.text();
    if (key) await this.writeCache(key, value, cacheTtlMs);
    return value;
  }

  // Binary download (product photos). Returns { buffer, contentType }.
  async getBuffer(url, { headers = {}, timeoutMs = 20000, rateKey = null, maxBytes = 5 * 1024 * 1024 } = {}) {
    if (rateKey) await this.throttle(rateKey);
    let res;
    try {
      res = await this.fetchImpl(url, {
        headers: { 'user-agent': this.userAgent, accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new HttpError(`Could not reach ${new URL(url).host}: ${err.message}`, { url, code: 'NETWORK' });
    }
    if (!res.ok) throw new HttpError(`${new URL(url).host} answered ${res.status}`, { status: res.status, url });
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) throw new HttpError(`File too large (${buffer.length} bytes)`, { url, code: 'TOO_LARGE' });
    return { buffer, contentType: (res.headers.get('content-type') || '').split(';')[0].trim() };
  }

  // Non-GET request (no cache). Returns { status, body }.
  async send(method, url, { body, headers = {}, timeoutMs = 20000, rateKey = null } = {}) {
    if (rateKey) await this.throttle(rateKey);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: { 'user-agent': this.userAgent, 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new HttpError(`Could not reach ${new URL(url).host}: ${err.message}`, { url, code: 'NETWORK' });
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }
}
