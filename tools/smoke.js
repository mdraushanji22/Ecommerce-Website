// Smoke test: prove the CDP harness can serve, navigate and evaluate.
const path = require('path');
const { launch, sleep } = require('./cdp.js');

(async () => {
  const ctx = await launch(path.join(__dirname, '..'));
  try {
    const { session, base } = ctx;
    console.log('base       ', base);
    console.log('browser    ', ctx.version.Browser);

    await session.navigate(base + '/index.html');
    const info = await session.eval(`
      return {
        title: document.title,
        booted: document.body.classList.contains('is-booted'),
        header: !!document.querySelector('header.header'),
        footer: !!document.querySelector('footer.footer'),
        cards: document.querySelectorAll('.product-card').length,
        storage: (() => { try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return 'ok'; } catch (e) { return 'blocked: ' + e.name; } })(),
        seeds: Object.keys(localStorage).filter((k) => k.indexOf('lumen') === 0).length
      };
    `);
    console.log('page info  ', JSON.stringify(info, null, 2));
    console.log('errors     ', session.errors().length ? session.errors() : 'none');
  } finally {
    await ctx.close();
  }
})().catch((err) => { console.error('HARNESS FAILED:', err); process.exit(1); });
