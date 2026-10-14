import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { router } from './routes/api.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './docs/openapi.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' })); // request size limit; attachments are UI-only metadata

  app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'BookLeaf API Docs' }));
  app.get('/api/openapi.json', (req, res) => res.json(openApiSpec));

  app.use('/api', router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
