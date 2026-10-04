/* Does a message ask about Sid's own money or plans? Used to require the passphrase before any model call. */
const MONEY = '(portfolio|holdings?|bags?|btc|bitcoin|eth|ether|crypto|stocks?|shares?|positions?|gains?|loss(es)?|profits?|p&l|pnl|money|net ?worth|trigger|targets?|goals?|home ?loan|loan|mortgage|savings|cash|account|balance|returns?)';
const POSSESSIVE = new RegExp('\\b(my|mine|mera|meri|mere)\\s+(\\w+[\\s-]+){0,2}' + MONEY + '\\b', 'i');

function isPersonal(text) {
  const t = String(text || '');
  return /\b(show|put)\b.*\bboard\b/i.test(t)
    || POSSESSIVE.test(t)
    || /\bhow much\b.*\b(do i|i)\s+(have|own|hold|made|make|lost|lose)\b/i.test(t)
    || /\b(am i|i'm|i am)\s+(up|down|in (profit|loss))\b/i.test(t);
}

module.exports = { isPersonal };
