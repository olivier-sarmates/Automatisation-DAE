/**
 * Tests pour les fonctions de parsing de dates
 */

const { parseFrenchDate, parseFrenchDateString, parseDate } = require('../../utils/dateParser');

describe('dateParser', () => {
  describe('parseFrenchDate', () => {
    test('devrait parser une date au format DD.MM.YYYY', () => {
      const result = parseFrenchDate('05.09.2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(8); // Septembre = 8 (0-indexed)
      expect(result.getDate()).toBe(5);
    });

    test('devrait parser une date au format "DD mois YYYY"', () => {
      const result = parseFrenchDate('31 juillet 2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(6); // Juillet = 6
      expect(result.getDate()).toBe(31);
    });

    test('devrait parser les mois avec accents', () => {
      const result = parseFrenchDate('27 août 2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(7); // Août = 7
    });

    test('devrait retourner null pour une date invalide', () => {
      expect(parseFrenchDate('invalid')).toBeNull();
      expect(parseFrenchDate('')).toBeNull();
      expect(parseFrenchDate(null)).toBeNull();
    });
  });

  describe('parseFrenchDateString', () => {
    test('devrait parser une date au format JJ/MM/AAAA', () => {
      const result = parseFrenchDateString('15/03/2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2); // Mars = 2
      expect(result.getDate()).toBe(15);
    });

    test('devrait parser une date au format J/M/AAAA', () => {
      const result = parseFrenchDateString('5/9/2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    test('devrait retourner null pour un format invalide', () => {
      expect(parseFrenchDateString('2025-03-15')).toBeNull();
      expect(parseFrenchDateString('invalid')).toBeNull();
    });
  });

  describe('parseDate', () => {
    test('devrait parser un timestamp numérique', () => {
      const timestamp = new Date('2025-03-15').getTime();
      const result = parseDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    test('devrait parser une date ISO', () => {
      const result = parseDate('2025-03-15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    test('devrait parser une date française DD/MM/YYYY', () => {
      const result = parseDate('15/03/2025');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    test('devrait parser une date française DD.MM.YYYY', () => {
      const result = parseDate('15.03.2025');
      expect(result).toBeInstanceOf(Date);
    });

    test('devrait retourner null pour une entrée invalide', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate(null)).toBeNull();
      expect(parseDate('invalid')).toBeNull();
    });
  });
});
