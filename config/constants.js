/**
 * Constantes de l'application
 */

module.exports = {
  LOT_LABEL: 'Lot 12 - Charpente - couverture - Etanchéité',

  FRENCH_MONTHS: {
    'janvier': '01',
    'février': '02',
    'mars': '03',
    'avril': '04',
    'mai': '05',
    'juin': '06',
    'juillet': '07',
    'août': '08',
    'septembre': '09',
    'octobre': '10',
    'novembre': '11',
    'décembre': '12'
  },

  BPU_SHEETS: ['BPU DAE', 'BPU TREMBLAY'],

  BANNED_KEYWORDS: /(adresse|agence|prefecture|drfip|rue|avenue|dossier|devis|responsable|email|telephone|chantier|lot|commande|facture|ville|interlocuteur)/i,

  WORK_KEYWORDS: /(nettoyage|remplacement|réparation|reparation|fourniture|pose|étanchéité|etancheite|recherche|fuite|inspection|maintenance|travaux|intervention|entretien)/i
};
