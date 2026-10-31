/* My Roster – app logic. All data stays in localStorage on this device. */
(function () {
  'use strict';

  var KEY = 'myroster.v1';
  var APP_VERSION = '1.5';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var Codes = window.ShiftCodes;
  var Parser = window.RosterParser;

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Storage ----------
  function emptyState() {
    return { profile: null, shifts: {}, lastPersons: null, settings: { theme: 'auto', icsOff: false } };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        var e = emptyState();
        return { profile: s.profile || null, shifts: s.shifts || {}, lastPersons: s.lastPersons || null, settings: Object.assign(e.settings, s.settings || {}) };
      }
    } catch (err) { /* ignore */ }
    return emptyState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { toast('Could not save on this device (storage full or blocked).', true); }
  }

  var state = load();
  var view = initialMonth();

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayIso() { var t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }
  function parseIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function initialMonth() {
    var t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  }

  function monthKeys() {
    var seen = {};
    Object.keys(state.shifts).forEach(function (k) { seen[k.slice(0, 7)] = 1; });
    return Object.keys(seen).sort();
  }

  // ---------- Theme ----------
  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  // ---------- UI helpers ----------
  var toastTimer;
  function toast(msg, isError) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, isError ? 7000 : 3500);
  }
  function busy(on, text) {
    $('busy').hidden = !on;
    if (text) $('busyText').textContent = text;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s@/(.-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\b(Binti|Bin|A\/P|A\/L)\b/g, function (w) { return w.toLowerCase(); });
  }

  // ---------- Rendering ----------
  function render() {
    applyTheme();
    var hasProfile = !!state.profile;
    $('who').textContent = hasProfile ? titleCase(state.profile.name) + ' · ' + state.profile.id : 'No roster yet';
    var hasAny = Object.keys(state.shifts).length > 0;
    $('empty').hidden = hasAny;
    $('calendarView').hidden = !hasAny;
    if (!hasAny) return;
    renderMonth();
  }

  function monthShifts(y, m) {
    var prefix = y + '-' + pad(m + 1) + '-';
    var out = {};
    Object.keys(state.shifts).forEach(function (k) { if (k.indexOf(prefix) === 0) out[k] = state.shifts[k]; });
    return out;
  }

  function renderMonth() {
    var y = view.y, m = view.m;
    $('monthTitle').textContent = MONTHS[m] + ' ' + y;
    var grid = $('grid');
    grid.textContent = '';
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var today = todayIso();
    var ms = monthShifts(y, m);

    for (var b = 0; b < first; b++) grid.appendChild(el('div', 'day blank'));
    for (var d = 1; d <= days; d++) {
      var key = iso(y, m, d);
      var s = ms[key];
      var btn = el('button', 'day');
      btn.type = 'button';
      btn.dataset.date = key;
      btn.appendChild(el('span', 'dn', String(d)));
      var label = DOW[new Date(y, m, d).getDay()] + ' ' + d + ' ' + MONTHS[m];
      if (s && s.code) {
        var inf = Codes.info(s.code);
        var c = Codes.colours(inf.cat);
        btn.classList.add('has');
        btn.style.background = c.bg;
        btn.style.color = c.fg;
        btn.appendChild(el('span', 'code' + (s.code.length > 5 ? ' xlong' : s.code.length > 3 ? ' long' : ''), s.code));
        btn.appendChild(el('span', 'note', s.note || ''));
        label += ': ' + inf.name + (s.note ? ', note ' + s.note : '');
      } else {
        btn.appendChild(el('span', 'code', ''));
        btn.appendChild(el('span', 'note', s && s.note ? s.note : ''));
        label += ': no shift';
      }
      if (s && s.edited) btn.classList.add('edited');
      if (key === today) btn.classList.add('today');
      btn.setAttribute('aria-label', label);
      grid.appendChild(btn);
    }

    var keys = Object.keys(ms);
    $('noData').hidden = keys.length > 0;
    renderSummary(ms);
  }

  function summarise(ms) {
    var counts = { m: 0, e: 0, n: 0, rd: 0, no: 0, al: 0 };
    var used = {};
    Object.keys(ms).sort().forEach(function (k) {
      var code = ms[k].code;
      if (!code) return;
      var inf = Codes.info(code);
      if (counts[inf.cat] != null) counts[inf.cat]++;
      if (!used[inf.code]) used[inf.code] = inf;
    });
    var order = ['m', 'e', 'n', 'dbl', 'no', 'rd', 'al', 'd', 'ph', 'unk'];
    var legend = Object.keys(used).map(function (k) { return used[k]; })
      .sort(function (a, b) { return order.indexOf(a.cat) - order.indexOf(b.cat) || a.code.localeCompare(b.code); });
    return {
      counts: [
        ['Mornings', counts.m], ['Evenings', counts.e], ['Nights', counts.n],
        ['Rest days', counts.rd], ['Night offs', counts.no], ['Leave', counts.al]
      ],
      legend: legend
    };
  }

  function renderSummary(ms) {
    var sum = summarise(ms);
    var counts = $('counts');
    counts.textContent = '';
    sum.counts.forEach(function (c) {
      var d = el('div', 'count');
      d.appendChild(el('b', null, String(c[1])));
      d.appendChild(el('span', null, c[0]));
      counts.appendChild(d);
    });
    var legend = $('legend');
    legend.textContent = '';
    if (!sum.legend.length) legend.appendChild(el('span', 'fine', 'No shifts this month.'));
    sum.legend.forEach(function (inf) {
      var item = el('div', 'item');
      var chip = el('span', 'chip', inf.code);
      var c = Codes.colours(inf.cat);
      chip.style.background = c.bg; chip.style.color = c.fg;
      item.appendChild(chip);
      item.appendChild(el('span', null, inf.name));
      legend.appendChild(item);
    });
  }

  // ---------- Day detail ----------
  var QUICK_CODES = ['M', 'E', 'N', 'NO', '7-7M', '7-7N', 'DOUBLE', 'RD', 'ORD', 'AL', 'MC', 'EL', 'MRL', 'D', 'DD', 'TRAINING', 'PH', 'RPH', 'GPH'];

  function openDay(key) {
    var d = parseIso(key);
    $('dayTitle').textContent = DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    showDayView(key);
    $('dayDlg').showModal();
  }

  function showDayView(key) {
    $('dayDlg').classList.remove('editing');
    var s = state.shifts[key];
    var body = $('dayBody');
    body.textContent = '';
    var hero = el('div', 'day-hero');
    if (s && s.code) {
      var inf = Codes.info(s.code);
      var c = Codes.colours(inf.cat);
      var big = el('div', 'big' + (s.code.length > 3 ? ' long' : ''), s.code);
      big.style.background = c.bg; big.style.color = c.fg;
      hero.appendChild(big);
      var t = el('div');
      t.appendChild(el('div', 'meaning', inf.name));
      t.appendChild(el('div', 'sub', (Codes.isOff(s.code) ? 'Not a working day' : 'Working day') + (s.edited ? ' · edited by you' : '')));
      hero.appendChild(t);
    } else {
      hero.appendChild(el('div', 'meaning', 'No shift saved for this day.'));
    }
    body.appendChild(hero);
    if (s && s.note) {
      var nb = el('div', 'note-box');
      nb.appendChild(el('div', 'label', 'Note'));
      nb.appendChild(el('div', 'val', s.note));
      body.appendChild(nb);
    }
    var edit = el('button', 'btn', s && s.code ? 'Edit this day' : 'Add a shift');
    edit.type = 'button';
    edit.addEventListener('click', function () { showDayEdit(key); });
    body.appendChild(edit);
  }

  function showDayEdit(key) {
    $('dayDlg').classList.add('editing');
    var s = state.shifts[key] || { code: '', note: '' };
    var body = $('dayBody');
    body.textContent = '';

    var codeLbl = el('label', 'field-label', 'Shift code');
    codeLbl.htmlFor = 'editCode';
    body.appendChild(codeLbl);
    var chips = el('div', 'quick-codes');
    var codeIn = el('input', 'text-in');
    codeIn.id = 'editCode'; codeIn.value = s.code || ''; codeIn.autocomplete = 'off';
    codeIn.setAttribute('autocapitalize', 'characters'); codeIn.placeholder = 'e.g. M, N, RD, 7-3.30';
    function syncChips() {
      Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle('on', b.dataset.code === codeIn.value.trim().toUpperCase()); });
    }
    QUICK_CODES.forEach(function (code) {
      var c = Codes.colours(Codes.info(code).cat);
      var b = el('button', 'chip pick' + (code.length > 3 ? ' long' : ''), code);
      b.type = 'button'; b.dataset.code = code;
      b.style.background = c.bg; b.style.color = c.fg;
      b.addEventListener('click', function () { codeIn.value = code; syncChips(); });
      chips.appendChild(b);
    });
    codeIn.addEventListener('input', syncChips);
    body.appendChild(chips);
    body.appendChild(codeIn);

    var noteLbl = el('label', 'field-label', 'Note (optional)');
    noteLbl.htmlFor = 'editNote';
    body.appendChild(noteLbl);
    var noteIn = el('input', 'text-in');
    noteIn.id = 'editNote'; noteIn.value = s.note || ''; noteIn.autocomplete = 'off'; noteIn.placeholder = 'e.g. 7-9, PRECEP';
    body.appendChild(noteIn);
    syncChips();

    // Enter key saves instead of closing the dialog.
    [codeIn, noteIn].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    });

    var row = el('div', 'edit-actions');
    var cancel = el('button', 'btn', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', function () { showDayView(key); });
    var saveBtn = el('button', 'btn primary', 'Save'); saveBtn.type = 'button';
    saveBtn.addEventListener('click', doSave);
    row.appendChild(cancel); row.appendChild(saveBtn);
    body.appendChild(row);

    if (state.shifts[key]) {
      var clear = el('button', 'btn danger', 'Clear this day'); clear.type = 'button';
      clear.addEventListener('click', function () {
        delete state.shifts[key];
        save(); renderMonth(); showDayView(key);
        toast('Day cleared.');
      });
      body.appendChild(clear);
    }
    body.appendChild(el('p', 'fine', 'Uploading a roster that covers this date will replace your edit.'));

    function doSave() {
      var code = codeIn.value.trim().toUpperCase().replace(/\s+/g, ' ');
      var note = noteIn.value.trim();
      if (!code && !note) { delete state.shifts[key]; }
      else state.shifts[key] = { code: code, note: note, edited: true };
      save(); renderMonth(); showDayView(key);
      toast('Saved.');
    }
  }

  // ---------- Upload & parse ----------
  var pdfjsReady = null;
  function loadPdfJs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (resolve, reject) {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      var s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { pdfjsReady = null; reject(new Error('Could not load the PDF reader.')); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  async function parseFile(file) {
    var lib = await loadPdfJs();
    var data = new Uint8Array(await file.arrayBuffer());
    var doc;
    try { doc = await lib.getDocument({ data: data }).promise; }
    catch (e) { throw new Error(file.name + ': this file could not be opened as a PDF.'); }
    var res = await Parser.parseDocument(doc, { fallbackYear: new Date().getFullYear() });
    try { doc.destroy(); } catch (e) { /* ignore */ }
    res.fileName = file.name;
    return res;
  }

  async function handleFiles(fileList) {
    var files = Array.prototype.filter.call(fileList || [], function (f) {
      return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    });
    if (!files.length) { toast('Please choose a roster PDF file.', true); return; }

    busy(true, files.length > 1 ? 'Reading ' + files.length + ' rosters…' : 'Reading roster…');
    var results = [], errors = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var r = await parseFile(files[i]);
        if (!r.isRoster) errors.push(files[i].name + ': this doesn\u2019t look like a duty roster (no date columns or staff IDs found).');
        else results.push(r);
      } catch (e) {
        errors.push(e.message || String(e));
      }
    }
    busy(false);

    if (!results.length) { toast(errors.join('\n'), true); return; }

    // Remember every person from this batch so "Change person" works without re-uploading.
    state.lastPersons = mergePersons(results);
    save();

    if (!state.profile) {
      pickPerson(state.lastPersons, function (profile) {
        state.profile = profile;
        save();
        applyResults(results, errors);
      });
      if (errors.length) toast(errors.join('\n'), true);
      return;
    }
    applyResults(results, errors);
  }

  /** Merge persons across files: { id, name, position, shifts, dates } with dates covered by the files. */
  function mergePersons(results) {
    var map = {};
    var dates = {};
    results.forEach(function (r) {
      r.dates.forEach(function (d) { dates[d] = 1; });
      r.persons.forEach(function (p) {
        if (!map[p.id]) map[p.id] = { id: p.id, name: p.name, position: p.position, shifts: {} };
        Object.assign(map[p.id].shifts, p.shifts);
      });
    });
    return { dates: Object.keys(dates).sort(), persons: Object.keys(map).map(function (k) { return map[k]; }) };
  }

  function applyResults(results, errors) {
    var imported = [];
    results.forEach(function (r) {
      var p = Parser.findPerson(r, state.profile);
      if (!p) {
        errors.push(r.fileName + ': ' + titleCase(state.profile.name) + ' (' + state.profile.id + ') was not found in this roster.');
        return;
      }
      var n = Object.keys(p.shifts).filter(function (k) { return p.shifts[k].code; }).length;
      if (!n) {
        errors.push(r.fileName + ': found ' + titleCase(p.name) + ' but there are no shift codes in that row.');
        return;
      }
      // Overwrite every date this PDF covers.
      r.dates.forEach(function (d) { delete state.shifts[d]; });
      Object.keys(p.shifts).forEach(function (d) { state.shifts[d] = { code: p.shifts[d].code, note: p.shifts[d].note || '' }; });
      // Keep the name fresh if we matched by ID (e.g. spelling fixes in the roster).
      if (p.id === state.profile.id && p.name) state.profile.name = p.name;
      imported.push(r);
    });
    save();

    if (imported.length) {
      var all = [].concat.apply([], imported.map(function (r) { return r.dates; })).sort();
      var first = parseIso(all[0]), last = parseIso(all[all.length - 1]);
      view = { y: first.getFullYear(), m: first.getMonth() };
      render();
      var msg = 'Saved ' + first.getDate() + (first.getMonth() !== last.getMonth() ? ' ' + MONTHS[first.getMonth()].slice(0, 3) : '') +
        '–' + last.getDate() + ' ' + MONTHS[last.getMonth()].slice(0, 3) + ' ' + last.getFullYear();
      if (errors.length) toast(msg + '\n' + errors.join('\n'), true);
      else toast(msg);
    } else {
      render();
      toast(errors.join('\n'), true);
    }
  }

  // ---------- Person picker ----------
  function pickPerson(batch, onPick) {
    var dlg = $('pickerDlg');
    var list = $('pickerList');
    var search = $('pickerSearch');
    var persons = batch.persons.slice();

    function draw(q) {
      list.textContent = '';
      var nq = Parser.normName(q);
      var shown = persons.filter(function (p) {
        return !nq || Parser.normName(p.name).indexOf(nq) >= 0 || p.id.indexOf(nq.replace(/\s/g, '')) >= 0;
      });
      if (!shown.length) { list.appendChild(el('li', 'section', 'No match')); return; }
      shown.forEach(function (p) {
        var li = el('li');
        var b = el('button');
        b.type = 'button';
        var left = el('div');
        left.appendChild(el('div', 'nm', titleCase(p.name) || '(no name)'));
        var hasShifts = Object.keys(p.shifts).some(function (k) { return p.shifts[k].code; });
        var meta = el('div', 'meta', p.id + (p.position ? ' · ' + p.position : '') + (hasShifts ? '' : ' · no shifts'));
        b.appendChild(left);
        b.appendChild(meta);
        b.addEventListener('click', function () {
          dlg.close('picked');
          onPick({ id: p.id, name: p.name });
        });
        li.appendChild(b);
        list.appendChild(li);
      });
    }
    search.value = '';
    search.oninput = function () { draw(search.value); };
    draw('');
    dlg.showModal();
  }

  function changePerson() {
    $('settingsDlg').close();
    if (!state.lastPersons || !state.lastPersons.persons.length) {
      if (!confirm('Change person? Your saved shifts will be cleared and you\u2019ll pick your name on the next upload.')) return;
      state.profile = null; state.shifts = {}; save(); render();
      toast('Upload a roster PDF to pick your name.');
      return;
    }
    pickPerson(state.lastPersons, function (profile) {
      if (state.profile && profile.id === state.profile.id) return;
      state.profile = profile;
      state.shifts = {};
      var p = state.lastPersons.persons.find(function (x) { return x.id === profile.id; });
      state.lastPersons.dates.forEach(function (d) {
        if (p && p.shifts[d] && p.shifts[d].code) state.shifts[d] = { code: p.shifts[d].code, note: p.shifts[d].note || '' };
      });
      save();
      var keys = Object.keys(state.shifts).sort();
      if (keys.length) { var f = parseIso(keys[0]); view = { y: f.getFullYear(), m: f.getMonth() }; }
      render();
      toast('Now showing ' + titleCase(profile.name) + '. Upload older rosters again to fill other months.');
    });
  }

  // ---------- Settings ----------
  function openSettings() {
    $('setWho').textContent = state.profile ? titleCase(state.profile.name) + ' · ' + state.profile.id : 'Not set yet';
    var mk = monthKeys();
    $('setMonths').textContent = mk.length ? mk.map(function (k) { var p = k.split('-'); return MONTHS[+p[1] - 1].slice(0, 3) + ' ' + p[0]; }).join(', ') : 'None';
    document.querySelectorAll('input[name="theme"]').forEach(function (r) { r.checked = r.value === state.settings.theme; });
    $('icsOff').checked = !!state.settings.icsOff;
    $('appVersion').textContent = 'Version ' + APP_VERSION;
    $('settingsDlg').showModal();
  }

  // ---------- .ics export ----------
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function exportIcs() {
    var ms = monthShifts(view.y, view.m);
    var keys = Object.keys(ms).sort().filter(function (k) {
      return ms[k].code && (state.settings.icsOff || !Codes.isOff(ms[k].code));
    });
    if (!keys.length) { toast('No working days to export this month.', true); return; }
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//My Roster//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:My Roster'];
    keys.forEach(function (k) {
      var s = ms[k];
      var inf = Codes.info(s.code);
      var d = parseIso(k);
      var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      var title = inf.name + ' (' + s.code + ')' + (s.note ? ' \u2013 ' + s.note : '');
      lines.push('BEGIN:VEVENT',
        'UID:' + k + '-' + (state.profile ? state.profile.id : 'me') + '@myroster',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + k.replace(/-/g, ''),
        'DTEND;VALUE=DATE:' + iso(next.getFullYear(), next.getMonth(), next.getDate()).replace(/-/g, ''),
        'SUMMARY:' + icsEscape(title),
        'DESCRIPTION:' + icsEscape(inf.name + (s.note ? '\nNote: ' + s.note : '')),
        'TRANSP:TRANSPARENT',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' });
    download(blob, 'my-roster-' + view.y + '-' + pad(view.m + 1) + '.ics');
    toast(keys.length + ' day' + (keys.length > 1 ? 's' : '') + ' exported. Open the file to add them to your calendar.');
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // ---------- PNG export ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, text, maxW, size, weight) {
    var s = size;
    do { ctx.font = weight + ' ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; s -= 2; }
    while (ctx.measureText(text).width > maxW && s > 10);
  }

  function drawMonthPng() {
    var y = view.y, m = view.m;
    var ms = monthShifts(y, m);
    var sum = summarise(ms);
    var W = 1080, P = 44, gap = 8;
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var rows = Math.ceil((first + days) / 7);
    var cw = (W - 2 * P - 6 * gap) / 7;
    var ch = Math.round(cw * 1.12);
    var headH = 150, wdH = 44;
    var legendRows = Math.ceil(sum.legend.length / 3);
    var footH = 40 + 110 + 20 + legendRows * 52 + 50;
    var H = headH + wdH + rows * ch + (rows - 1) * gap + footH;

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var bg = dark ? '#0b1416' : '#ffffff', ink = dark ? '#e8eef0' : '#14191c', muted = dark ? '#98a6ac' : '#5d676e', empty = dark ? '#1c2b30' : '#eef1f3';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = ink; ctx.font = '800 58px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(MONTHS[m] + ' ' + y, P, 84);
    ctx.fillStyle = muted; ctx.font = '500 28px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(state.profile ? titleCase(state.profile.name) : 'My Roster', P, 124);

    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(function (w, i) {
      ctx.fillStyle = i === 0 ? '#c0262d' : muted;
      ctx.fillText(w, P + i * (cw + gap) + cw / 2, headH + 26);
    });

    for (var d = 1; d <= days; d++) {
      var idx = first + d - 1;
      var cx = P + (idx % 7) * (cw + gap);
      var cy = headH + wdH + Math.floor(idx / 7) * (ch + gap);
      var s = ms[iso(y, m, d)];
      var fg = muted;
      if (s && s.code) {
        var c = Codes.colours(Codes.info(s.code).cat);
        ctx.fillStyle = c.bg; fg = c.fg;
      } else ctx.fillStyle = empty;
      roundRect(ctx, cx, cy, cw, ch, 16); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'left';
      ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(String(d), cx + 10, cy + 28);
      ctx.textAlign = 'center';
      if (s && s.code) {
        fitText(ctx, s.code, cw - 12, 52, '800');
        ctx.fillText(s.code, cx + cw / 2, cy + ch * 0.62);
      }
      if (s && s.note) {
        fitText(ctx, s.note, cw - 10, 22, '700');
        ctx.fillText(s.note, cx + cw / 2, cy + ch - 14);
      }
    }

    var fy = headH + wdH + rows * ch + (rows - 1) * gap + 40;
    var bw = (W - 2 * P - 5 * 10) / 6;
    sum.counts.forEach(function (c, i) {
      var bx = P + i * (bw + 10);
      ctx.fillStyle = empty; roundRect(ctx, bx, fy, bw, 100, 14); ctx.fill();
      ctx.fillStyle = ink; ctx.textAlign = 'center';
      ctx.font = '800 42px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(String(c[1]), bx + bw / 2, fy + 52);
      ctx.fillStyle = muted;
      fitText(ctx, c[0], bw - 10, 20, '600');
      ctx.fillText(c[0], bx + bw / 2, fy + 82);
    });

    var ly = fy + 130;
    var colW = (W - 2 * P) / 3;
    sum.legend.forEach(function (inf, i) {
      var lx = P + (i % 3) * colW, yy = ly + Math.floor(i / 3) * 52;
      var c = Codes.colours(inf.cat);
      ctx.fillStyle = c.bg; roundRect(ctx, lx, yy, 64, 38, 9); ctx.fill();
      ctx.fillStyle = c.fg; ctx.textAlign = 'center';
      fitText(ctx, inf.code, 58, 22, '800');
      ctx.fillText(inf.code, lx + 32, yy + 27);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      fitText(ctx, inf.name, colW - 84, 22, '500');
      ctx.fillText(inf.name, lx + 76, yy + 27);
    });

    ctx.fillStyle = muted; ctx.textAlign = 'right';
    ctx.font = '500 18px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText('My Roster', W - P, H - 20);
    return cv;
  }

  function savePng() {
    var cv = drawMonthPng();
    var name = 'my-roster-' + view.y + '-' + pad(view.m + 1) + '.png';
    cv.toBlob(async function (blob) {
      if (!blob) { toast('Could not create the image.', true); return; }
      var file;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
      var coarse = matchMedia('(pointer: coarse)').matches;
      if (file && coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: MONTHS[view.m] + ' ' + view.y + ' roster' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      download(blob, name);
      toast('Image saved.');
    }, 'image/png');
  }

  // ---------- Events ----------
  function bind() {
    var input = $('fileInput');
    $('btnUpload').addEventListener('click', function () { input.click(); });
    $('btnUploadEmpty').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      handleFiles(files);
    });

    // Drag & drop anywhere (desktop).
    ['dragenter', 'dragover'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); $('dropZone').classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); $('dropZone').classList.remove('drag'); });
    });
    document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

    $('prevMonth').addEventListener('click', function () { shiftMonth(-1); });
    $('nextMonth').addEventListener('click', function () { shiftMonth(1); });
    $('monthTitle').addEventListener('click', function () { view = initialMonth(); renderMonth(); });
    $('grid').addEventListener('click', function (e) {
      var b = e.target.closest('.day');
      if (b && b.dataset.date) openDay(b.dataset.date);
    });

    // Swipe left/right to change month.
    var sx = null, sy = null;
    $('grid').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    $('grid').addEventListener('touchend', function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
      sx = null;
    });

    $('btnPng').addEventListener('click', savePng);
    $('btnIcs').addEventListener('click', exportIcs);
    $('btnSettings').addEventListener('click', openSettings);
    $('btnChangePerson').addEventListener('click', changePerson);
    document.querySelectorAll('input[name="theme"]').forEach(function (r) {
      r.addEventListener('change', function () { state.settings.theme = r.value; save(); applyTheme(); });
    });
    $('icsOff').addEventListener('change', function () { state.settings.icsOff = $('icsOff').checked; save(); });
    $('btnClear').addEventListener('click', function () {
      if (!confirm('Clear all data? This removes your name, staff ID and all saved shifts from this device.')) return;
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = emptyState();
      view = initialMonth();
      $('settingsDlg').close();
      render();
      toast('All data cleared.');
    });

    // Close sheets when tapping the backdrop.
    document.querySelectorAll('dialog.sheet').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    });

    document.addEventListener('keydown', function (e) {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'ArrowLeft') shiftMonth(-1);
      if (e.key === 'ArrowRight') shiftMonth(1);
    });
  }

  function shiftMonth(delta) {
    var d = new Date(view.y, view.m + delta, 1);
    view = { y: d.getFullYear(), m: d.getMonth() };
    renderMonth();
  }

  // If the current month has no data but others do, open the latest month with data.
  (function pickStartMonth() {
    var mk = monthKeys();
    var cur = view.y + '-' + pad(view.m + 1);
    if (mk.length && mk.indexOf(cur) < 0) {
      var future = mk.filter(function (k) { return k > cur; });
      var k = future.length ? future[0] : mk[mk.length - 1];
      view = { y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 };
    }
  })();

  // Track the visible viewport (shrinks when the iOS keyboard opens) for the picker sheet height.
  function syncViewport() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--vvh', h + 'px');
  }
  syncViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', function () { if (document.querySelector('#pickerDlg[open]')) window.scrollTo(0, 0); });
  }
  window.addEventListener('resize', syncViewport);

  // Ask the browser to keep our storage (less likely to be cleared under storage pressure).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () {});
  }

  bind();
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    // When a new version takes over, reload once so the new code runs.
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) { hadController = true; return; }
      if (document.querySelector('dialog[open]')) return; // don't interrupt editing; next open picks it up
      reloaded = true;
      location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        // Installed apps (esp. iOS) rarely check for updates on their own: check on open and when brought back.
        reg.update().catch(function () {});
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
      }).catch(function () { /* offline support unavailable */ });
    });
  }

  // Test hook (used by the browser smoke test).
  window.__myRoster = { handleFiles: handleFiles, state: function () { return state; }, drawMonthPng: drawMonthPng };
})();
