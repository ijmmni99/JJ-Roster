/* Shift code meanings, categories and colours. */
(function (root) {
  'use strict';

  // Category → colours (tile background, text). Same in light and dark mode for recognisability.
  var CATS = {
    m:   { bg: '#FFE45C', fg: '#3d3200', label: 'Morning' },
    e:   { bg: '#5BB8F5', fg: '#06263d', label: 'Evening' },
    n:   { bg: '#2DB866', fg: '#03250f', label: 'Night' },
    no:  { bg: '#E2E5EA', fg: '#2b3138', label: 'Night off' },
    rd:  { bg: '#F59A4A', fg: '#3a1900', label: 'Rest day' },
    al:  { bg: '#C8EFBE', fg: '#173b10', label: 'Leave' },
    d:   { bg: '#D7BCF2', fg: '#2e1648', label: 'Day / course' },
    ph:  { bg: '#F8BED0', fg: '#4a0f22', label: 'Public holiday' },
    unk: { bg: '#B9BFC8', fg: '#1d2229', label: 'Other' }
  };

  var CODES = {
    'M':      { cat: 'm',  name: 'Morning shift' },
    'E':      { cat: 'e',  name: 'Evening shift' },
    'N':      { cat: 'n',  name: 'Night shift' },
    'NO':     { cat: 'no', name: 'Night off' },
    'RD':     { cat: 'rd', name: 'Rest day' },
    'RDO':    { cat: 'rd', name: 'Rest day off' },
    'ORD':    { cat: 'rd', name: 'Off rest day' },
    'OFF':    { cat: 'rd', name: 'Off day' },
    'AL':     { cat: 'al', name: 'Annual leave' },
    'MTR':    { cat: 'al', name: 'Maternity leave' },
    'MC':     { cat: 'al', name: 'Medical leave' },
    'EL':     { cat: 'al', name: 'Emergency leave' },
    'CL':     { cat: 'al', name: 'Compassionate leave' },
    'D':      { cat: 'd',  name: 'Day duty / course' },
    '1/2':    { cat: 'd',  name: 'Half day' },
    '7-3.30': { cat: 'd',  name: 'Office hours 7–3.30' },
    'PH':     { cat: 'ph', name: 'Public holiday' },
    'RPH':    { cat: 'ph', name: 'Replacement public holiday' }
  };

  // Codes that are not working days (skipped in .ics export unless toggled on).
  var OFF_CATS = { rd: 1, no: 1, al: 1, ph: 1 };

  function info(code) {
    code = String(code || '').toUpperCase().trim();
    if (CODES[code]) return { code: code, cat: CODES[code].cat, name: CODES[code].name };
    // Time-range codes like 8-5, 7-3.30 → day duty.
    if (/^\d{1,2}(\.\d{2})?-\d{1,2}(\.\d{2})?$/.test(code)) return { code: code, cat: 'd', name: 'Duty ' + code };
    return { code: code, cat: 'unk', name: code ? 'Shift code ' + code : 'No code' };
  }

  function colours(cat) { return CATS[cat] || CATS.unk; }
  function isOff(code) { return !!OFF_CATS[info(code).cat]; }

  root.ShiftCodes = { info: info, colours: colours, isOff: isOff, CATS: CATS };
})(self);
