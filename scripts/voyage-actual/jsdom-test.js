/* §9 step 3 — jsdom smoke, driven through the real UI (no internals touched).
   Adds an at-sea stem and a boundary stem via the add-stem button + input events. */
const fs = require('fs');
const { JSDOM } = require(process.env.HOME + '/node_modules/jsdom');

const html = fs.readFileSync(process.argv[2], 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;

let fails = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + got + (ok ? '' : '  want=' + want));
}
const txt = s => { const e = d.querySelector('[data-c="' + s + '"]'); return e ? e.textContent : '(missing)'; };
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

function setField(path, value, type) {
  const el = d.querySelector('[data-p="' + path + '"]');
  if (!el) { console.log('FAIL  no input for ' + path); fails++; return; }
  el.value = value;
  fire(el, 'input');
  if (type === 'select') fire(el, 'change');
}
function addStem(i, date, port, grade, qty, price) {
  d.querySelector('[data-act="add-stem"]').click();
  setField('stems.' + i + '.date', date);
  setField('stems.' + i + '.port', port);
  setField('stems.' + i + '.grade', grade, 'select');
  setField('stems.' + i + '.qty', qty);
  setField('stems.' + i + '.price', price);
}

// --- baseline: demo voy 189 ---
check('demo sea cons leg0 VLSFO', txt('seaV0'), '53.66');
check('demo sea cons leg1 VLSFO', txt('seaV1'), '142.66');
check('demo sea cons leg2 LSMGO', txt('seaL2'), '120.68');
const led0 = d.getElementById('portStays').innerHTML;
check('ledger shows sea legs', /At sea: Tuxpan/.test(led0), 'true');
check('ledger shows port stays', /In port: Tampico/.test(led0), 'true');

// --- boundary stem: exactly on leg 0 arrival -> must go to the PORT stay ---
addStem(0, '15/02/26 12:30', 'Tampico', 'LSMGO', '50', '700');
// --- at-sea stem: mid-passage on leg 1 -> must go to the SEA leg ---
addStem(1, '21/02/26 08:00', 'At sea (STS)', 'VLSFO', '100', '600');

check('at-sea stem raises leg1 VLSFO cons to 195.87+100-53.21', txt('seaV1'), '242.66');
check('leg0 VLSFO cons unchanged', txt('seaV0'), '53.66');
check('boundary stem did NOT land at sea (leg0 LSMGO)', txt('seaL0'), '19.24');

const led = d.getElementById('portStays').innerHTML;
console.log('\n--- ledger ---');
led.split('<tr').slice(1).forEach(r =>
  console.log(r.replace(/<[^>]+>/g, '|').replace(/\|+/g, ' | ').trim()));

const totals = led.split('<tr').slice(-1)[0];
check('ledger total VLSFO cons 345.73', /345\.73/.test(totals), 'true');
check('ledger total LSMGO cons 199.86', /199\.86/.test(totals), 'true');

const flagEl = d.querySelector('#flags, [id*="flag"]');
const flagHtml = flagEl ? flagEl.innerHTML : '';
const bad = (flagHtml.match(/flag bad/g) || []).length;
console.log('\nflags:', flagHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300));
check('consistent at-sea voyage raises no bad flags', bad, 0);

// --- negative: stem outside the voyage must still flag ---
setField('stems.1.date', '01/01/26 00:00');
const flagHtml2 = (d.querySelector('#flags, [id*="flag"]') || {}).innerHTML || '';
check('stray stem still flagged', /falls outside the voyage/.test(flagHtml2), 'true');

console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all checks passed'));
process.exit(fails ? 1 : 0);
