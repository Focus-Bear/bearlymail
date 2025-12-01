import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Handle unhandled promise rejections and errors
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't crash - pg-boss will handle connection errors
  if (reason && reason.message && reason.message.includes('Connection terminated')) {
    console.warn('Database connection error detected, will retry automatically');
    return; // Don't crash on connection errors
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Only exit on critical errors, not connection errors
  if (error.message && error.message.includes('Connection terminated')) {
    console.warn('Database connection error, will retry automatically');
    return;
  }
  // For other critical errors, exit gracefully
  process.exit(1);
});

async function bootstrap() {
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
}

bootstrap();

