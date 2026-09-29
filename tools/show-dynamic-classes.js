/* Show every class="..." attribute that contains a ${...} interpolation, so
   we can confirm the checker is only ignoring dynamic values. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

['app.js', 'cart.js', 'wishlist.js', 'auth.js', 'checkout.js', 'profile.js', 'admin.js', 'storefront.js', 'products.js']
  .forEach((f) => {
    const src = fs.readFileSync(path.join(root, 'js', f), 'utf8').split('\n');
    src.forEach((line, i) => {
      for (const m of line.matchAll(/class="([^"]*)"/g)) {
        if (!m[1].includes('${')) continue;
        const dynamic = m[1].split(/\s+/).filter((t) => t.includes('${'));
        const statics = m[1].split(/\s+/).filter((t) => t && !t.includes('${'));
        console.log(
          `js/${f}:${i + 1}\n  value    : ${m[1]}\n  dynamic  : ${JSON.stringify(dynamic)}\n  static   : ${JSON.stringify(statics)}`
        );
      }
    });
  });
