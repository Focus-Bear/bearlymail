import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const AUTH_LOG_FILE = path.join(LOGS_DIR, 'auth-failures.log');
const DEBUG_LOG_FILE = path.join(LOGS_DIR, 'debug.log');

// Helper to write to log file
function writeToAuthLog(message: string) {
  try {
    // Ensure logs directory exists (in case it was deleted)
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(AUTH_LOG_FILE, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write to auth log file:', error);
  }
}

// Helper to write debug logs to file
export function writeDebugLog(message: string) {
  try {
    // Ensure logs directory exists (in case it was deleted)
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(DEBUG_LOG_FILE, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write to debug log file:', error);
  }
}

export class AuthLogger {
  private readonly logger = new Logger('AuthLogger');

  /**
   * Log Google authentication failure with comprehensive details
   */
  logAuthFailure(
    userId: string,
    userEmail: string | null,
    context: string,
    error: any | null,
    additionalDetails?: Record<string, any>
  ): void {
    const isSuccess = context === 'LOGIN_SUCCESS' && !error;
    const errorDetails = {
      userId,
      userEmail,
      context, // e.g., 'syncEmails', 'scanHistory', 'tokenRefresh', 'LOGIN_SUCCESS'
      timestamp: new Date().toISOString(),
      errorType: error?.code || error?.name || (isSuccess ? 'SUCCESS' : 'Unknown'),
      errorMessage: error?.message || (isSuccess ? 'Login successful' : String(error)),
      errorCode: error?.code,
      httpStatus: error?.response?.status || error?.status,
      errorData: error?.response?.data || error?.data,
      // Determine cause (if error)
      cause: error ? this.determineCause(error) : 'Login successful',
      // Additional context
      ...additionalDetails,
    };

    const logMessage = isSuccess 
      ? `🔐 AUTH EVENT - LOGIN:\n${JSON.stringify(errorDetails, null, 2)}`
      : `🔐 AUTH FAILURE:\n${JSON.stringify(errorDetails, null, 2)}`;
    
    // Log to console
    if (isSuccess) {
      this.logger.log(logMessage);
    } else {
      this.logger.error(logMessage);
    }
    
    // Also write to file
    writeToAuthLog(logMessage);
  }

  /**
   * Determine the likely cause of the auth failure
   */
  private determineCause(error: any): string {
    if (!error) return 'Unknown error';
    
    // Check for specific error codes
    if (error.code === 'invalid_grant' || error?.response?.data?.error === 'invalid_grant') {
      return 'Refresh token is invalid, expired, or revoked. User must re-authenticate.';
    }
    
    if (error.code === 401 || error?.response?.status === 401) {
      return 'Unauthorized - access token expired or invalid. Refresh token should have been used.';
    }
    
    if (error.message && error.message.includes('Refresh token missing')) {
      return 'Refresh token not found in database. User must re-authenticate.';
    }
    
    if (error.message && error.message.includes('Token refresh failed')) {
      return 'Token refresh attempt failed. Refresh token may be invalid or expired.';
    }
    
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      return 'Network error - cannot connect to Google OAuth servers.';
    }
    
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return 'Timeout connecting to Google OAuth servers.';
    }
    
    return `Unknown error: ${error.message || JSON.stringify(error)}`;
  }
}

// Export singleton instance
export const authLogger = new AuthLogger();

// Initialize log file on module load to ensure it exists
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  // Touch the log file to ensure it exists (create empty if it doesn't)
  if (!fs.existsSync(AUTH_LOG_FILE)) {
    fs.writeFileSync(AUTH_LOG_FILE, `[${new Date().toISOString()}] Auth log file initialized\n`, 'utf8');
  }
} catch (error) {
  console.error('Failed to initialize auth log file:', error);
}
