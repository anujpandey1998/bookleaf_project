import { config, assertConfig } from './config/env.js';
import { createApp } from './app.js';
import { connectWithRetry, getPool } from './config/db.js';

async function main() {
  assertConfig();
  try {
    await connectWithRetry({ retries: 5, delayMs: 2000 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Database unreachable at ${config.db.host}:${config.db.port}/${config.db.database}: ${err.code || err.message}`);
    process.exit(1);
  }
  getPool(); // warm pool
  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`BookLeaf API listening on http://localhost:${config.port} (docs: /api/docs)`);
  });
}

main();
