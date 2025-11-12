/**
 * Service pour parser les PDF de commandes (BDC)
 */

const pdfParse = require('pdf-parse');

/**
 * Parse un PDF de bon de commande
 * @param {Buffer} buffer - Buffer du fichier PDF
 * @param {string} fileName - Nom du fichier
 * @returns {Promise<Object>} - Données extraites
 */
async function parseOrderPDF(buffer, fileName) {
  const data = await pdfParse(buffer);
  const text = data.text;

  console.log('==== RAW PDF TEXT ====');
  console.log(text.substring(0, 400));

  const orderNumber = text.match(/NUMERO D'ENGAGEMENT\s*:\s*([^\n]+)/i)?.[1]?.trim() || 'N/A';

  const dateMatch = text.match(/DATE\s*:\s*(\d{2}\.\d{2}\.\d{4})/i);
  const dateStr = dateMatch ? dateMatch[1] : null;
  const orderDate = dateStr || null;

  // Extraction fiable du service bénéficiaire
  let serviceContact = 'N/A';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase().includes('SERVICE A CONTACTER')) {
      // On lit les lignes suivantes (jusqu'à 8 lignes après)
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j];

        // Ignore la ligne standard
        if (/^"Pour toute information/i.test(l)) {
          // Si pas de "Contact :" plus bas, prendre la première ligne non vide ensuite
          let found = null;
          for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
            const next = lines[k];
            if (next && !/^Contact\s*:/i.test(next)) {
              found = next;
              break;
            }
          }
          if (found) serviceContact = found.trim();
          break;
        }

        // Si une ligne "Contact :" est trouvée
        if (/^Contact\s*:/i.test(l)) {
          if (lines[j + 1]) {
            serviceContact = lines[j + 1].trim();
          }
          break;
        }
      }
      break;
    }
  }

  let totalHT = null;
  const htIdx = text.search(/TOTAL HT \(EUR\)/i);
  if (htIdx !== -1) {
    const afterHT = text.slice(htIdx).split('\n');
    for (const l of afterHT) {
      const match = l.match(/([\d\s,.]+)/);
      if (match) {
        const n = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(n)) {
          totalHT = n;
          break;
        }
      }
    }
  }

  console.log('DEBUG orderNumber:', orderNumber);
  console.log('DEBUG serviceContact:', serviceContact);
  console.log('DEBUG totalHT:', totalHT);

  return {
    fileName,
    orderNumber,
    date: dateStr,
    orderDate,
    serviceContact,
    totalHT: totalHT ? totalHT.toFixed(2) : null
  };
}

module.exports = { parseOrderPDF };
