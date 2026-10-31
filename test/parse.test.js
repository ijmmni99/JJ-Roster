// Node test: parse the sample roster PDFs and assert known output.
// Run: npm test
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const _warn = console.warn, _log = console.log;
console.warn = console.log = (...a) => { if (!/polyfill/.test(String(a[0]))) _log(...a); };
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _warn; console.log = _log;
const { parseDocument, findPerson } = require('../js/parser.js');

const FIX = path.join(__dirname, 'fixtures');

async function parseFile(name) {
  const data = new Uint8Array(fs.readFileSync(path.join(FIX, name)));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  return parseDocument(doc, { fallbackYear: 2026 });
}

function check(result, profile, startDay, codes, notes) {
  const p = findPerson(result, profile);
  assert.ok(p, `person ${profile.id} not found`);
  codes.forEach((code, i) => {
    const day = startDay + i;
    const iso = `2026-11-${String(day).padStart(2, '0')}`;
    const s = p.shifts[iso] || { code: '', note: '' };
    assert.strictEqual(s.code, code, `${profile.id} ${iso} code: got "${s.code}", want "${code}"`);
    const wantNote = notes[day] || '';
    assert.strictEqual(s.note, wantNote, `${profile.id} ${iso} note: got "${s.note}", want "${wantNote}"`);
  });
  return p;
}

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); }
  catch (e) { failed++; console.log('  ✘ ' + name + '\n    ' + e.message); }
}

(async () => {
  const need = ['Roster_November_1.pdf', 'Roster_November_2.pdf'];
  const missing = need.filter(f => !fs.existsSync(path.join(FIX, f)));
  if (missing.length) {
    console.log('Skipping parser tests: put ' + missing.join(', ') + ' in test/fixtures/ (kept out of git for privacy).');
    process.exit(0);
  }
  const r1 = await parseFile('Roster_November_1.pdf');
  const r2 = await parseFile('Roster_November_2.pdf');
  const najihah = { id: 'S001702', name: 'Nur Najihah binti Kamaruddin' };

  console.log('My Roster parser tests');

  await test('roster detection + title', () => {
    assert.ok(r1.isRoster && r2.isRoster);
    assert.strictEqual(r1.title, 'NOV 2026');
    assert.strictEqual(r1.dates[0], '2026-11-01');
    assert.strictEqual(r1.dates[r1.dates.length - 1], '2026-11-15');
    assert.strictEqual(r2.dates[0], '2026-11-16');
    assert.strictEqual(r2.dates[r2.dates.length - 1], '2026-11-30');
  });

  await test('all staff found with names (PDF 1)', () => {
    assert.ok(r1.persons.length > 30, 'persons: ' + r1.persons.length);
    r1.persons.forEach(p => assert.ok(p.name.length > 3, `empty name for ${p.id}`));
    assert.ok(r1.persons.some(p => p.page === 2), 'page-2 staff (PCA) found');
  });

  await test('Najihah 1–15 Nov', () => {
    const p = check(r1, najihah, 1,
      ['AL', 'D', 'D', 'E', 'M', 'RD', 'AL', 'N', 'N', 'N', 'NO', 'RD', 'M', 'M', 'M'],
      { 2: 'PRECEP', 3: 'PRECEP', 5: '2-7', 9: '7-9', 10: '7-9', 13: '2-7' });
    assert.strictEqual(p.name, 'NUR NAJIHAH BINTI KAMARUDDIN');
  });

  await test('Najihah 16–30 Nov', () => {
    check(r2, najihah, 16,
      ['N', 'N', 'NO', 'D', 'M', 'M', 'RD', 'N', 'N', 'N', 'NO', 'RD', 'E', 'M', 'M'],
      { 16: '7-9', 19: 'ST', 21: '2-7', 25: '7-9', 30: '2-7' });
  });

  await test('name fallback lookup (wrong ID)', () => {
    const p = findPerson(r2, { id: 'S999999', name: 'nur najihah binti kamaruddin' });
    assert.ok(p && p.id === 'S001702');
  });

  // Spot checks, verified against the PDFs rendered as images.
  const SPOT = path.join(__dirname, 'spotcheck.json');
  if (fs.existsSync(SPOT)) {
    const spots = JSON.parse(fs.readFileSync(SPOT, 'utf8'));
    for (const s of spots) {
      await test(`spot-check ${s.name} (${s.file})`, () => {
        const r = s.file.endsWith('1.pdf') ? r1 : r2;
        check(r, { id: s.id, name: s.name }, s.startDay, s.codes, s.notes);
      });
    }
  }

  if (process.argv.includes('--dump')) {
    const id = process.argv[process.argv.indexOf('--dump') + 1];
    for (const r of [r1, r2]) {
      const p = id ? findPerson(r, { id, name: id }) : null;
      if (p) console.log(JSON.stringify(p, null, 1));
      else r.persons.forEach(p => console.log(p.page, p.id, p.name, '|', p.position));
    }
  }

  console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
