# Déploiement de l'application

## Hébergement

L'application est déployée sur **Coolify** (auto-hébergé, `coolify.sarmates.com`) à partir de la branche **`main`** du dépôt GitHub.

- **Build pack** : Nixpacks (Node.js) → `npm install` puis `npm start`
- **Port** : 3000
- **HTTPS** : automatique (Coolify)

## Variables d'environnement

À définir **dans Coolify** (jamais dans le code ni sur GitHub) :

| Variable | Rôle | Exemple |
|----------|------|---------|
| `ADMIN_USER` | Identifiant de connexion | `admin` |
| `ADMIN_PASSWORD` | Mot de passe de connexion | *(à définir)* |
| `FILE_SIZE_LIMIT` | Taille max des fichiers (Mo) | `50` |

## Déploiement automatique

Un webhook GitHub est configuré : **tout `git push` sur la branche `main` déclenche automatiquement un redéploiement** sur Coolify.

## Lancement en local (pour test)

- Double-cliquer sur `Demarrer l'application.bat`, ou
- En ligne de commande : `npm install` puis `npm start`, puis ouvrir http://localhost:3000
