/**
 * SECURITY DEMO FIXTURE — DELIBERATELY VULNERABLE. DO NOT COPY, DO NOT SHIP.
 * See ./README.md. Nothing imports this file and nothing may.
 *
 * Planted: missing authorization, secrets in logs, stack traces to the client.
 */

interface Req {
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
}
interface Reply {
  status(code: number): Reply;
  send(payload: unknown): void;
}
interface App {
  post(path: string, handler: (req: Req, reply: Reply) => Promise<void>): void;
  get(path: string, handler: (req: Req, reply: Reply) => Promise<void>): void;
  setErrorHandler(handler: (err: Error, req: Req, reply: Reply) => void): void;
}
declare const db: { deleteWorkspace(id: string): Promise<void>; listSecrets(): Promise<unknown> };
declare const logger: { info(o: unknown, msg: string): void };

export function adminRoutes(app: App): void {
  /**
   * Defect 6 — no authorization. Every other route in the app resolves a
   * request context before touching tenant data; this one takes a workspace id
   * straight from the path and deletes it. Authentication is not the gap —
   * there is no check that the caller may act on *this* workspace.
   */
  app.post('/admin/workspaces/:id/delete', async (req, reply) => {
    await db.deleteWorkspace(req.params.id!);
    reply.status(200).send({ deleted: req.params.id });
  });

  /** Same gap, read side: every secret in the install, to anyone who asks. */
  app.get('/admin/secrets', async (_req, reply) => {
    reply.status(200).send(await db.listSecrets());
  });

  /**
   * Defect 7 — the whole request is logged, headers included, so the bearer
   * token and any API key in the body land in the log store in plaintext and
   * outlive the request by the retention period.
   */
  app.post('/admin/settings', async (req, reply) => {
    logger.info({ headers: req.headers, body: req.body }, 'admin settings update');
    reply.status(200).send({ ok: true });
  });

  /**
   * Defect 8 — the raw stack goes to the client. It names internal paths,
   * package versions and function names, which is free reconnaissance.
   */
  app.setErrorHandler((err, _req, reply) => {
    reply.status(500).send({ error: err.message, stack: err.stack });
  });
}
