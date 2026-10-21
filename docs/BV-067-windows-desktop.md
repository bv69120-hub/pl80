# BV Expédition Pro pour Windows

## Installation contrôlée

Le packaging produit `apps/desktop/release/BV-Expedition-Pro-Setup.exe`. L’installateur crée un raccourci sur le Bureau et dans le menu Démarrer. Il n’est pas nécessaire d’activer le démarrage avec Windows : cette option est désactivée par défaut et se règle dans **Paramètres**.

Ne lancez pas l’installateur sur le poste principal sans validation préalable. Le build de l’installateur n’installe pas l’application et ne lance aucun travail d’impression.

Au premier démarrage, créez un compte administrateur avec un mot de passe choisi par l’administrateur. Aucun compte ou mot de passe prédéfini n’est inclus dans l’application.

## Données locales

La base opérationnelle est conservée dans `%APPDATA%\BV Expedition Pro\data\bv-expedition.db`. Une base existante à cet emplacement n’est jamais remplacée ; les mises à jour de schéma sont additives. Les fichiers d’historique sont enregistrés sous `%APPDATA%\BV Expedition Pro\print-history`.

### Clé de signature des sessions

Au premier démarrage, l’application génère une clé JWT aléatoire de 256 bits dans `%APPDATA%\BV Expedition Pro\security\jwt-secret` et crée le marqueur `%APPDATA%\BV Expedition Pro\security\jwt-secret.initialized`. L’application limite les autorisations Windows de ce dossier et de ces fichiers à l’utilisateur courant, SYSTEM et Administrateurs, puis vérifie ces ACL avant de démarrer l’API. La clé n’est pas distribuée avec l’installateur et n’est jamais lue depuis un `.env` par l’application empaquetée. Après cette première initialisation, une clé absente, invalide ou impossible à protéger bloque le démarrage; elle n’est pas régénérée automatiquement.

Conservez ce fichier privé dans les sauvegardes autorisées si vous voulez garder les sessions actives après restauration. Une nouvelle clé ne modifie pas les comptes ni leurs mots de passe, mais invalide tous les jetons de session déjà émis; les utilisateurs devront se reconnecter. Ne copiez pas la clé dans le dépôt, un journal ou un ticket d’incident.

L’API et l’interface Web locales écoutent par défaut uniquement sur `127.0.0.1`. Pour permettre un accès LAN, ajoutez explicitement dans `%APPDATA%\BV Expedition Pro\.env` `API_ALLOW_LAN=true`, `API_HOST=0.0.0.0` et `API_ALLOWED_ORIGINS` contenant les origines Web exactes, séparées par des virgules. N’activez ce mode que si l’accès LAN est nécessaire et approuvé. Un changement d’adresse IP ou de port exige de mettre à jour ces origines. Les origines `null` et `file://` sont refusées.

Un QR en mode local destiné à un téléphone nécessite aussi que `VITE_PUBLIC_CLIENT_BASE_URL`, intégré au build, pointe vers l’adresse LAN et le port 5173. Les QR en mode Cloud continuent d’utiliser le domaine Cloud configuré.

Pour transférer l’ancienne base de développement avant le premier lancement, arrêtez l’ancienne application, sauvegardez le fichier d’origine, puis copiez-le seulement si la base cible n’existe pas encore :

```powershell
$source = 'C:\chemin\vers\pl80-bv063-clean\packages\database\prisma\dev.db'
$targetDirectory = Join-Path $env:APPDATA 'BV Expedition Pro\data'
$target = Join-Path $targetDirectory 'bv-expedition.db'
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
if (Test-Path $target) { throw "La base cible existe déjà; elle ne sera pas remplacée." }
Copy-Item -LiteralPath $source -Destination $target
```

Ne copiez pas de base contenant des données réelles vers un poste de test ou un build de distribution. Gardez une sauvegarde vérifiée avant toute migration.

## Configuration Cloud Relay

Les secrets Cloud ne sont pas inclus dans l’installateur. Pour configurer ce poste, créez `%APPDATA%\BV Expedition Pro\.env` avec les valeurs fournies séparément par l’administrateur :

```dotenv
CLOUD_RELAY_URL=wss://adresse-cloud-autorisée
CLOUD_PUBLIC_URL=https://adresse-portail-client
STORE_ID=identifiant-du-magasin
STORE_SECRET=secret-fourni-hors-du-dépôt
```

Fermez puis relancez l’application après une modification. Ne partagez pas ce fichier et ne l’ajoutez jamais à Git. Les variables facultatives pour l’impression locale sont `DEFAULT_PRINTER_NAME`, `PRINT_COMMAND`, `SUMATRA_PATH` et `PRINT_MODE`; le mode Windows est utilisé par défaut.

## Vérifications après installation

1. Confirmez que l’API locale, le Cloud Relay, l’imprimante configurée et SumatraPDF affichent leur état dans la barre supérieure.
2. Connectez-vous avec un compte administrateur, puis avec un compte employé.
3. Vérifiez que le Centre de test reste réservé aux administrateurs et qu’une analyse seule ne met aucun travail en file.
4. Vérifiez l’autostart désactivé par défaut puis, si souhaité, activez-le et désactivez-le.
5. Pour le tout premier essai physique, faites valider visuellement le PDF préparé et demandez une confirmation volontaire avant d’imprimer sur la PL80E.

La disponibilité de la PL80E ou de SumatraPDF ne confirme pas une impression physique réussie. Un essai représentatif et supervisé sur le poste cible reste nécessaire.

## Retour arrière

Avant une mise à jour, fermez BV Expédition Pro normalement et faites une copie privée de la base, des paramètres locaux et du dossier `security`. Pour revenir à une version précédente, désinstallez la version courante depuis **Applications installées**, installez l’ancien installateur vérifié, puis contrôlez les connexions avant tout travail d’impression. Ne supprimez pas `%APPDATA%\BV Expedition Pro` pendant la désinstallation : il contient la base, la clé JWT et les paramètres. Restaurer une sauvegarde de la clé conserve les sessions; si la clé ne peut pas être restaurée, l’application peut en générer une nouvelle et les utilisateurs devront se reconnecter.
