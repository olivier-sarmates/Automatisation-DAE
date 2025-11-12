/**
 * Routes pour les commandes (BDC)
 */

const express = require('express');
const router = express.Router();
const { parseOrderPDF } = require('../services/pdfOrderParser');

/**
 * POST /api/parse-order-pdf
 * Parse un PDF de bon de commande
 */
router.post('/parse-order-pdf', async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const result = await parseOrderPDF(req.file.buffer, req.file.originalname);
    res.json(result);

  } catch (error) {
    console.error('Erreur parsing PDF commande:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
