/**
 * Utilitaires pour parser les dates françaises
 */

/**
 * Parse une date au format français
 * @param {string} dateStr - Date au format "DD.MM.YYYY" ou "DD mois YYYY"
 * @returns {Date|null} - Date parsée ou null
 */
function parseFrenchDate(dateStr) {
  if (!dateStr) return null;

  const months = {
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
    'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
    'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
  };

  // Format: "05.09.2025"
  let match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return new Date(`${match[3]}-${match[2]}-${match[1]}`);
  }

  // Format: "31 juillet 2025" ou "27 août 2025"
  match = dateStr.match(/(\d{1,2})\s+([a-zéèêëàâäôöûüçñ]+)\s+(\d{4})/i);
  if (match) {
    const month = months[match[2].toLowerCase()] || '01';
    return new Date(`${match[3]}-${month}-${match[1].padStart(2, '0')}`);
  }

  return null;
}

/**
 * Parse une date au format JJ/MM/AAAA
 * @param {string} dateStr - Date au format "JJ/MM/AAAA"
 * @returns {Date|null} - Date parsée ou null
 */
function parseFrenchDateString(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const [_, d, mth, y] = m;
  const iso = `${y}-${mth.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const parsed = new Date(iso);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse une date depuis différents formats
 * @param {string|number} str - Date à parser
 * @returns {Date|null} - Date parsée ou null
 */
function parseDate(str) {
  if (!str) return null;
  if (typeof str === 'number') return new Date(str);
  const s = String(str).trim();
  if (!s) return null;

  // Format ISO: "YYYY-MM-DD"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(s);

  // Format français: "DD.MM.YYYY" ou "DD/MM/YYYY"
  const fr = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) return new Date(`${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`);

  return null;
}

module.exports = {
  parseFrenchDate,
  parseFrenchDateString,
  parseDate
};
