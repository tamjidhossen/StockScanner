import morgan from 'morgan';
import logger from '../utils/logger.js';

// Stream morgan logs through our application logger
const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream }
);

export default requestLogger;
