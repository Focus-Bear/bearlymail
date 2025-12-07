import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

import * as fs from 'fs';
import * as path from 'path';

// Set up error logging to file
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const errorLogFile = path.join(logDir, 'server-errors.log');
const logError = (message: string, error?: any) => {
  const timestamp = new Date().toISOString();
  let errorDetails = '';
  if (error) {
    try {
      errorDetails = '\n' + JSON.stringify({
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      }, null, 2);
    } catch {
      errorDetails = '\n' + String(error);
    }
  }
  const logMessage = `[${timestamp}] ${message}${errorDetails}\n`;
  try {
    fs.appendFileSync(errorLogFile, logMessage);
  } catch (logErr) {
    // If we can't write to log file, just console.error
    console.error('Failed to write to log file:', logErr);
  }
  console.error(message, error || '');
};

// Handle unhandled promise rejections and errors
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logError('Unhandled Rejection', { promise: String(promise), reason });
  // Log but don't crash - pg-boss will handle connection errors
  if (reason && reason.message && reason.message.includes('Connection terminated')) {
    console.warn('Database connection error detected, will retry automatically');
    return; // Don't crash on connection errors
  }
});

process.on('uncaughtException', (error: Error) => {
  logError('Uncaught Exception', error);
  // Only exit on critical errors, not connection errors
  if (error.message && error.message.includes('Connection terminated')) {
    console.warn('Database connection error, will retry automatically');
    return;
  }
  // For other critical errors, exit gracefully
  process.exit(1);
});

async function bootstrap() {
  try {
    // Check if running in worker mode
    if (process.env.WORKER_MODE === 'true') {
      console.log('Starting application in WORKER mode...');
      const app = await NestFactory.createApplicationContext(AppModule);
      // Keep the process alive
      // The pg-boss workers inside onModuleInit will handle the jobs
      return;
    }

    const app = await NestFactory.create(AppModule);
    
    // Enable CORS for frontend
    app.enableCors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (error: any) {
    logError('Failed to start application', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logError('Bootstrap failed', error);
  process.exit(1);
});

