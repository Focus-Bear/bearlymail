import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

@Injectable()
export class DatabaseCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log('Cleaning up NULL userId values after UUID migration...');
      
      // Clean up invalid rows with NULL userId
      const tables = [
        'user_contexts',
        'private_notes',
        'emails',
        'summarization_rules',
      ];

      let totalDeleted = 0;
      for (const table of tables) {
        try {
          const result = await this.connection.query(
            `DELETE FROM ${table} WHERE "userId" IS NULL`
          );
          // Result format: [result array, rowCount]
          const deleted = Array.isArray(result) && result.length > 0 && typeof result[0] === 'number' 
            ? result[0] 
            : (result.rowCount || result[1] || 0);
          if (deleted > 0) {
            this.logger.warn(`Deleted ${deleted} invalid rows from ${table}`);
            totalDeleted += deleted;
          }
        } catch (err: any) {
          // Table might not exist yet
          if (!err.message?.includes('does not exist')) {
            this.logger.debug(`Error cleaning ${table}: ${err.message}`);
          }
        }
      }

      if (totalDeleted > 0) {
        this.logger.warn(`Total: Deleted ${totalDeleted} invalid rows`);
      }

      // Now try to make userId non-nullable (will fail silently if constraint already exists or column is already NOT NULL)
      try {
        const result = await this.connection.query(`
          ALTER TABLE user_contexts 
          ALTER COLUMN "userId" SET NOT NULL;
        `);
        this.logger.log('Set userId as NOT NULL in user_contexts');
      } catch (err: any) {
        // Ignore if already NOT NULL or constraint issues
        if (!err.message?.includes('already') && !err.message?.includes('constraint')) {
          this.logger.debug(`Could not set NOT NULL constraint (this is okay): ${err.message}`);
        }
      }

      this.logger.log('Cleanup completed');
    } catch (error: any) {
      // If tables don't exist yet (first run), that's okay
      if (error.message?.includes('does not exist')) {
        this.logger.log('Tables do not exist yet, skipping cleanup');
      } else {
        this.logger.error('Error during cleanup:', error);
      }
    }
  }
}

