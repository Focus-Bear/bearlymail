/**
 * Development logger utility
 * Only logs to console on localhost (with [DEV] prefix)
 */

// Immediate log when module loads - this should ALWAYS show
console.log('[dev-logger] ===== MODULE LOADED =====');
console.log('[dev-logger] Logger utility is being imported');

/**
 * Check if we're running in localhost/development mode
 */
function isLocalhost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const hostname = window.location.hostname;
  // Dynamically import to avoid import.meta.env issues in Jest
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { API_URL } = require('config/api');
  
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    API_URL.includes('localhost') ||
    API_URL.includes('127.0.0.1')
  );
}

/**
 * Log a message to console (only on localhost, with [DEV] prefix)
 */
export function devLog(message: string, ...args: any[]): void {
  const isLocal = isLocalhost();
  // Always log the first call to verify logger is working
  if (!devLog._initialized) {
    console.log(`[DEV LOGGER] Initialized. isLocalhost: ${isLocal}, hostname: ${typeof window !== 'undefined' ? window.location.hostname : 'N/A'}`);
    devLog._initialized = true;
  }
  if (isLocal) {
    console.log(`[DEV] ${message}`, ...args);
  }
}
// Add a flag to track initialization
devLog._initialized = false;

/**
 * Log an error to console (only on localhost, with [DEV ERROR] prefix)
 */
export function devError(message: string, ...args: any[]): void {
  if (isLocalhost()) {
    console.error(`[DEV ERROR] ${message}`, ...args);
  }
}

/**
 * Log a warning to console (only on localhost, with [DEV WARN] prefix)
 */
export function devWarn(message: string, ...args: any[]): void {
  if (isLocalhost()) {
    console.warn(`[DEV WARN] ${message}`, ...args);
  }
}

/**
 * Log debug info to console (only on localhost, with [DEV DEBUG] prefix)
 */
export function devDebug(message: string, ...args: any[]): void {
  if (isLocalhost()) {
    console.debug(`[DEV DEBUG] ${message}`, ...args);
  }
}

