import { validateConfig, config } from './config.js';
import { buildApp } from './app.js';

validateConfig();
const { app, store } = buildApp();
const server = app.listen(config.port, config.host, () => console.log(`Sadik Travels listening on http://${config.host}:${config.port}`));

const shutdown = async (signal: string) => {
  console.log(`${signal} received; shutting down gracefully`);
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
