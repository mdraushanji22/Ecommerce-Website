/* Tiny Chrome DevTools Protocol client built on Node 22's native WebSocket.
   Launches headless Chrome, serves the project over http (so localStorage
   works), and exposes navigate / evaluate / click helpers.                */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { listen } = require('./serve.js');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('devtools endpoint never became ready: ' + url);
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.currentUrl = null;
    this.loadEvents = 0;
    this.consoleErrors = [];
    this.pageErrors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      this.events.push(msg);
      if (msg.method === 'Page.loadEventFired') this.loadEvents = (this.loadEvents || 0) + 1;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(
          msg.params.args.map((a) => a.value || a.description || a.type).join(' ')
        );
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.pageErrors.push(d.exception ? d.exception.description : d.text);
      }
    });
  }

  send(method, params) {
    this.id += 1;
    const id = this.id;
    const attempt = (n) => new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 30000);
    }).catch((err) => {
      // Scripts that navigate mid-eval can detach the execution context. Wait
      // for the new document, then retry once so flows keep working.
      const transient = /navigated or closed|Cannot find context|Execution context/i.test(String(err && err.message));
      if (transient && n > 0) {
        return this.waitForLoad()
          .then(() => sleep(200))
          .then(() => attempt(n - 1));
      }
      throw err;
    });
    return attempt(2);
  }

  async navigate(url) {
    // Navigating to the URL we are already on does not create a new document,
    // which would make subsequent evaluates run against stale DOM.
    if (this.currentUrl === url) {
      await this.send('Page.reload', { ignoreCache: false });
    } else {
      await this.send('Page.navigate', { url });
    }
    this.currentUrl = url;
    await this.waitForLoad();
    // Let LUMEN.onReady handlers and any render pass settle.
    await sleep(160);
  }

  waitForLoad() {
    // Count load events so a navigation issued from JS code cannot be mistaken
    // for the document we are already sitting in.
    return new Promise((resolve) => {
      const started = Date.now();
      const target = this.loadEvents + 1;
      const poll = setInterval(() => {
        const done = this.loadEvents >= target;
        const stale = Date.now() - started > 12000;
        if (done || stale) {
          clearInterval(poll);
          // Confirm the new document is actually parsed.
          this.send('Runtime.evaluate', { expression: 'document.readyState' })
            .then(() => resolve())
            .catch(() => resolve());
        }
      }, 50);
    });
  }

  async eval(expression, options) {
    const opts = options || {};
    const run = () => this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true
    });

    let r;
    try {
      r = await run();
    } catch (err) {
      // The expression triggered a navigation, destroying its own context.
      if (/navigated or closed|Cannot find context|Execution context/i.test(String(err && err.message))) {
        if (opts.tolerateNavigation) { await this.waitForLoad(); return null; }
        throw err;
      }
      throw err;
    }

    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      const msg = d.exception ? d.exception.description : d.text;
      if (/navigated or closed|Cannot find context|Execution context/i.test(String(msg))) {
        if (opts.tolerateNavigation) { await this.waitForLoad(); return null; }
        throw new Error('expression was destroyed by a navigation: ' + msg);
      }
      // Name the document the expression ran against so failures are diagnosable.
      let where = '?';
      try {
        where = (await this.send('Runtime.evaluate', {
          expression: 'location.pathname + " ready=" + document.readyState + " title=" + document.title',
          returnByValue: true
        })).result.value;
      } catch (e) { /* context is best-effort */ }
      throw new Error('page eval failed on ' + where + '\n' + msg);
    }
    return r.result.value;
  }

  /** Poll until a selector matches, so evals never race a fresh document. */
  async waitForSelector(selector, timeout = 6000) {
    const started = Date.now();
    for (;;) {
      const r = await this.send('Runtime.evaluate', {
        expression: `!!document.querySelector(${JSON.stringify(selector)})`,
        returnByValue: true
      }).catch(() => null);
      if (r && r.result.value === true) return true;
      if (Date.now() - started > timeout) {
        throw new Error('timed out waiting for selector: ' + selector);
      }
      await sleep(50);
    }
  }

  clearErrors() {
    this.consoleErrors = [];
    this.pageErrors = [];
  }

  errors() {
    return [...this.pageErrors.map((e) => 'EXCEPTION: ' + e), ...this.consoleErrors.map((e) => 'console.error: ' + e)];
  }
}

async function launch(rootDir) {
  const exe = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('Chrome or Edge not found');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-cdp-'));
  const port = 9222 + Math.floor(Math.random() * 400);

  const child = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);

  // Open one tab and attach directly to it (no flatten/session juggling).
  const targetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await targetRes.json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const session = new Session(ws);
  await session.send('Page.enable');
  await session.send('Runtime.enable');

  const { server, port: httpPort } = await listen(rootDir);
  const base = `http://127.0.0.1:${httpPort}`;

  return {
    session,
    base,
    version,
    async close() {
      try { ws.close(); } catch (e) { /* already gone */ }
      child.kill();
      server.close();
      // Chrome flushes its profile on exit; give it a moment, then clean up
      // best-effort so a locked file never fails the run.
      await sleep(300);
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (e) { /* temp dir, harmless to leave behind */ }
    }
  };
}

module.exports = { launch, sleep };
