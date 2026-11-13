const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 1200 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + (process.env.PORT || 8766) + '/index.html'); await p.waitForTimeout(800);
  const bases = process.argv[2].split(','), nats = process.argv[3].split(',');
  await p.evaluate(([bases, nats]) => {
    closeModal();
    const SC = 2.2, CW = 56, CH = 44;
    const cv = document.createElement('canvas');
    cv.width = (bases.length * CW + 40) * SC; cv.height = (nats.length * CH + 20) * SC;
    cv.id = 'sheet'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#3c4a32';
    document.body.appendChild(cv);
    const c = cv.getContext('2d'); c.scale(SC, SC);
    c.fillStyle = '#3c4a32'; c.fillRect(0, 0, cv.width, cv.height);
    nats.forEach((nid, r) => {
      applyNations([nid, nid === 'CN' ? 'TW' : 'CN']);
      c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText(nid, 2, r * CH + 26);
      bases.forEach((bse, i) => {
        const k = bse + '_0';
        if (!UNITS[k]) return;
        drawCounter(c, 40 + i * CW + 24, r * CH + 22, k, 0, { label: false });
      });
    });
    nats.forEach(() => {});
    c.fillStyle = '#fff'; c.font = '9px sans-serif';
    bases.forEach((bse, i) => c.fillText(bse, 40 + i * CW + 8, nats.length * CH + 14));
  }, [bases, nats]);
  await (await p.$('#sheet')).screenshot({ path: (process.argv[4] || __dirname + '/sheet.png') });
  console.log(errs.length ? errs : 'no errors');
  await b.close();
})();
