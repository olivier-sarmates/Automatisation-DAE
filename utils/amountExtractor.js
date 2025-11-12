/**
 * Utilitaires pour extraire les montants depuis du texte
 */

/**
 * Extrait un montant depuis du texte
 * @param {string} text - Texte contenant un montant
 * @returns {number|null} - Montant extrait ou null
 */
function extractAmount(text) {
  const patterns = [
    /montant.*?(\d+[\s\u00A0]?\d*[,.]?\d*)\s*€/i,
    /total.*?(\d+[\s\u00A0]?\d*[,.]?\d*)\s*€/i,
    /(\d+[\s\u00A0]?\d*[,.]?\d*)\s*€\s*TTC/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = match[1].replace(/[\s\u00A0]/g, '').replace(',', '.');
      return parseFloat(amount);
    }
  }
  return null;
}

/**
 * Extrait un montant HT depuis du texte
 * @param {string} src - Texte source
 * @returns {number|null} - Montant HT extrait ou null
 */
function extractAmountHT(src) {
  const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));

  const patterns = [
    /TOTAL\s*HT[^0-9]*([\d\s.,]+)/i,
    /MONTANT\s*(?:HT|HORS\s*TVA)[^0-9]*([\d\s.,]+)/i,
    /PRIX\s*HT[^0-9]*([\d\s.,]+)/i
  ];

  for (const r of patterns) {
    const m = src.match(r);
    if (m && m[1]) {
      const v = num(m[1]);
      if (!isNaN(v)) return v;
    }
  }
  return null;
}

module.exports = {
  extractAmount,
  extractAmountHT
};
