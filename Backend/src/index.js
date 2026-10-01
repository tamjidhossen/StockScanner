import 'dotenv/config';
import app from './app.js';
import logger from './utils/logger.js';
import { startExtractionWorker } from './workers/extraction.worker.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Backend server running on http://localhost:${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/api/health`);
  logger.info(`Stock API available at http://localhost:${PORT}/api/stocks`);

  // Start background extraction worker for SQLite job queue
  startExtractionWorker(3000);
});
