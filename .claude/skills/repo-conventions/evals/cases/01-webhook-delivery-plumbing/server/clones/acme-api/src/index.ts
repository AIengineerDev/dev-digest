import Fastify from 'fastify';

const app = Fastify({ logger: true });
app.get('/health', async () => ({ ok: true }));
await app.listen({ port: 8080 });
