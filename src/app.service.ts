import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AppService {
  constructor(@Inject('NEON_CONNECTION') private readonly pool: Pool) {}

  async getDbVersion(): Promise<object> {
    let client;
    try {
      client = await this.pool.connect();
      const { rows } = await client.query('SELECT version()');
      const version = rows[0]?.version || 'No version found';
      return {
        message: 'Connection successful!',
        version,
      };
    } catch (error) {
      // Surface a generic error to callers while logging details locally.
      // eslint-disable-next-line no-console
      console.error('Database query failed:', error);
      throw new Error('Failed to connect to the database.');
    } finally {
      client?.release();
    }
  }
}
