import { validateConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

let built: ReturnType<typeof buildApp> | undefined;
let initError: unknown;
let initPromise: Promise<void> | undefined;

function initialize() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      validateConfig();
      built = buildApp();
      if (built.connection) await built.connection;
    } catch (error) {
      initError = error;
    }
  })();
  return initPromise;
}

export default async function handler(req: any, res: any) {
  const requestPath = String(req.url || '').split('?')[0];
  if (/\/api\/healthz$/.test(requestPath)) {
    res.status(200).json({ ok: true, service: 'sadik-travels-backend', runtime: 'vercel' });
    return;
  }
  await initialize();
  if (initError || !built) {
    res.status(503).json({ error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Backend environment or MongoDB is not configured' } });
    return;
  }
  return built.app(req, res);
}
