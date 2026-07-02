# BV Cloud Relay V1

Relay HTTP/WebSocket sans état durable. Les PDF restent en mémoire, sont supprimés dès l’acquittement du magasin et expirent après 15 minutes.

## Test local

Configurer l’application :

```env
STORE_ID=demo-store
STORE_SECRET=demo-secret-change-me
CLOUD_RELAY_URL=ws://127.0.0.1:4444/ws
CLOUD_PUBLIC_URL=http://127.0.0.1:4444
CLOUD_RELAY_ALLOW_INSECURE=true
```

Puis lancer `pnpm --filter @bv/cloud-relay dev` et BV Expédition Pro. La page client est disponible sur `http://127.0.0.1:4444/demo-store`.

En production, utiliser exclusivement HTTPS/WSS derrière un reverse proxy TLS et fournir des secrets aléatoires distincts via l’environnement. Le relay refuse les WebSockets non chiffrés hors du mode local explicite.
