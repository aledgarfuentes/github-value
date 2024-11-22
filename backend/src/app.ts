import 'dotenv/config'
import express from 'express';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import cors from 'cors';
import path, { dirname } from 'path';
import apiRoutes from "./routes/index.js"
import { dbConnect } from './database.js';
import setup from './services/setup.js';
import settingsService from './services/settings.service.js';
import SmeeService from './services/smee.js';
import logger, { expressLoggerMiddleware } from './services/logger.js';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT) || 80;

export const app = express();
app.use(cors());
app.use(expressLoggerMiddleware);


const startGitHub = async () => {
  await SmeeService.createSmeeWebhookProxy(PORT);
  logger.info('Created Smee webhook proxy ✅');

  try {
    await setup.createAppFromEnv();
    logger.info('Created GitHub App from environment ✅');
  } catch (error) {
    logger.warn('Failed to create app from environment. This is expected if the app is not yet installed.');
  }
}

(async () => {
  try {
    await dbConnect();
    logger.info('DB Connected ✅');
    await settingsService.initializeSettings();
    try {
      await setup.createAppFromEnv();
      logger.info('Created GitHub App from environment ✅');
    } catch (error) {
      logger.debug(error);
      logger.warn('Failed to create app from environment. This is expected if the app is not yet installed.');
    }
  } catch (error) {
    logger.debug(error);
    logger.error('DB Connection failed ❌');
  }
  logger.info('Settings loaded ✅');

  app.use((req, res, next) => {
    if (req.path === '/api/github/webhooks') {
      return next();
    }
    bodyParser.json()(req, res, next);
  }, bodyParser.urlencoded({ extended: true }));
  app.use('/api', apiRoutes);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const frontendPath = path.resolve(__dirname, '../../frontend/dist/github-value/browser');

  app.use(express.static(frontendPath));
  app.get('*', rateLimit({
    windowMs: 15 * 60 * 1000, max: 5000,
  }), (_, res) => res.sendFile(path.join(frontendPath, 'index.html')));

  app.listen(PORT, () => {
    logger.info(`Server is running at http://localhost:${PORT} 🚀`);
    if (process.env.WEB_URL) {
      logger.debug(`Frontend is running at ${process.env.WEB_URL} 🚀`);
    }
  });
})();