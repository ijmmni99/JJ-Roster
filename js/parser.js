/*
 * My Roster – PDF roster parser.
 * Works in the browser (window.RosterParser) and in Node (module.exports).
 *
 * Parses by x/y coordinates from pdf.js getTextContent(), never by text order.
 */
(function (root) {
  'use strict';

  var DATE_RE = /^(\d{1,2})-([A-Za-z]{3})$/;
  var ID_RE = /^K?S\d{5,6}$/;
  var WEEKDAY_RE = /^(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*$/i;
  var POSITION_RE = /^(S?SN|PCA|HCA|ANC|ANM|NM|SISTER|MATRON|JM|PPK|KJ|PJ|NE|CNM|ADON)\b/i;
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var MONTH_FULL_RE = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(20\d{2})\b/i;

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Convert raw pdf.js text items to simple boxes in top-down page coords. */
  function normaliseItems(rawItems, pageHeight) {
    var out = [];
    for (var i = 0; i < rawItems.length; i++) {
      var it = rawItems[i];
      if (!it || typeof it.str !== 'string') continue;
      var str = it.str.replace(/\s+/g, ' ').trim();
      if (!str) continue;
      var t = it.transform;
      // Skip rotated text (e.g. vertical course labels in the header area).
      if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) continue;
      var h = it.height || Math.abs(t[3]) || 4;
      var w = it.width || 0;
      var x = t[4];
      var base = pageHeight - t[5];
      out.push({ str: str, x: x, w: w, h: h, xc: x + w / 2, yc: base - h / 2, x2: x + w });
    }
    return out;
  }

  /** Group date-header items into header rows. */
  function findHeaderRows(items) {
    var dates = items.filter(function (it) { return DATE_RE.test(it.str); });
    dates.sort(function (a, b) { return a.yc - b.yc; });
    var rows = [];
    dates.forEach(function (d) {
      var row = rows.find(function (r) { return Math.abs(r.yc - d.yc) < 2; });
      if (!row) { row = { yc: d.yc, cells: [] }; rows.push(row); }
      var m = DATE_RE.exec(d.str);
      row.cells.push({ day: parseInt(m[1], 10), mon: m[2].toUpperCase(), xc: d.xc });
    });
    rows = rows.filter(function (r) { return r.cells.length >= 3; });
    rows.forEach(function (r) {
      r.cells.sort(function (a, b) { return a.xc - b.xc; });
      var cs = r.cells;
      var gaps = [];
      for (var i = 1; i < cs.length; i++) gaps.push(cs[i].xc - cs[i - 1].xc);
      var g = median(gaps);
      for (var j = 0; j < cs.length; j++) {
        cs[j].left = j === 0 ? cs[j].xc - g / 2 : (cs[j - 1].xc + cs[j].xc) / 2;
        cs[j].right = j === cs.length - 1 ? cs[j].xc + g / 2 : (cs[j].xc + cs[j + 1].xc) / 2;
      }
      r.left = cs[0].left;
      r.right = cs[cs.length - 1].right;
    });
    return rows;
  }

  function findTitleMonthYear(allItems) {
    // Search items line by line so a split "NOVEMBER" "2026" still matches.
    var sorted = allItems.slice().sort(function (a, b) { return a.yc - b.yc || a.x - b.x; });
    var lines = [];
    sorted.forEach(function (it) {
      var l = lines.length ? lines[lines.length - 1] : null;
      if (l && Math.abs(l.yc - it.yc) < 2) l.text += ' ' + it.str;
      else lines.push({ yc: it.yc, text: it.str });
    });
    for (var i = 0; i < lines.length; i++) {
      var m = MONTH_FULL_RE.exec(lines[i].text);
      if (m) return { month: MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()), year: parseInt(m[2], 10) };
    }
    return null;
  }

  function joinLine(items) {
    items.sort(function (a, b) { return a.x - b.x; });
    var s = '';
    for (var i = 0; i < items.length; i++) {
      if (i > 0) s += (items[i].x - items[i - 1].x2 > 0.8) ? ' ' : '';
      s += items[i].str;
    }
    return s.trim();
  }

  /** Group items into visual lines (by y) and join each line. */
  function joinLines(items, tol) {
    var sorted = items.slice().sort(function (a, b) { return a.yc - b.yc; });
    var lines = [];
    sorted.forEach(function (it) {
      var l = lines.length ? lines[lines.length - 1] : null;
      if (l && Math.abs(l.yc - it.yc) < tol) l.items.push(it);
      else lines.push({ yc: it.yc, items: [it] });
    });
    return lines.map(function (l) { return joinLine(l.items); }).filter(Boolean).join(' ');
  }

  /**
   * Parse pages: [{ width, height, items: <pdf.js text items> }]
   * Returns { title, persons: [{id, name, position, page, shifts: {YYYY-MM-DD: {code, note}}}], dates: [YYYY-MM-DD] }
   */
  function parsePages(pages, opts) {
    opts = opts || {};
    var fallbackYear = opts.fallbackYear || new Date().getFullYear();
    var norm = pages.map(function (p) { return normaliseItems(p.items, p.height); });
    var all = [].concat.apply([], norm);

    var title = findTitleMonthYear(all);
    var baseYear = title ? title.year : fallbackYear;
    var titleMonth = title ? title.month : -1;

    function isoFor(day, monAbbr) {
      var mi = MONTHS.indexOf(monAbbr);
      if (mi < 0) return null;
      var y = baseYear;
      // Handle rosters that cross a year boundary (e.g. Dec title, Jan dates).
      if (titleMonth >= 0) {
        if (titleMonth === 11 && mi === 0) y += 1;
        else if (titleMonth === 0 && mi === 11) y -= 1;
      }
      return y + '-' + pad(mi + 1) + '-' + pad(day);
    }

    var persons = [];
    var seen = {};
    var allDates = {};
    var headerCount = 0;

    norm.forEach(function (items, pageIdx) {
      var headers = findHeaderRows(items);
      headerCount += headers.length;
      if (!headers.length) return;
      headers.forEach(function (h) { h.cells.forEach(function (c) { var iso = isoFor(c.day, c.mon); if (iso) allDates[iso] = 1; }); });

      var anchors = items.filter(function (it) { return ID_RE.test(it.str); });
      anchors.sort(function (a, b) { return a.yc - b.yc; });
      if (!anchors.length) return;

      var spacings = [];
      for (var i = 1; i < anchors.length; i++) spacings.push(anchors[i].yc - anchors[i - 1].yc);
      var med = median(spacings) || 17;
      var cap = 0.6 * med;

      var headerItemYs = headers.map(function (h) { return h.yc; });
      var posHeaders = items.filter(function (it) { return /^POSITION$/i.test(it.str); });

      anchors.forEach(function (a, idx) {
        var top = idx > 0 ? (anchors[idx - 1].yc + a.yc) / 2 : -Infinity;
        var bot = idx < anchors.length - 1 ? (a.yc + anchors[idx + 1].yc) / 2 : Infinity;
        top = Math.max(top, a.yc - cap);
        bot = Math.min(bot, a.yc + cap);

        // Nearest header row above this person.
        var header = null;
        for (var h = 0; h < headers.length; h++) {
          if (headers[h].yc < a.yc && (!header || headers[h].yc > header.yc)) header = headers[h];
        }
        if (!header) return;
        // Never let a row reach up into its header.
        top = Math.max(top, header.yc + 1);

        var rowItems = items.filter(function (it) {
          return it.yc > top && it.yc < bot && it !== a &&
            !DATE_RE.test(it.str) && !(WEEKDAY_RE.test(it.str) && headerItemYs.some(function (y) { return Math.abs(it.yc - y) < 12; }));
        });

        // ---- Name: right of the ID, left of the position column ----
        var limit = header.left;
        var posHdr = posHeaders.filter(function (p) { return p.yc < a.yc; }).sort(function (p, q) { return q.yc - p.yc; })[0];
        if (posHdr) limit = Math.min(limit, posHdr.x - 2);
        var posItem = rowItems.filter(function (it) { return it.x > a.x2 && POSITION_RE.test(it.str); })
          .sort(function (p, q) { return p.x - q.x; })[0];
        if (posItem) limit = Math.min(limit, posItem.x - 0.5);
        var nameItems = rowItems.filter(function (it) { return it.x >= a.x2 - 0.5 && it.xc < limit; });
        var name = joinLines(nameItems, 2).replace(/\s+/g, ' ').trim();
        var position = posItem ? posItem.str : '';

        // ---- Shift cells ----
        var cells = header.cells.map(function () { return { up: [], low: [] }; });
        rowItems.forEach(function (it) {
          if (it.xc < header.left || it.xc > header.right) return;
          var ci = -1;
          for (var c = 0; c < header.cells.length; c++) {
            if (it.xc >= header.cells[c].left && it.xc < header.cells[c].right) { ci = c; break; }
          }
          if (ci < 0) return;
          (it.yc < a.yc ? cells[ci].up : cells[ci].low).push(it);
        });

        var shifts = {};
        header.cells.forEach(function (hc, c) {
          var iso = isoFor(hc.day, hc.mon);
          if (!iso) return;
          var code = joinLine(cells[c].up).toUpperCase().replace(/\s+/g, ' ');
          var note = joinLine(cells[c].low);
          if (code || note) shifts[iso] = { code: code, note: note };
        });

        if (seen[a.str]) {
          Object.assign(seen[a.str].shifts, shifts);
          return;
        }
        var person = { id: a.str, name: name, position: position, page: pageIdx + 1, shifts: shifts };
        seen[a.str] = person;
        persons.push(person);
      });
    });

    var dates = Object.keys(allDates).sort();
    var isRoster = headerCount > 0 && persons.length > 0;
    return {
      isRoster: isRoster,
      title: title ? MONTHS[title.month] + ' ' + title.year : null,
      dates: dates,
      persons: persons
    };
  }

  /** Parse a pdf.js PDFDocumentProxy. */
  async function parseDocument(pdfDoc, opts) {
    var pages = [];
    for (var p = 1; p <= pdfDoc.numPages; p++) {
      var page = await pdfDoc.getPage(p);
      var vp = page.getViewport({ scale: 1 });
      var tc = await page.getTextContent();
      pages.push({ width: vp.width, height: vp.height, items: tc.items });
    }
    return parsePages(pages, opts);
  }

  function normName(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  /** Find a person in a parse result by staff ID, then by name. */
  function findPerson(result, profile) {
    if (!result || !profile) return null;
    var byId = result.persons.find(function (p) { return p.id === profile.id; });
    if (byId) return byId;
    var n = normName(profile.name);
    if (!n) return null;
    return result.persons.find(function (p) { return normName(p.name) === n; }) ||
      result.persons.find(function (p) {
        var pn = normName(p.name);
        return pn && (pn.indexOf(n) >= 0 || n.indexOf(pn) >= 0);
      }) || null;
  }

  var api = { parsePages: parsePages, parseDocument: parseDocument, findPerson: findPerson, normName: normName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RosterParser = api;
})(typeof self !== 'undefined' ? self : this);
