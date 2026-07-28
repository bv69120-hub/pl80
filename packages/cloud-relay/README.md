# BV Cloud Relay

Relay public HTTP/WebSocket sans stockage durable. Les PDF restent uniquement en mémoire, expirent après 15 minutes et sont supprimés dès l’acquittement de l’application Windows.

## Garanties de sécurité

- PDF limité à 10 Mo, avec MIME `application/pdf` et signature `%PDF-` obligatoires ;
- jeton d’upload HMAC à usage unique, valable cinq minutes ;
- `STORE_SECRET` utilisé uniquement pour authentifier la connexion WSS de l’application Windows et jamais envoyé au navigateur ;
- limites par minute : 10 uploads par IP et 20 par magasin ;
- aucun contenu PDF n’est journalisé ;
- HTTPS/WSS obligatoire en production, y compris derrière le proxy Railway ;
- magasin inconnu ou application Windows hors ligne : page d’erreur explicite, sans conservation du PDF.

## Déploiement Railway depuis GitHub

1. Pousser le monorepo sur GitHub, sans commiter `.env` ni aucun secret.
2. Dans Railway, créer un projet avec **New Project → Deploy from GitHub repo**, puis sélectionner le dépôt.
3. Conserver la racine du service à `/`. Le workspace pnpm, le lockfile et `railway.json` sont à la racine du monorepo. Ne pas choisir `packages/cloud-relay` comme Root Directory.
4. Dans **Service → Settings → Config as Code**, vérifier que le chemin détecté est `/railway.json`.
5. La configuration fournit automatiquement :
   - build : `pnpm install --frozen-lockfile && pnpm --filter @bv/cloud-relay build` ;
   - start : `pnpm --filter @bv/cloud-relay start` ;
   - healthcheck : `/health`.
6. Dans **Variables**, créer les quatre variables suivantes :

```env
NODE_ENV=production
STORE_ID=demo-store
STORE_SECRET=<secret aléatoire de 64 caractères hexadécimaux>
RELAY_SESSION_SECRET=<autre secret aléatoire de 64 caractères hexadécimaux>
```

Générer deux secrets différents localement :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ne pas définir `PORT` : Railway le fournit. Ne pas définir `CLOUD_RELAY_ALLOW_INSECURE` en production ; même défini par erreur, il n’autorise pas `ws://` lorsque `NODE_ENV=production`.

7. Déclencher **Deploy** dans Railway. Depuis la CLI Railway liée au projet, la commande équivalente est `railway up`.
8. Dans **Settings → Networking → Public Networking**, générer un domaine public Railway. Noter l’URL, par exemple `https://bv-cloud-relay-production.up.railway.app`.
9. Vérifier publiquement :

```text
GET https://<domaine-railway>/health
```

La réponse attendue est :

```json
{
  "name": "BV Cloud Relay",
  "status": "ok"
}
```

## Configuration de BV Expédition Pro

Configurer le poste Windows avec le même `STORE_ID` et le même `STORE_SECRET` que Railway :

```env
CLIENT_PORTAL_MODE=cloud
STORE_ID=demo-store
STORE_SECRET=<même secret aléatoire que sur Railway>
CLOUD_RELAY_URL=wss://<domaine-railway>/ws
CLOUD_PUBLIC_URL=https://<domaine-railway>
```

Redémarrer BV Expédition Pro, sélectionner le mode Cloud si nécessaire, puis vérifier que l’état Cloud est connecté. `RELAY_SESSION_SECRET` reste exclusivement sur Railway et ne doit pas être copié dans l’application Windows.

## Test réel depuis un téléphone en 4G

1. Laisser BV Expédition Pro ouvert et connecté au Cloud Relay.
2. Désactiver le Wi-Fi du téléphone pour forcer la 4G/5G.
3. Ouvrir `https://<domaine-railway>/demo-store`.
4. Sélectionner un PDF valide de moins de 10 Mo et l’envoyer.
5. Vérifier la page de confirmation, l’arrivée du travail dans l’Historique Windows puis l’impression.
6. Fermer l’application Windows et recharger la page : elle doit répondre clairement **Magasin hors ligne** et ne doit accepter aucun PDF.

## Développement local

Le mode local existant reste disponible :

```env
STORE_ID=demo-store
STORE_SECRET=demo-secret-change-me
RELAY_SESSION_SECRET=local-session-secret-change-me
CLOUD_RELAY_URL=ws://127.0.0.1:4444/ws
CLOUD_PUBLIC_URL=http://127.0.0.1:4444
CLOUD_RELAY_ALLOW_INSECURE=true
RELAY_PORT=4444
```

Lancer `pnpm --filter @bv/cloud-relay dev`, puis ouvrir `http://127.0.0.1:4444/demo-store` pendant que BV Expédition Pro est connecté.
