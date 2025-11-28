require('dotenv').config();

const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const basicAuth = require('express-basic-auth');
const cors = require('cors');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configuration depuis les variables d'environnement
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sarmates2025';
const FILE_SIZE_LIMIT = process.env.FILE_SIZE_LIMIT || '50';

app.use(cors());

// 🔐 Authentification basique (credentials depuis .env)
app.use(basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: 'Application Devis-Commandes'
}));

app.use(express.json({ limit: `${FILE_SIZE_LIMIT}mb` }));
app.use(express.urlencoded({ limit: `${FILE_SIZE_LIMIT}mb`, extended: true }));
app.use(express.static('public'));

// Fonction pour parser les dates françaises
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
  // CORRECTION: utiliser [a-zéèêëàâäôöûüçñ]+ au lieu de \w+ pour capturer les accents
  match = dateStr.match(/(\d{1,2})\s+([a-zéèêëàâäôöûüçñ]+)\s+(\d{4})/i);
  if (match) {
    const month = months[match[2].toLowerCase()] || '01';
    return new Date(`${match[3]}-${month}-${match[1].padStart(2, '0')}`);
  }
  
  return null;
}

// Fonction pour extraire le montant
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

// ==========================================================
// ============ API PARSE PDF COMMANDE =======================
// ==========================================================
app.post('/api/parse-order-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    console.log('==== RAW PDF TEXT ====');
    console.log(text.substring(0, 400));

    const orderNumber = text.match(/NUMERO D'ENGAGEMENT\s*:\s*([^\n]+)/i)?.[1]?.trim() || 'N/A';

    const dateMatch = text.match(/DATE\s*:\s*(\d{2}\.\d{2}\.\d{4})/i);
    const dateStr = dateMatch ? dateMatch[1] : null;
    const orderDate = dateStr || null;

// --- Extraction fiable du service bénéficiaire ---
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
          if (!isNaN(n)) { totalHT = n; break; }
        }
      }
    }

    console.log('DEBUG orderNumber:', orderNumber);
    console.log('DEBUG serviceContact:', serviceContact);
    console.log('DEBUG totalHT:', totalHT);

    res.json({
      fileName: req.file.originalname,
      orderNumber,
      date: dateStr,
      orderDate,
      serviceContact,
      totalHT: totalHT ? totalHT.toFixed(2) : null
    });
    
  } catch (error) {
    console.error('Erreur parsing PDF commande:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================
// ============ API PARSE EXCEL DEVIS ========================
// ==========================================================
app.post('/api/parse-quote-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const fileName = req.file.originalname;
    const matchCmd = fileName.match(/(\d{10})/);
    let linkedOrderNumber = matchCmd ? matchCmd[1] : null;

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const prestations = [];
    let quoteNumber = 'N/A';
    let quoteDate = null;
    let totalAmount = null;

    console.log('\n========================================');
    console.log('DEBUT ANALYSE FICHIER:', req.file.originalname);
    console.log('Nombre de feuilles:', workbook.SheetNames.length);
    console.log('Noms des feuilles:', workbook.SheetNames);
    console.log('========================================\n');

// ✅ Chercher la feuille BPU de manière intelligente
let sheetName = null;

// 1. Vérifier les noms exacts connus
if (workbook.SheetNames.includes('BPU DAE')) {
  sheetName = 'BPU DAE';
} else if (workbook.SheetNames.includes('BPU TREMBLAY')) {
  sheetName = 'BPU TREMBLAY';
} else {
  // 2. Chercher les feuilles commençant par "DEVIS"
  const devisSheets = workbook.SheetNames.filter(name =>
    name.toUpperCase().startsWith('DEVIS')
  );

  if (devisSheets.length > 0) {
    // 3. Si plusieurs feuilles DEVIS, prendre celle avec la lettre la plus élevée
    // Ex: "DEVIS IND B" > "DEVIS IND A" > "DEVIS"
    sheetName = devisSheets.sort((a, b) => {
      // Tri alphabétique décroissant (Z avant A)
      return b.localeCompare(a);
    })[0];

    console.log(`✓ Feuille DEVIS détectée : "${sheetName}" (parmi ${devisSheets.length} feuille(s) DEVIS)`);
  }
}

if (sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
// ===== EXTRACTION DU LIBELLÉ (titre du devis) =====
// Règle : chercher la ligne fusionnée en MAJUSCULES située APRÈS la ligne 15
// et AVANT "DEVIS xxx", en excluant les en-têtes génériques
let sheet3Libelle = '';

// 1) Trouver toutes les lignes fusionnées candidates (après ligne 15)
const candidates = [];
let devisLineIndex = -1;

for (let i = 15; i < Math.min(40, data.length); i++) {
  const row = data[i];
  if (!row) continue;

  // Chercher la ligne "DEVIS xxx"
  const rowText = row.join(' ');
  if (/DEVIS\s+\d{5,6}/i.test(rowText)) {
    devisLineIndex = i;
    
    // ✅ CAPTURER AUSSI LE NUMÉRO DE DEVIS
    const match = rowText.match(/DEVIS\s*(?:n[°o]\s*)?(\d{3,6})/i);
    if (match && quoteNumber === 'N/A') {
      quoteNumber = match[1];
      console.log('✓ Numéro de devis Excel trouvé:', quoteNumber);
    }
    
    break;
  }
  // Regarde les 7 premières colonnes (A à G)
  const firstSeven = row
    .slice(0, 7)
    .map(c => (c == null ? '' : String(c).trim()))
    .filter(c => c !== '');

  // Si une seule cellule non vide sur A..G → cellule fusionnée
  if (firstSeven.length === 1) {
    const cell = firstSeven[0];
    const isUpper = cell === cell.toUpperCase();

    // Exclure les en-têtes génériques
    const banned = /(^LOT\b|COUVERTURE\s*-\s*BARDAGE\s*-\s*ETANCH(E|É)ITE|ADRESSE|DOSSIER|CHANTIER)/i;

    if (isUpper && !banned.test(cell) && cell.length >= 8) {
      candidates.push({ line: i, text: cell });
    }
  }
}

// 2) Prendre le candidat le plus proche AVANT "DEVIS xxx"
if (candidates.length > 0) {
  if (devisLineIndex > 0) {
    // Chercher le candidat juste avant la ligne DEVIS
    const beforeDevis = candidates.filter(c => c.line < devisLineIndex);
    if (beforeDevis.length > 0) {
      sheet3Libelle = beforeDevis[beforeDevis.length - 1].text; // Le dernier avant DEVIS
      console.log('✓ Libellé Excel trouvé (avant DEVIS) :', sheet3Libelle);
    }
  } else {
    // Pas de ligne DEVIS trouvée, prendre le dernier candidat
    sheet3Libelle = candidates[candidates.length - 1].text;
    console.log('✓ Libellé Excel trouvé (dernier candidat) :', sheet3Libelle);
  }
}
// Fallback éventuel : si rien trouvé, on cherche une ligne en MAJUSCULES
// contenant un mot-clé métier (nettoyage, remplacement, fuite, etc.)
// mais qui n’est pas un en-tête générique.
if (!sheet3Libelle) {
  const keyword =
    /(nettoyage|remplacement|réparation|reparation|fourniture|pose|étanchéité|etancheite|recherche|fuite|inspection|maintenance|travaux|intervention|entretien)/i;
  const bannedGeneric =
    /(adresse|agence|prefecture|drfip|rue|avenue|dossier|responsable|email|telephone|chantier|ville|interlocuteur)/i;

  for (let i = 0; i < Math.min(60, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const txt = (row || [])
      .map(c => (c == null ? '' : String(c).trim()))
      .join(' ')
      .trim();

    if (
      txt &&
      txt === txt.toUpperCase() &&          // tout en majuscules
      keyword.test(txt) &&                  // contient un mot-clé métier
      !bannedGeneric.test(txt) &&           // pas une adresse / bas de page
      !/(DEVIS|LOT|COUVERTURE|BARDAGE|ÉTANCHÉITÉ|ETANCHEITE)/i.test(txt) &&
      txt.length >= 10
    ) {
      sheet3Libelle = txt;
      console.log('✓ Libellé Excel trouvé (fallback) :', sheet3Libelle);
      break;
    }
  }
}

// ===== EXTRACTION DES PRESTATIONS UNIQUEMENT SUR "BPU DAE" =====
      const normalizeNumber = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const s = String(val).replace(/\s/g, '').replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      };

      let extractedCount = 0;

      for (const row of data) {
        const colA = (row[0] || '').toString().trim();   // "Cv-Ch-Et"
        const code = (row[1] || '').toString().trim();   // code BPU
        const designation = (row[2] || '').toString().trim();
        const unit = (row[3] || '').toString().trim();
        const quantity = normalizeNumber(row[4]);
        const unitPrice = normalizeNumber(row[5]);

        // On ne garde QUE les lignes marquées "Cv-Ch-Et" avec un code et un minimum de données
        if (
          colA === 'Cv-Ch-Et' &&
          code &&
          designation &&
          unit &&
          quantity > 0 &&
          unitPrice > 0
        ) {
          prestations.push({
            bpuCode: code,
            designation: designation.substring(0, 200),
            unit,
            quantity,
            unitPrice,
            sheetName
          });
          extractedCount++;
        }
      }

      console.log(`✓ Total prestations extraites sur BPU DAE: ${extractedCount}`);

      if (prestations.length > 0) {
        totalAmount = prestations.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
      }

      // Retourner le résultat avec le libellé Excel
      const result = {
        fileName,
        quoteNumber,
        quoteDate: quoteDate ? quoteDate.toISOString() : null,
        totalAmount,
        prestations,
        prestationCount: prestations.length,
        linkedOrderNumber,
        sheet3Libelle  // Libellé extrait de l'Excel
      };

      res.json(result);
    } else {
      // Pas de feuille BPU DAE
      res.json({
        fileName,
        quoteNumber: 'N/A',
        quoteDate: null,
        totalAmount: null,
        prestations: [],
        prestationCount: 0,
        linkedOrderNumber,
        sheet3Libelle: ''
      });
    }
  } catch (error) {
    console.error('Erreur parsing Excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================
// ============ API PARSE PDF DEVIS ==========================
// ==========================================================
app.post('/api/parse-quote-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    console.log("Nom du fichier reçu :", req.file.originalname);
    console.log("Taille du buffer :", req.file.buffer.length);

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    // 🔍 Nettoyage et fusion des lignes coupées pour reconstituer les phrases
    let normalized = text
      .replace(/\r/g, '')
      .replace(/\n\s*\n/g, '\n')   // supprime lignes vides multiples
      .replace(/\s+/g, ' ')        // supprime espaces multiples
      .trim();

    // Extraction du numéro de devis
    const numMatch = normalized.match(/DEVIS\s*[N°\s]*[:\-]?\s*(\d{3,6})/i);
    const quoteNumber = numMatch ? numMatch[1].trim() : 'N/A';
// --- Suppression des dates intégrées dans les adresses type "19 mars 1962"
normalized = normalized.replace(/\b\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre)\s+(19[0-9]{2})\b/gi, '');
// === EXTRACTION ROBUSTE DE LA DATE DU DEVIS ===
let quoteDate = null;
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const folded = fold(normalized);

// Fonction de validation : rejeter les dates avant 2000
const isValidDate = (date) => {
  if (!date) return false;
  const year = date.getFullYear();
  return year >= 2000 && year <= 2100;
};

// 1) PRIORITÉ : Cas "Morangis le ..." (date officielle du devis)
const m1 = folded.match(
  /morangis\s+le\s+(\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4})/i
);
if (m1) {
  let literal = m1[1]
    .replace(/fevrier/ig, 'février')
    .replace(/aout/ig, 'août')
    .replace(/decembre/ig, 'décembre');
  const tempDate = parseFrenchDate(literal);
  if (isValidDate(tempDate)) {
    quoteDate = tempDate;
    console.log('✓ Date trouvée via "Morangis le":', quoteDate.toISOString().split('T')[0]);
  } else {
    console.log('✗ Date invalide rejetée (Morangis le):', tempDate ? tempDate.toISOString().split('T')[0] : 'null');
  }
}

// 2) Formats numériques (si pas trouvé via Morangis)
if (!quoteDate) {
  let dateMatch = folded.match(/\b(\d{2}[./-]\d{2}[./-]\d{4})\b/);
  if (dateMatch) {
    const tempDate = parseFrenchDate(dateMatch[1]);
    if (isValidDate(tempDate)) {
      quoteDate = tempDate;
    }
  }
}

// 3) Formats littéraux génériques
if (!quoteDate) {
  const m3 = folded.match(
    /\b(\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4})\b/i
  );
  if (m3) {
    let literal = m3[1]
      .replace(/fevrier/ig, 'février')
      .replace(/aout/ig, 'août')
      .replace(/decembre/ig, 'décembre');
    const tempDate = parseFrenchDate(literal);
    if (isValidDate(tempDate)) {
      quoteDate = tempDate;
    }
  }
}

// 4) Dernière chance : "le ..." (n'importe où)
if (!quoteDate) {
  const m4 = folded.match(
    /(?:^|\s)le\s+(\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4})\b/i
  );
  if (m4) {
    let literal = m4[1]
      .replace(/fevrier/ig, 'février')
      .replace(/aout/ig, 'août')
      .replace(/decembre/ig, 'décembre');
    const tempDate = parseFrenchDate(literal);
    if (isValidDate(tempDate)) {
      quoteDate = tempDate;
    }
  }
}

console.log('>> DATE DEVIS DETECTEE =', quoteDate ? quoteDate.toISOString() : 'AUCUNE');

    // Extraction du montant total
    const totalAmount = extractAmount(normalized);

    // ===== EXTRACTION CIBLÉE POUR FEUILLE 3 =====
    const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
// 1) Service bénéficiaire = première ligne "destinataire" en haut du devis
let sheet3Benef = '';
if (lines.length > 0) {
  // On prend la toute première ligne non vide du PDF
  sheet3Benef = lines[0].trim();
}

// Si toujours rien trouvé → on tente la ligne suivante (rare cas PDF corrompu)
if (!sheet3Benef && lines.length > 1) {
  sheet3Benef = lines[1].trim();
}
    
// Fonction FIABLE pour le libellé PDF
function extractPdfLibelle(lines) {
  const banned = /(adresse|agence|prefecture|drfip|rue|avenue|dossier|devis|responsable|email|telephone|chantier|lot|commande|facture|ville|interlocuteur)/i;
  const keywords = /(nettoyage|remplacement|réparation|reparation|fourniture|pose|étanchéité|etancheite|recherche|fuite|inspection|maintenance|travaux|intervention|entretien)/i;
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    const l = lines[i].trim();
    if (!l || l.length < 10) continue;
    if (banned.test(l)) continue;
    if ((l === l.toUpperCase() && keywords.test(l)) || (keywords.test(l) && l.length > 15)) {
      return l;
    }
  }
  return '';
}
let sheet3Libelle = extractPdfLibelle(lines);
console.log('Libellé PDF trouvé :', sheet3Libelle);
    
    // 3) Montant HT prioritaire
    function extractAmountHT(src) {
      const pat = [
        /TOTAL\s*HT[^0-9]*([\d\s.,]+)/i,
        /MONTANT\s*(?:HT|HORS\s*TVA)[^0-9]*([\d\s.,]+)/i,
        /PRIX\s*HT[^0-9]*([\d\s.,]+)/i
      ];
      for (const r of pat) {
        const m = src.match(r);
        if (m && m[1]) {
          const v = num(m[1]);
          if (!isNaN(v)) return v;
        }
      }
      return null;
    }
    const sheet3AmountHT = extractAmountHT(normalized) ?? totalAmount;
    
    console.log('Feuille3 -> Benef:', sheet3Benef, '| Libelle:', sheet3Libelle, '| HT:', sheet3AmountHT);

    // Extraction éventuelle du numéro de commande depuis le nom du fichier
    const matchCmd = req.file.originalname.match(/(\d{10})/);
    const linkedOrderNumber = matchCmd ? matchCmd[1] : null;

    // Log résumé
    console.log("=== Résumé PDF devis ===");
    console.log({
      fileName: req.file.originalname,
      quoteNumber,
      quoteDate,
      totalAmount,
      linkedOrderNumber,
      sheet3Benef,
      sheet3Libelle,
      sheet3AmountHT
    });

    res.json({
      fileName: req.file.originalname,
      quoteNumber,
      quoteDate: quoteDate ? quoteDate.toISOString() : null,
      totalAmount,
      linkedOrderNumber,
      sheet3Benef,
      sheet3Libelle,
      sheet3AmountHT
    });
  } catch (error) {
    console.error('Erreur parsing PDF devis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================
// ============ API GÉNÉRATION RAPPORT =======================
// ==========================================================

// Fusionne automatiquement les devis PDF et Excel s'ils ont été fournis séparément
// 🔥 FUSION CORRIGÉE : Enrichir les devis Excel avec les données PDF, SANS dupliquer
app.use((req, res, next) => {
  console.log('=== DEBUG FUSION MIDDLEWARE ===');
  console.log('quotes reçus?', req.body?.quotes ? req.body.quotes.length : 'undefined');
  
  // Si on reçoit un tableau "quotes" mélangé, on le sépare
  if (req.body && req.body.quotes && Array.isArray(req.body.quotes)) {
    const allQuotes = req.body.quotes;
    
    // Séparer Excel (ont des prestations) et PDF (pas de prestations)
    const excelQuotes = allQuotes.filter(q => q.prestations && q.prestations.length > 0);
    const pdfQuotes = allQuotes.filter(q => !q.prestations || q.prestations.length === 0);
    
    console.log('Excel détectés:', excelQuotes.length);
    console.log('PDF détectés:', pdfQuotes.length);
    
    if (excelQuotes.length > 0 && pdfQuotes.length > 0) {
      // Fusion : enrichir Excel avec données PDF
      const mergedQuotes = excelQuotes.map(excel => {
        const matchingPdf = pdfQuotes.find(pdf =>
          (excel.quoteNumber && pdf.quoteNumber && excel.quoteNumber === pdf.quoteNumber) ||
          (excel.linkedOrderNumber && pdf.linkedOrderNumber && excel.linkedOrderNumber === pdf.linkedOrderNumber)
        );

        if (matchingPdf) {
          console.log(`✓ Fusion ${excel.quoteNumber || excel.linkedOrderNumber}: Excel "${excel.sheet3Libelle}" + PDF "${matchingPdf.sheet3Libelle}"`);
          return {
            ...excel,
            quoteDate: excel.quoteDate || matchingPdf.quoteDate,
            sheet3Benef: matchingPdf.sheet3Benef || excel.sheet3Benef || '',
            sheet3Libelle: excel.sheet3Libelle || matchingPdf.sheet3Libelle || '', // ✅ Excel prioritaire
            sheet3AmountHT: excel.totalAmount || matchingPdf.sheet3AmountHT || 0
          };
        }

        return excel;
      });

      // Ajouter les PDF sans Excel correspondant
      const unmatchedPdf = pdfQuotes.filter(pdf => 
        !excelQuotes.find(excel =>
          (excel.quoteNumber && pdf.quoteNumber && excel.quoteNumber === pdf.quoteNumber) ||
          (excel.linkedOrderNumber && pdf.linkedOrderNumber && excel.linkedOrderNumber === pdf.linkedOrderNumber)
        )
      );

      req.body.quotes = [...mergedQuotes, ...unmatchedPdf];
      console.log('✓ Fusion terminée:', req.body.quotes.length, 'devis');
    }
  }
  
  next();
});// --- Fonction utilitaire pour parser une date JJ/MM/AAAA ---
function parseFrenchDateString(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const [_, d, mth, y] = m;
  const iso = `${y}-${mth.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const parsed = new Date(iso);
  return isNaN(parsed) ? null : parsed;
}

app.post('/api/generate-report', express.json({ limit: '50mb' }), (req, res) => {
  try {
    const orders = Array.isArray(req.body.orders) ? req.body.orders : [];
    const quotes = Array.isArray(req.body.quotes) ? req.body.quotes : [];
    // --- Construction d'une table "libellé Excel" par devis ---
const excelQuotesSrc = Array.isArray(req.body.quotes)
? req.body.quotes.filter(q => q.prestations && q.prestations.length > 0)
: [];

const excelLibellesByKey = new Map();

excelQuotesSrc.forEach(ex => {
const key =
  (ex.linkedOrderNumber && ex.linkedOrderNumber.toString().trim()) ||
  (ex.quoteNumber && ex.quoteNumber.toString().trim());
if (key && ex.sheet3Libelle) {
  excelLibellesByKey.set(key, ex.sheet3Libelle);
}
});

    const period = req.body.period || {};

    // --- 1. Normalisation fiable des dates (JJ/MM/AAAA, ISO ou numérique)
    const parseDate = (str) => {
      if (!str) return null;
      if (typeof str === 'number') return new Date(str);
      const s = String(str).trim();
      if (!s) return null;
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return new Date(s);
      const fr = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (fr) return new Date(`${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`);
      return null;
    };

    const periodStart = parseDate(period.start) || new Date('1900-01-01');
    const periodEnd   = parseDate(period.end)   || new Date('2999-12-31');

    console.log('\n========== GÉNÉRATION DU RAPPORT ==========');
    console.log('Commandes:', orders.length, 'Devis:', quotes.length);
    console.log('Période:', period.start, '->', period.end);

    const workbook = XLSX.utils.book_new();

    // =====================================================
    // FEUILLE 1 : Commandes dans la période
    // =====================================================
    const ordersData = [['N° Commande', 'Date', 'Service Bénéficiaire', 'Montant HT (€)']];
    const ordersInPeriod = orders.filter(o => {
      const d = parseDate(o.orderDate || o.date);
      return d && d >= periodStart && d <= periodEnd;
    });

    ordersInPeriod.forEach(o => {
      ordersData.push([
        o.orderNumber || 'N/A',
        o.orderDate || o.date || 'N/A',
        o.serviceContact || 'N/A',
        parseFloat(o.totalHT) || 0
      ]);
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(ordersData), 'Commandes');

    // =====================================================
    // FEUILLE 2 : Prestations de toutes les commandes filtrées
    // =====================================================
    const prestationsData = [[
      'N° Bon de commande', 'Service bénéficiaire', 'Code article du BPU',
      'Libellé', 'Unité', 'PU', '', '', 'Quantité', 'Montant HT', '', '', ''
    ]];

    // Pour chaque commande de la période
    ordersInPeriod.forEach(order => {
      // Récupère tous les devis liés à ce n° de commande
      const relatedQuotes = quotes.filter(q =>
        q.prestations &&
        q.prestations.length > 0 &&
        q.linkedOrderNumber &&
        q.linkedOrderNumber.toString().trim() === order.orderNumber.toString().trim()
      );

      // Si aucun devis lié → ligne vide avec juste le n° commande
      if (relatedQuotes.length === 0) {
        prestationsData.push([order.orderNumber, order.serviceContact, '', '', '', '', '', '', '', '', '', '', '']);
        return;
      }

      // Pour chaque devis lié
      relatedQuotes.forEach((quote, qIdx) => {
        quote.prestations.forEach((p, pIdx) => {
          const montant = p.quantity && p.unitPrice ? p.quantity * p.unitPrice : 0;
          prestationsData.push([
            qIdx === 0 && pIdx === 0 ? order.orderNumber : '',       // n° commande affiché une seule fois par bloc
            qIdx === 0 && pIdx === 0 ? order.serviceContact : '',     // idem pour service
            p.bpuCode || '',
            p.designation || '',
            p.unit || '',
            p.unitPrice || '',
            '',
            '',
            p.quantity || '',
            montant,
            '',
            '',
            ''
          ]);
        });
      });
    });

    const prestationsSheet = XLSX.utils.aoa_to_sheet(prestationsData);
    XLSX.utils.book_append_sheet(workbook, prestationsSheet, 'Prestations');

    // =====================================================
    // FEUILLE 3 : Devis sans commande DANS LA PÉRIODE
    // =====================================================
    const LOT_LABEL = 'Lot 12 - Charpente - couverture - Etanchéité';
    const quotesData = [['Lot', 'Service bénéficiaire', 'Libellé', 'Montant HT (€)']];
    let count = 0;

    quotes.forEach(q => {
      const qDate = parseDate(q.quoteDate);
      const qInPeriod = qDate && qDate >= periodStart && qDate <= periodEnd;

      // Si le devis n'est pas dans la période, on l'ignore
      if (!qInPeriod) return;

      // Trouve la commande liée à ce devis
      const linkedOrder = orders.find(o =>
        q.linkedOrderNumber && o.orderNumber?.toString().trim() === q.linkedOrderNumber.toString().trim()
      );

      // 🔥 LOGIQUE CORRIGÉE :
      let shouldDisplay = false;

      if (!linkedOrder) {
        // Cas 1 : Pas de commande du tout
        shouldDisplay = true;
        console.log(`✓ Devis ${q.quoteNumber} sans commande → affiché`);
      } else {
        // Cas 2 : Il y a une commande liée
        const orderDate = parseDate(linkedOrder.orderDate || linkedOrder.date);
        if (orderDate) {
          if (orderDate > periodEnd) {
            // La commande existe mais APRÈS la période → le devis doit apparaître
            shouldDisplay = true;
            console.log(`✓ Devis ${q.quoteNumber} avec commande du ${orderDate.toISOString().split('T')[0]} (hors période) → affiché`);
          } else if (orderDate >= periodStart && orderDate <= periodEnd) {
            // La commande est DANS la période → le devis ne doit PAS apparaître
            shouldDisplay = false;
            console.log(`✗ Devis ${q.quoteNumber} avec commande du ${orderDate.toISOString().split('T')[0]} (dans période) → masqué`);
          }
        }
      }

      if (shouldDisplay) {
        quotesData.push([
          LOT_LABEL,
          q.sheet3Benef || '',
          (() => {
            const key =
              (q.linkedOrderNumber && q.linkedOrderNumber.toString().trim()) ||
              (q.quoteNumber && q.quoteNumber.toString().trim());
            return (key && excelLibellesByKey.get(key)) || q.sheet3Libelle || '';
          })(),
                    (Number(q.sheet3AmountHT || q.totalAmount || 0))
            .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        ]);
        count++;
      }
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(quotesData), 'Devis sans commande');

    console.log(`✓ Feuille 1 : ${ordersInPeriod.length} commandes`);
    console.log(`✓ Feuille 2 : ${prestationsData.length - 1} lignes`);
    console.log(`✓ Feuille 3 : ${count} devis`);

    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res
      .set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition',`attachment; filename=rapport-${period.start || 'periode'}.xlsx`)
      .send(buf);

  } catch (e) {
    console.error('Erreur génération rapport:', e);
    res.status(500).json({ error: e.message });
  }
});
// ==========================================================
// ============ API GÉNÉRATION RAPPORT CLIENT ===============
// ==========================================================
app.post('/api/generate-client-report', upload.single('template'), async (req, res) => {
  try {
    // 1. Récupération des données
    const ordersRaw = req.body.orders;
    const quotesRaw = req.body.quotes;
    const periodRaw = req.body.period;

    const orders = typeof ordersRaw === 'string' ? JSON.parse(ordersRaw) : ordersRaw;
    const quotes = typeof quotesRaw === 'string' ? JSON.parse(quotesRaw) : quotesRaw;
    const period = typeof periodRaw === 'string' ? JSON.parse(periodRaw) : periodRaw;

    if (!req.file) {
      return res.status(400).json({ error: 'Template Excel manquant' });
    }

    console.log('\n========== GÉNÉRATION RAPPORT CLIENT ==========');
    console.log('Commandes:', orders.length);
    console.log('Devis:', quotes.length);
    console.log('Période:', period.start, '→', period.end);

    // 2. Charger le template avec ExcelJS (préserve TOUT le formatage)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    const worksheet = workbook.getWorksheet('Fiche Suivi Trimestriel');
    if (!worksheet) {
      return res.status(400).json({ error: 'Feuille "Fiche Suivi Trimestriel" introuvable' });
    }

    // 3. Remplir les dates de période
    worksheet.getCell('B10').value = period.start;
    worksheet.getCell('B11').value = period.end;

    // 4. Filtrer les données selon la période
    const parseDate = (str) => {
      if (!str) return null;
      if (typeof str === 'number') return new Date(str);
      const s = String(str).trim();
      if (!s) return null;
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return new Date(s);
      const fr = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (fr) return new Date(`${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`);
      return null;
    };

    const periodStart = parseDate(period.start) || new Date('1900-01-01');
    const periodEnd = parseDate(period.end) || new Date('2999-12-31');

    const ordersInPeriod = orders.filter(o => {
      const d = parseDate(o.orderDate || o.date);
      return d && d >= periodStart && d <= periodEnd;
    });

    // 5. Préparer les données Tableau 3 (Devis sans commande)
    const LOT_LABEL = 'Lot 12 - Charpente - couverture - Etanchéité';
    const quotesData = [];

    quotes.forEach(q => {
      const qDate = parseDate(q.quoteDate);
      const qInPeriod = qDate && qDate >= periodStart && qDate <= periodEnd;
      if (!qInPeriod) return;

      const linkedOrder = orders.find(o =>
        q.linkedOrderNumber && o.orderNumber?.toString().trim() === q.linkedOrderNumber.toString().trim()
      );

      let shouldDisplay = false;
      if (!linkedOrder) {
        shouldDisplay = true;
      } else {
        const orderDate = parseDate(linkedOrder.orderDate || linkedOrder.date);
        if (orderDate && orderDate > periodEnd) {
          shouldDisplay = true;
        }
      }

      if (shouldDisplay) {
        // ✅ Prioriser le libellé Excel sur le libellé PDF
        const key = (q.linkedOrderNumber && q.linkedOrderNumber.toString().trim()) ||
                    (q.quoteNumber && q.quoteNumber.toString().trim());
        
        // Chercher si un devis Excel existe avec ce même linkedOrderNumber ou quoteNumber
        const matchingExcel = quotes.find(exQ => 
          exQ.prestations && 
          exQ.prestations.length > 0 &&
          ((exQ.linkedOrderNumber && exQ.linkedOrderNumber.toString().trim() === key) ||
           (exQ.quoteNumber && exQ.quoteNumber.toString().trim() === key))
        );
        
        const libelle = (matchingExcel && matchingExcel.sheet3Libelle) || q.sheet3Libelle || '';
        
        quotesData.push([
          LOT_LABEL,
          q.sheet3Benef || '',
          libelle,  // ✅ Libellé Excel prioritaire
          Number(q.sheet3AmountHT || q.totalAmount || 0)
        ]);
      }
        });

    // 6. Préparer les données Tableau 2 (Prestations)
    const prestationsData = [];
    ordersInPeriod.forEach(order => {
      const relatedQuotes = quotes.filter(q =>
        q.prestations &&
        q.prestations.length > 0 &&
        q.linkedOrderNumber &&
        q.linkedOrderNumber.toString().trim() === order.orderNumber.toString().trim()
      );

      relatedQuotes.forEach(quote => {
        quote.prestations.forEach(p => {
          prestationsData.push([
            order.orderNumber || '',           // A: N° BC
            order.serviceContact || '',        // B: Service
            String(p.bpuCode || '').padStart(4, '0'), // ✅ Force 4 chiffres minimum
            p.designation || '',               // D: Libellé
            p.unit || '',                      // E: Unité
            Number(p.unitPrice) || 0,          // F: PU
            '',                                // G: Coef majoration
            '',                                // H: Coef remise
            Number(p.quantity) || 0,           // I: Quantité
            null,                              // J: Formule (sera ajoutée après)
            '',                                // K: Observations
            '',                                // L: Part sous-traitance
            ''                                 // M: Nom sous-traitant
          ]);
        });
      });
    });

    // 7. Préparer les données Tableau 1 (Commandes)
    const ordersData = ordersInPeriod.map(o => [
      LOT_LABEL,
      o.serviceContact || '',
      o.orderNumber || '',
      parseFloat(o.totalHT) || 0
    ]);

    // 8. Fonction d'insertion robuste avec ExcelJS
    function insertRowsExcelJS(ws, startRow, dataRows, hasFormula = false, formulaCol = null, moneyColumns = []) {
      if (dataRows.length === 0) return;
    
      console.log(`  → Insertion de ${dataRows.length} lignes à partir de la ligne ${startRow}`);
    
      // Copier une ligne vide du tableau pour récupérer le style (bordures, alignement)
      const templateRow = ws.getRow(startRow + 1);
      
      // Insérer les lignes vides
      ws.spliceRows(startRow, 0, ...Array(dataRows.length).fill([]));
    
      // Remplir chaque ligne
      dataRows.forEach((rowData, idx) => {
        const rowNumber = startRow + idx;
        const newRow = ws.getRow(rowNumber);
    
        rowData.forEach((value, colIdx) => {
          const colNumber = colIdx + 1; // ExcelJS commence à 1
          const cell = newRow.getCell(colNumber);
          const templateCell = templateRow.getCell(colNumber);
    
// ✅ Bordures complètes avec bordure droite épaisse sur dernière colonne
const isLastColumn = (colNumber === 4); // Colonne D (Montant HT) pour Tableau 1

cell.border = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { 
    style: isLastColumn ? 'medium' : 'thin',  // ✅ Épaisse si dernière colonne
    color: { argb: 'FF000000' } 
  }
};
          // ✅ Copier la police
          if (templateCell.font) {
            cell.font = { ...templateCell.font };
          }
    
          // ✅ Alignement : vertical centré + horizontal gauche + retour à la ligne auto
          cell.alignment = { 
            vertical: 'middle',
            horizontal: 'left',
            wrapText: true
          };
// ✅ FORMULE avec numéro de ligne Excel (base 1, pas base 0)
if (hasFormula && colIdx === formulaCol - 1) {
  const excelRowNumber = rowNumber;  // rowNumber = 39, 40, 41, 42...
  cell.value = { formula: `I${excelRowNumber}*F${excelRowNumber}` };
  cell.numFmt = '#,##0.00 €';
  console.log(`Ligne ${excelRowNumber}: Formule = I${excelRowNumber}*F${excelRowNumber}`);  // ✅ DEBUG
}
// ✅ 2. Colonnes montant (sauf celle avec formule)
else if (moneyColumns.includes(colNumber)) {
  cell.numFmt = '#,##0.00 €';
  cell.value = typeof value === 'number' ? value : 0;
} 
// ✅ 3. Valeur normale
else {
  // ✅ CORRECTION : Forcer format texte pour la colonne C (codes BPU)
  if (colNumber === 3 && typeof value === 'string' && /^\d+$/.test(value)) {
    // Si c'est la colonne C (Code BPU) et que c'est un nombre en string
    cell.value = value;
    cell.numFmt = '@'; // ✅ Format TEXTE
  } else {
    cell.value = value;
  }
}        });
    
        newRow.commit();
      });
    }

// 9. Insérer Tableau 3 (ligne 50) - Colonne D = Montant HT avec €
console.log('Insertion Tableau 3 (Devis sans commande)');
insertRowsExcelJS(worksheet, 50, quotesData, false, null, [4]);

// 10. Insérer Tableau 2 (ligne 39)
console.log('Insertion Tableau 2 (Prestations)');
insertRowsExcelJS(worksheet, 39, prestationsData, false, null, [6], 13);  // ✅ Sans formule d'abord

// 11. Insérer Tableau 1 (ligne 31) - Colonne D = Montant HT avec €
console.log('Insertion Tableau 1 (Commandes)');
insertRowsExcelJS(worksheet, 31, ordersData, false, null, [4]);

// ✅ CORRECTION : Formule de somme Tableau 1 - Écraser la formule du template
console.log('Correction formule somme Tableau 1...');
const startOrdersRow = 31;
const endOrdersRow = startOrdersRow + ordersData.length - 1;

// Position de la formule du template après insertions (originalement D34)
const templateFormula1Row = 34 + ordersData.length;

// Écraser la formule du template avec la bonne plage
const totalOrdersCell = worksheet.getCell(`D${templateFormula1Row}`);
totalOrdersCell.value = { formula: `SUM(D${startOrdersRow}:D${endOrdersRow})` };
totalOrdersCell.numFmt = '#,##0.00 €';
totalOrdersCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

console.log(`✅ Tableau 1 : Formule écrasée à D${templateFormula1Row} = SUM(D${startOrdersRow}:D${endOrdersRow})`);

console.log('Ajout des formules colonne J (après toutes les insertions)...');
console.log('Recalage de la somme du Tableau 3 (Devis sans commande)...');

// ✅ CORRECTION : Calcul de la zone d'impression TOUJOURS effectué
// Calcul de la dernière ligne utilisée dans le document
let lastContentRow;

// Ligne de départ réelle du tableau 3 après TOUTES les insertions
const startQuotesRow = 50 + prestationsData.length + ordersData.length;

// Ligne de fin du tableau 3
const endQuotesRow = startQuotesRow + quotesData.length - 1;

// Position de la formule du template après TOUTES les insertions (originalement D54)
const templateFormula3Row = 54 + ordersData.length + prestationsData.length + quotesData.length;

// Écraser la formule du template avec la bonne plage
const totalCell = worksheet.getCell(`D${templateFormula3Row}`);
totalCell.value = { formula: `SUM(D${startQuotesRow}:D${endQuotesRow})` };
totalCell.numFmt = '#,##0.00 €';
totalCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

console.log(`✅ Tableau 3 : Formule écrasée à D${templateFormula3Row} = SUM(D${startQuotesRow}:D${endQuotesRow})`);

lastContentRow = templateFormula3Row;

// ✅ Définir la zone d'impression TOUJOURS (avec 19 lignes de marge)
const printEndRow = lastContentRow + 19;
worksheet.pageSetup.printArea = `A1:M${printEndRow}`;
worksheet.pageSetup.fitToPage = false; // pas de redimensionnement auto
worksheet.pageSetup.fitToHeight = undefined;
worksheet.pageSetup.fitToWidth = undefined;

console.log(`Zone d'impression ajustée dynamiquement : A1:M${printEndRow} (dernière ligne de contenu: ${lastContentRow})`);

// ✅ Formules du tableau 2
const startPrestationsRow = 39 + ordersData.length;
const endPrestationsRow = startPrestationsRow + prestationsData.length - 1;

for (let row = startPrestationsRow; row <= endPrestationsRow; row++) {
  const cellJ = worksheet.getCell(`J${row}`);
  cellJ.value = { formula: `I${row}*F${row}` };
  cellJ.numFmt = '#,##0.00 €';
  console.log(`J${row} = I${row}*F${row}`);
}
    // 10. Générer le fichier Excel
    const buffer = await workbook.xlsx.writeBuffer();

    res
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename=rapport-client-${period.start}.xlsx`)
      .send(Buffer.from(buffer));

    console.log('✅ Rapport client généré avec succès (ExcelJS)');

  } catch (error) {
    console.error('❌ Erreur génération rapport client:', error);
    res.status(500).json({ error: error.message });
  }
});const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));




