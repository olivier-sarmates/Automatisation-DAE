# Automatisation DAE - Déduplication Devis-Commandes

Application web pour la déduplication et le suivi trimestriel des devis et commandes du Lot 12 (Charpente, Couverture, Étanchéité).

## 🚀 Fonctionnalités

- **Zone de dépôt unique** : Chargez tous vos fichiers en une seule fois (BDC PDF, Devis Excel, Devis PDF)
- **Détection automatique** : L'application identifie automatiquement le type de chaque fichier
- **Parsing intelligent** : Extraction automatique des données (numéros, dates, montants, services)
- **Génération de rapports** : Rapports Excel avec déduplication automatique
- **Interface moderne** : Interface web responsive avec suivi en temps réel

## 📋 Prérequis

- Node.js >= 14.x
- npm >= 6.x

## 🔧 Installation

1. **Cloner le dépôt**
   ```bash
   git clone https://github.com/olivier-sarmates/Automatisation-DAE.git
   cd Automatisation-DAE
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer les variables d'environnement**

   Créez un fichier `.env` à la racine du projet :
   ```bash
   cp .env.example .env
   ```

   Éditez le fichier `.env` et configurez vos paramètres :
   ```env
   PORT=3000
   ADMIN_USER=admin
   ADMIN_PASSWORD=votre_mot_de_passe_securise
   FILE_SIZE_LIMIT=50
   ```

   ⚠️ **IMPORTANT** : Ne commitez JAMAIS le fichier `.env` sur Git !

## 🎯 Utilisation

### Démarrage du serveur

**Mode production :**
```bash
npm start
```

**Mode développement (avec rechargement automatique) :**
```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3000` (ou le port configuré dans `.env`)

### Accès à l'application

1. Ouvrez votre navigateur sur `http://localhost:3000`
2. Authentifiez-vous avec vos identifiants (configurés dans `.env`)
3. Chargez vos fichiers :
   - BDC (Bons de Commande) en PDF
   - Devis en Excel (.xlsx)
   - Devis en PDF
4. Chargez votre template Excel vierge
5. Sélectionnez la période de suivi
6. Cliquez sur "Générer le rapport client"

## 🧪 Tests

**Lancer les tests :**
```bash
npm test
```

**Mode watch (relance automatique) :**
```bash
npm run test:watch
```

**Avec couverture de code :**
```bash
npm run test:coverage
```

## 📁 Structure du projet

```
Automatisation-DAE/
├── public/
│   └── index.html          # Interface web
├── utils/
│   ├── dateParser.js       # Parsing de dates françaises
│   └── amountExtractor.js  # Extraction de montants
├── services/
│   └── pdfOrderParser.js   # Parsing des BDC PDF
├── routes/
│   └── orders.js           # Routes API pour les commandes
├── config/
│   └── constants.js        # Constantes de l'application
├── __tests__/              # Tests unitaires et d'intégration
├── server.js               # Serveur principal
├── package.json
├── .env.example            # Template de configuration
└── README.md
```

## 🔒 Sécurité

- ✅ Authentification basique
- ✅ Credentials en variables d'environnement
- ✅ Validation des fichiers uploadés
- ✅ Limite de taille de fichiers configurable
- ✅ CORS configuré

## 🐛 Dépannage

### Le serveur ne démarre pas

Vérifiez que :
- Les dépendances sont installées : `npm install`
- Le port n'est pas déjà utilisé
- Le fichier `.env` existe et est correct

### Erreur d'authentification

Vérifiez les credentials dans votre fichier `.env`

### Les fichiers ne se téléchargent pas

Vérifiez :
- La taille des fichiers (limite configurable dans `.env`)
- Le format des fichiers (PDF, XLSX uniquement)
- Les logs du serveur pour identifier l'erreur

## 📝 Notes de version

### v1.1.0 (Dernière version)
- ✨ Interface simplifiée avec zone de dépôt unique
- ✨ Détection automatique du type de fichier
- 🔒 Configuration par variables d'environnement
- 📦 Refactorisation en modules
- ✅ Tests unitaires ajoutés
- 📝 Documentation complète

### v1.0.0
- 🎉 Version initiale
- Parsing PDF et Excel
- Génération de rapports
- Interface web basique

## 📄 Licence

Propriétaire - Sarmates 2025

## 👥 Support

Pour toute question ou problème, contactez l'équipe de développement.

---

**Développé avec ❤️ pour DAE**
