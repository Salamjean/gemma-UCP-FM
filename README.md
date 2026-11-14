# Gemma — Gestion des patients

- `frontend/` : React + Vite + TypeScript + React Router + Framer Motion
- `backend/` : NestJS — microservice branché sur la **même base MySQL que le projet Laravel `gemma`**

## Lancer le projet

Prérequis : WAMP démarré (MySQL sur `127.0.0.1:3306`, base `gemma`).

```bash
# Terminal 1 : API sur http://localhost:3000/api
cd backend
npm run start:dev

# Terminal 2 : site sur http://localhost:5173
cd frontend
npm run dev
```

Le projet Laravel de référence est **`projet gemma/gemma`** (même base `gemma`).

La page Connexion utilise **les comptes de Laravel** (mêmes emails, mêmes mots de passe), mais **seuls les rôles `super`, `hospital`, `doctor` et `infirmier`** peuvent se connecter sur cette application.

## Base de données (partagée avec Laravel)

- Accès dans `backend/.env` (copier `backend/.env.example` sur un nouveau poste) — mêmes valeurs que le `.env` de Laravel.
- **Laravel reste propriétaire de la structure** (ses migrations). Dans NestJS, `synchronize` est désactivé :
  il ne crée, ne modifie et ne supprime jamais de table.
- Connexion = mêmes règles que Laravel (`CustomAuthController::roleResponse`), limitée aux rôles autorisés :
  - rôle dans `ALLOWED_ROLES` (`super`, `hospital`, `doctor`, `infirmier`) — les autres sont refusés
  - utilisateur non supprimé (`users.deleted_at`)
  - mot de passe bcrypt de Laravel
  - profil lié au rôle (`doctors`, `infirmiers`, `hospitals`…) existant, avec `status != 1` et `delete != 1`
  - le rôle `super` n'a pas de vérification de profil
- Après connexion, le backend renvoie un jeton JWT. Les routes protégées utilisent `@UseGuards(JwtAuthGuard)`
  (exemple : `GET /api/auth/me`).

| Je veux modifier | Fichier |
|---|---|
| Les accès à la base / la durée des sessions / le dossier des images Laravel | `backend/.env` |
| La connexion à MySQL | `backend/src/database/database.module.ts` |
| La table `users` vue par NestJS | `backend/src/modules/users/user.entity.ts` |
| Les rôles autorisés à se connecter (`ALLOWED_ROLES`) et leur table de profil | `backend/src/modules/users/role-profiles.ts` |
| Les règles de connexion | `backend/src/modules/auth/auth.service.ts` |

## Images à ajouter

Déposer les fichiers dans `frontend/public/images/` avec **exactement** ces noms :

| Fichier | Rôle |
|---|---|
| `logo.jpg` | Logo Gemma (menu + icône d'onglet + loader) ✅ déjà en place |
| `hero-famille.jpg` | Famille éclaircie, centrée derrière les textes de l'accueil ✅ déjà en place |
| `hero-infirmiere.jpg` | Infirmière en bas à droite de l'accueil ✅ déjà en place |
| `auth-background.jpg` | Fond des pages Connexion / Mot de passe oublié ✅ déjà en place |

## Je veux modifier… → j'ouvre…

| Je veux modifier | Fichier / dossier |
|---|---|
| Les couleurs, les polices, les espacements | `frontend/src/styles/variables.css` |
| Les chemins des images, les coordonnées, les liens du menu | `frontend/src/config/site.ts` |
| La liste des pages (URL → page) | `frontend/src/app/App.tsx` |
| La page **Accueil** (assemblage des sections) | `frontend/src/pages/Home/Accueil/Accueil.tsx` |
| Le bandeau principal de l'accueil (titre, images) | `frontend/src/pages/Home/Accueil/Hero/` |
| La page **À propos** | `frontend/src/pages/Home/APropos/` |
| La page **Contact** | `frontend/src/pages/Home/Contact/` |
| La page **Connexion** (champs, case « Se souvenir de moi », bouton) | `frontend/src/pages/Auth/Connexion/` |
| La page **Mot de passe oublié** | `frontend/src/pages/Auth/MotDePasseOublie/` |
| Le style des champs / du bouton rouge des pages Auth | `frontend/src/pages/Auth/AuthForm.module.css` |
| L'image de fond + la carte blanche + le logo des pages Auth | `frontend/src/layouts/AuthLayout/` |
| La page 404 | `frontend/src/pages/NotFound/` |
| Le menu du haut | `frontend/src/components/Navbar/` |
| Le bouton bleu | `frontend/src/components/Button/` |
| Le loader (écran de chargement avec le logo) | `frontend/src/components/Loader/` (durée : `frontend/src/hooks/usePreload.ts`) |
| L'animation entre deux pages | `frontend/src/components/PageTransition/` |
| L'animation d'apparition des blocs | `frontend/src/components/Reveal/` |
| L'animation des titres | `frontend/src/components/AnimatedTitle/` |
| Les appels à l'API | `frontend/src/services/api.ts` |
| La connexion (vérification email / mot de passe) | `backend/src/modules/auth/auth.service.ts` |
| Ce qui se passe à l'envoi d'un message de contact | `backend/src/modules/contact/contact.service.ts` |

Les pages sont rangées par espace :
- `pages/Home/` : pages publiques (Accueil, À propos, Contact)
- `pages/Auth/` : authentification (Connexion, Mot de passe oublié…) — sans navbar, dans `layouts/AuthLayout`
- `pages/Super/`, `pages/Hospital/`, `pages/Doctor/`, `pages/Infirmier/` : **un dossier par utilisateur**, voir ci-dessous

## Espaces connectés : un dossier par utilisateur, un dossier par module

Après connexion, chaque utilisateur arrive dans son espace (sidebar + barre du haut, comme Laravel) :

| Utilisateur | Adresse | Dossier frontend | Dossier backend |
|---|---|---|---|
| Super admin | `/super` | `frontend/src/pages/Super/` | `backend/src/modules/super/` |
| Hôpital | `/hopital` | `frontend/src/pages/Hospital/` | `backend/src/modules/hospital/` |
| Médecin / Sage-femme | `/medecin` | `frontend/src/pages/Doctor/` | `backend/src/modules/doctor/` |
| Infirmier | `/infirmier` | `frontend/src/pages/Infirmier/` | `backend/src/modules/infirmier/` |

Dans chaque dossier utilisateur :
- `<role>.menu.tsx` : **le menu de la sidebar ET les routes** (une seule source). Les conditions de Laravel y sont
  reprises : sage-femme / médecin (type d'agent), infirmier « Soins » ou « Consultations » (service 4), téléconsultation.
- un dossier par module du menu (ex. `Super/Hopital/`), avec un fichier par page (`Liste.tsx`, `Ajouter.tsx`…).
  Chaque page indique la route Laravel équivalente. Les pages pas encore développées affichent « en cours de développement ».

```
pages/Super/
├── super.menu.tsx
├── TableauDeBord/        ✅ cartes + graphiques (données réelles, composants dans components/Statistiques)
│   ├── TableauDeBord.tsx
├── Hopital/              ✅ Liste/ (tableau + actions), Ajouter/, Modifier/, Supervision/, HopitalForm/ (formulaire partagé)
├── Reglages/             ✅ Icones.tsx
├── NotificationsPush/    ✅ ListeEnvois/, NouvelleDiffusion/ (+ aperçu téléphone), Detail/, notifications.config.ts
└── LogsAudit/            ✅ JournalErreurs/ (onglets JournalAudit.tsx + LogsLaravel.tsx)
```

| Je veux modifier | Fichier / dossier |
|---|---|
| La sidebar (logo, carte orange, menu dépliable) | `frontend/src/layouts/DashboardLayout/Sidebar/` |
| La barre du haut (bouton menu, « Se déconnecter ») | `frontend/src/layouts/DashboardLayout/Topbar/` |
| Le fond à motif, le fil d'Ariane | `frontend/src/layouts/DashboardLayout/` |
| Le menu d'un utilisateur | `frontend/src/pages/<Role>/<role>.menu.tsx` |
| Le tableau de bord du super admin | `frontend/src/pages/Super/TableauDeBord/` + `backend/src/modules/super/tableau-de-bord/` |
| **Super > Hôpital** : liste, ajout, modification, activer/désactiver, téléconsultation, supervision | `frontend/src/pages/Super/Hopital/` + `backend/src/modules/super/hopital/` |
| Les règles du formulaire d'ajout d'hôpital | `backend/src/modules/super/hopital/dto/create-hopital.dto.ts` (+ `valider()` dans `Ajouter.tsx`) |
| **Super > Notifications Push** : liste des envois, nouvelle diffusion, détail, relance, suppression | `frontend/src/pages/Super/NotificationsPush/` + `backend/src/modules/super/notifications-push/` |
| Les catégories / cibles de diffusion (libellés, icônes, couleurs) | `frontend/src/pages/Super/NotificationsPush/notifications.config.ts` |
| L'envoi Firebase (FCM) | `backend/src/modules/super/notifications-push/fcm.service.ts` (clé : `FIREBASE_CREDENTIALS` ou `storage/app/firebase-service-account.json` de Laravel) |
| **Super > Logs & Audit** : journal d'audit (filtres, export Excel) + logs `laravel.log` | `frontend/src/pages/Super/LogsAudit/JournalErreurs/` + `backend/src/modules/super/logs-audit/` |
| L'écriture dans le journal d'audit (`audit_logs`, comme `AuditLogService` de Laravel) | `backend/src/common/audit/audit.service.ts` |
| Les chemins vers le projet Laravel (logs, clé Firebase) | `backend/src/common/laravel-paths.ts` |
| Le style commun des pages d'espace (titres, filtres, tableaux, badges, compteurs) | `frontend/src/styles/espace.module.css` |
| La liste déroulante avec recherche (partagée) | `frontend/src/components/SelectRecherche/` |
| La pagination (partagée) | `frontend/src/components/Pagination/` |
| La fenêtre de confirmation (partagée) | `frontend/src/components/ConfirmDialog/` |
| Les pages ouvertes depuis un bouton (pas dans la sidebar) | `hiddenPages` dans `pages/<Role>/<role>.menu.tsx` |
| **Hôpital > Services** : liste, ajout (catalogue ou nouveau), fiche, modification des actes et prix | `frontend/src/pages/Hospital/Services/` + `backend/src/modules/hospital/services/` |
| Le tableau des actes médicaux et prix (partagé Ajouter / Modifier) | `frontend/src/pages/Hospital/Services/EditeurActes/` |
| **Hôpital > Assurances** : liste, ajout, modification (formulaire + simulation) | `frontend/src/pages/Hospital/Assurances/` + `backend/src/modules/hospital/assurances/` |
| **Hôpital > Spécialités médicales** : liste, ajout (suggestions), modification | `frontend/src/pages/Hospital/SpecialitesMedicales/` + `backend/src/modules/hospital/specialites-medicales/` |
| **Hôpital > Personnel de santé** : listes (médecins, sages-femmes, infirmiers), ajout en 3 étapes, modification, chef, statut | `frontend/src/pages/Hospital/PersonnelSante/` + `backend/src/modules/hospital/personnel-sante/` |
| Le formulaire d'un agent (étapes, champs, planning, aperçu) | `frontend/src/pages/Hospital/PersonnelSante/AgentForm/` |
| Les types d'agents (libellés, icônes, préfixes de matricule) | `frontend/src/pages/Hospital/PersonnelSante/personnel.config.ts` |
| **Hôpital > Hospitalisation > Gestion des chambres** : chambres individuelles / collectives, lits, prix par jour | `frontend/src/pages/Hospital/Hospitalisation/Chambres/` + `backend/src/modules/hospital/hospitalisation/chambres.service.ts` |
| **Hôpital > Hospitalisation > Hospitalisations / Observations** (suivi en lecture, créées par les médecins) | `frontend/src/pages/Hospital/Hospitalisation/Suivi/` + `backend/src/modules/hospital/hospitalisation/suivi.service.ts` |
| **Infirmier > Tableau de bord** (salutation, 2 boutons d'accueil, file d'attente, télémédecine, hospitalisés) | `frontend/src/pages/Infirmier/TableauDeBord/` |
| **Infirmier > Inscrire un patient / Rechercher et affecter** (consultation créée directement, sans caisse) | `frontend/src/pages/Infirmier/Accueil/` + `backend/src/modules/infirmier/gestion-patients/accueil.service.ts` |
| Le badge de compteur d'une entrée de la sidebar (ex. Télémédecine en attente) | `badge` dans `pages/<Role>/<role>.menu.tsx` (affiché par `layouts/DashboardLayout/Sidebar/`) |
| L'hôpital du compte connecté (utilisé par tous les modules hôpital) | `backend/src/common/hopital-courant.ts` |
| Les formats de montant (FCFA) et de date | `frontend/src/services/format.ts` |
| Le tableau de bord de l'hôpital | `frontend/src/pages/Hospital/TableauDeBord/` + `backend/src/modules/hospital/tableau-de-bord/` |
| Les cartes chiffrées / graphiques (partagés) | `frontend/src/components/Statistiques/` + `backend/src/common/statistiques.ts` |
| La session (connexion, déconnexion, utilisateur connecté) | `frontend/src/context/AuthContext.tsx` |
| Les libellés de rôle, l'avatar | `frontend/src/config/roles.ts` |

**Ajouter une page à un module** : créer le fichier dans le dossier du module (ex. `pages/Super/Hopital/Modifier.tsx`),
l'exporter dans son `index.ts`, puis l'ajouter dans `super.menu.tsx`. La route est créée automatiquement.

**Ajouter une route backend pour un utilisateur** : créer le dossier du module dans `backend/src/modules/<role>/`
(ex. `super/hopital/`), protéger le contrôleur avec `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')`,
puis l'importer dans `<role>.module.ts`.

**Images (photos des hôpitaux, avatars…)** : partagées avec Laravel. Le backend les enregistre dans
`<LARAVEL_PUBLIC_PATH>/assets/uploads/<dossier>/` (comme Laravel) et les sert sur `/api/uploads/<dossier>/<fichier>`.
Réglage : `LARAVEL_PUBLIC_PATH` dans `backend/.env` (dossier `public/` du projet Laravel).

Chaque dossier de page contient toujours :
- `NomPage.tsx` : le contenu et les animations
- `NomPage.module.css` : le style de cette page uniquement
- `index.ts` : l'export

Chaque module du backend contient toujours :
- `*.controller.ts` : les routes (URL)
- `*.service.ts` : la logique
- `dto/` : la forme des données reçues (validées automatiquement)

## Ajouter une page

1. Créer son dossier dans `frontend/src/pages/Home/` (page publique) ou `frontend/src/pages/Auth/` (authentification)
2. Ajouter son chemin dans `ROUTES` (`frontend/src/config/site.ts`) et, si besoin, dans `NAV_LINKS`
3. Ajouter une `<Route>` dans `frontend/src/app/App.tsx`

## Ajouter un module au backend

```bash
cd backend
npx nest g resource modules/nom-du-module
```

## ⚠️ Avant la mise en production

- Créer un utilisateur MySQL dédié à NestJS (pas `root`), avec seulement les droits nécessaires.
- Mettre un `JWT_SECRET` long et différent dans le `.env` du serveur.
- Les messages de contact sont encore gardés en mémoire (perdus au redémarrage) : aucune table ne leur est
  dédiée dans la base Laravel, et NestJS ne crée pas de table lui-même.
