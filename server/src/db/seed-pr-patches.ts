/**
 * Unified-diff bodies for the demo PR's files (`acme/payments-api` #482).
 *
 * Kept out of `seed.ts` because they are data, not logic, and because they have
 * one constraint the rest of the seed does not: **the hunk line numbers must
 * cover the lines the seeded findings point at** — `src/config.ts:12` and
 * `src/api/users.ts:45-52`. A finding anchors to a line of the NEW file, so a
 * patch that does not render that line renders no severity marker either, and
 * the demo silently loses the feature it exists to show.
 *
 * Before these existed every seeded file had `patch: null`, so the Files changed
 * tab read "No diff text available (binary or unfetched patch)" on a freshly
 * seeded database, and only the per-file badge could ever appear.
 */

/** `src/middleware/ratelimit.ts` — the core of the change, no findings. */
const RATELIMIT = `@@ -0,0 +1,26 @@
+import type { Request, Response, NextFunction } from 'express';
+import { config } from '../config';
+
+interface Bucket {
+  tokens: number;
+  updatedAt: number;
+}
+
+const buckets = new Map<string, Bucket>();
+
+export function bucketKey(req: Request): string {
+  return req.ip ?? 'unknown';
+}
+
+export function rateLimit(req: Request, res: Response, next: NextFunction) {
+  const key = bucketKey(req);
+  const now = Date.now();
+  const bucket = buckets.get(key) ?? { tokens: config.rateLimit.burst, updatedAt: now };
+
+  const refill = ((now - bucket.updatedAt) / 1000) * config.rateLimit.perSecond;
+  bucket.tokens = Math.min(config.rateLimit.burst, bucket.tokens + refill);
+  bucket.updatedAt = now;
+
+  if (bucket.tokens < 1) return res.status(429).json({ error: 'rate limited' });
+  bucket.tokens -= 1;
+  buckets.set(key, bucket);
+  next();
+}`;

/** `src/api/public/webhooks.ts` — wiring the limiter into the public routes. */
const WEBHOOKS = `@@ -58,9 +58,12 @@ import { verifySignature } from './signature';
 import { forwardEvent } from '../../services/events';
+import { rateLimit } from '../../middleware/ratelimit';

-router.post('/webhooks', async (req, res) => {
+router.post('/webhooks', rateLimit, async (req, res) => {
   const target = req.body.callback_url;
   const token = account.apiToken;
   await forwardEvent(target, { token, payload: req.body });
   res.status(202).end();
 });`;

/** `src/api/users.ts` — carries the seeded WARNING at 45-52 (N+1 query). */
const USERS = `@@ -42,8 +42,13 @@ router.get('/users', rateLimit, async (req, res) => {
   const page = Number(req.query.page ?? 1);
   const users = await db.users.findMany({ skip: (page - 1) * 50, take: 50 });

-  res.json(users);
+  const withTickets = [];
+  for (const user of users) {
+    const tickets = await db.tickets.countByUser(user.id);
+    withTickets.push({ ...user, tickets });
+  }
+
+  res.json(withTickets);
 });`;

/** `src/api/public/index.ts` — plumbing. */
const PUBLIC_INDEX = `@@ -10,6 +10,10 @@ import { Router } from 'express';
 import webhooks from './webhooks';
+import { rateLimit } from '../../middleware/ratelimit';

 const router = Router();
+
+// Every public route is limited; authenticated routes keep their own budget.
+router.use(rateLimit);
 router.use(webhooks);

 export default router;`;

/** `src/server.ts` — plumbing. */
const SERVER = `@@ -18,7 +18,9 @@ import express from 'express';
 import publicApi from './api/public';

 const app = express();
-app.use('/public', publicApi);
+// Trust the proxy so req.ip is the client, not the load balancer — the rate
+// limiter keys on it.
+app.set('trust proxy', 1);
+app.use('/public', publicApi);

 export default app;`;

/**
 * `src/config.ts` — carries the seeded CRITICAL at line 12 (a committed key).
 *
 * The literal is deliberately NOT a well-formed Stripe key: a realistic one
 * (`sk_live_` + 24 alphanumerics) trips GitHub's push protection, which blocks
 * the push of this repository over a fixture that is not a secret at all.
 */
const CONFIG = `@@ -8,6 +8,10 @@ export const config = {
   port: Number(process.env.PORT ?? 3000),
   databaseUrl: process.env.DATABASE_URL!,
+  stripeSecretKey: 'sk_live_<demo-placeholder-not-a-real-key>',
+  rateLimit: {
+    perSecond: 5,
+    burst: 20,
+  },
 };`;

/** `package.json` — boilerplate by role. */
const PACKAGE_JSON = `@@ -14,7 +14,8 @@
   "dependencies": {
     "express": "^4.19.2",
-    "pg": "^8.11.5"
+    "pg": "^8.11.5",
+    "lru-cache": "^10.2.0"
   },`;

/** `package-lock.json` — boilerplate, and the file the demo must keep collapsed. */
const PACKAGE_LOCK = `@@ -1204,6 +1204,20 @@
     "node_modules/lodash": {
       "version": "4.17.21",
       "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
       "integrity": "sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=="
     },
+    "node_modules/lru-cache": {
+      "version": "10.2.0",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-10.2.0.tgz",
+      "integrity": "sha512-2bIM8x+VAf6JT4bKAljS1qUWgMsqZRPGJS6FSahIMPVvctcNhyVp7AJu7quxOW9jwkryBReKZY5tY5JYv2n/7Q==",
+      "engines": {
+        "node": "14 || >=16.14"
+      }
+    },
+    "node_modules/ms": {
+      "version": "2.1.3",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
+      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA=="
+    },
     "node_modules/pg": {`;

/** Path → patch, for the files seeded on the demo PR. */
export const DEMO_PR_PATCHES: Record<string, string> = {
  'src/middleware/ratelimit.ts': RATELIMIT,
  'src/api/public/webhooks.ts': WEBHOOKS,
  'src/api/users.ts': USERS,
  'src/api/public/index.ts': PUBLIC_INDEX,
  'src/server.ts': SERVER,
  'src/config.ts': CONFIG,
  'package.json': PACKAGE_JSON,
  'package-lock.json': PACKAGE_LOCK,
};
