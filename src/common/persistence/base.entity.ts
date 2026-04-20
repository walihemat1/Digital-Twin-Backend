import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`base.entity.ts`)
 * --------------------------------------------------------------------------
 *
 * This file defines the abstract `BaseEntity` class, which serves as a common
 * foundation for all database entities within the application.
 *
 * How it will be used:
 * - All entities that represent database tables should extend this class
 *   to automatically inherit the following standardized columns:
 *     - `id`: A unique UUID primary key for identifying each record.
 *     - `createdAt`: Timestamp for when the record was created.
 *     - `updatedAt`: Timestamp for the record's most recent update.
 * - By centralizing these shared columns, the application enforces consistency,
 *   reduces code duplication, and streamlines auditability across all entities.
 * - When you define a new entity, simply do:
 *
 *   ```ts
 *   @Entity()
 *   export class User extends BaseEntity {
 *     // add other entity-specific fields here
 *   }
 *   ```
 *
 * - The use of TypeORM decorators ensures that timestamp fields are
 *   automatically managed (set/updated) by the ORM.
 *
 * This approach makes it easier to maintain, evolve, and audit all
 * models throughout the Digital Twin Backend.
 */
