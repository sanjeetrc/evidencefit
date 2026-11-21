// Renders public/*.svg to the PNG sizes Android Chrome needs for install.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [src, out, size] of [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['icon-maskable.svg', 'icon-maskable-512.png', 512]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>*{margin:0}</style>${fs.readFileSync('public/' + src, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await p.screenshot({ path: 'public/' + out, omitBackground: true });
  }
  await b.close();
})();
