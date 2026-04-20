import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class CommonModule {}

/**
 * --------------------------------------------------------------------------
 * Purpose of the `common` Directory and the `CommonModule`
 * --------------------------------------------------------------------------
 *
 * The `common` directory serves as a centralized repository for core utilities,
 * guards, decorators, constants, enums, base classes, and shared interfaces
 * used throughout the Digital Twin Backend application. By housing these reusable
 * building blocks in one place, the application:
 *   - Promotes DRY (Don't Repeat Yourself) principles and reduces code duplication.
 *   - Improves maintainability by keeping shared logic and types in a well-defined location.
 *   - Establishes clear, modular boundaries for common concerns such as authentication,
 *     authorization, request context extraction, and base entity modeling.
 *
 * Why we need `CommonModule`:
 *   - The `CommonModule` provides a global NestJS module that can register and
 *     export core providers (such as guards, services, and decorators) for easy
 *     reuse across all feature modules.
 *   - By making `CommonModule` global (`@Global()` decorator), its exports
 *     (like `RolesGuard`) are available application-wide without the need for
 *     repeated imports in every other module.
 *   - This structure ensures that essential cross-cutting features (such as
 *     authentication guards or custom parameter decorators) are consistently and
 *     conveniently accessible to all parts of the application, streamlining
 *     dependency management and supporting robust, scalable backend development.
 *
 * In summary, the `common` directory and `CommonModule` enable a structured,
 * maintainable, and scalable approach to sharing foundational logic and patterns
 * across the entire codebase.
 */
