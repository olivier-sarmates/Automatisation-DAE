/**
 * Tests pour l'extraction de montants
 */

const { extractAmount, extractAmountHT } = require('../../utils/amountExtractor');

describe('amountExtractor', () => {
  describe('extractAmount', () => {
    test('devrait extraire un montant avec "montant"', () => {
      const text = 'Le montant total est de 1 250,50 €';
      const result = extractAmount(text);
      expect(result).toBe(1250.50);
    });

    test('devrait extraire un montant avec "total"', () => {
      const text = 'Total : 3500,00 €';
      const result = extractAmount(text);
      expect(result).toBe(3500.00);
    });

    test('devrait extraire un montant TTC', () => {
      const text = 'Prix: 2 450 € TTC';
      const result = extractAmount(text);
      expect(result).toBe(2450);
    });

    test('devrait gérer les espaces insécables', () => {
      const text = 'Montant: 15\u00A0000,00 €';
      const result = extractAmount(text);
      expect(result).toBe(15000.00);
    });

    test('devrait retourner null si aucun montant trouvé', () => {
      expect(extractAmount('Aucun montant ici')).toBeNull();
      expect(extractAmount('')).toBeNull();
    });
  });

  describe('extractAmountHT', () => {
    test('devrait extraire un TOTAL HT', () => {
      const text = 'TOTAL HT : 5 000,00';
      const result = extractAmountHT(text);
      expect(result).toBe(5000.00);
    });

    test('devrait extraire un MONTANT HT', () => {
      const text = 'MONTANT HT : 2500,50';
      const result = extractAmountHT(text);
      expect(result).toBe(2500.50);
    });

    test('devrait extraire un MONTANT HORS TVA', () => {
      const text = 'MONTANT HORS TVA : 1 200,00';
      const result = extractAmountHT(text);
      expect(result).toBe(1200.00);
    });

    test('devrait retourner null si aucun montant HT trouvé', () => {
      expect(extractAmountHT('Aucun montant HT')).toBeNull();
      expect(extractAmountHT('')).toBeNull();
    });
  });
});
