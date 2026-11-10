/* guard.js - looks for things that should not be copied into a ticket: passwords, card numbers, ID numbers.
   It only warns; you can always choose Copy anyway. Turn it off in Settings if it gets in the way. */
(function (global) {
  "use strict";
  var SDT = global.SDT = global.SDT || {};
  var SECRET = /\b(password|passwd|pwd|passcode|secret|token)\b\s*(is|was|=|:)\s*\S+/i;
  var SSN = /\b\d{3}-\d{2}-\d{4}\b/;
  var GOVID = /\b(ssn|social security(?: number)?|sss|tin|passport(?: number| no\.?)?|philsys|umid)\b[^\n]{0,24}?\d[\d -]{5,}/i;
  var CARD = /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b|\b\d{4}[ -]\d{6}[ -]\d{5}\b/g;

  function luhn(d) {
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = d.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function hasCard(text) {
    var re = new RegExp(CARD.source, "g"), m;
    while ((m = re.exec(text))) {
      var d = m[0].replace(/\D/g, "");
      if (d.length >= 13 && d.length <= 19 && !/^(\d)\1+$/.test(d) && luhn(d)) return true;
    }
    return false;
  }
  function scan(text) {
    text = String(text == null ? "" : text);
    var out = [];
    if (SECRET.test(text)) out.push("a password or secret");
    if (hasCard(text)) out.push("a card number");
    if (SSN.test(text) || GOVID.test(text)) out.push("a government ID number");
    return out;
  }
  SDT.guard = { scan: scan, luhn: luhn };
})(window);
