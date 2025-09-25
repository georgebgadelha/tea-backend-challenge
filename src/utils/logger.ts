// Simple console logger
const getTimestamp = (): string => {
  return new Date().toISOString();
};

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`${getTimestamp()} [INFO]: ${message}`, ...args);
  },
  
  error: (message: string, ...args: any[]) => {
    console.error(`${getTimestamp()} [ERROR]: ${message}`, ...args);
  },
  
  warn: (message: string, ...args: any[]) => {
    console.warn(`${getTimestamp()} [WARN]: ${message}`, ...args);
  },
  
  debug: (message: string, ...args: any[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`${getTimestamp()} [DEBUG]: ${message}`, ...args);
    }
  },
};

export default logger;