import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);

/**
 * --------------------------------------------------------------------------
 * What are Decorators?
 * --------------------------------------------------------------------------
 * In TypeScript and frameworks like NestJS, decorators are special
 * declarations that attach metadata or behavior to classes, methods,
 * properties, or parameters. A decorator is simply a function that can
 * be prefixed with @ and applied wherever needed to enhance or transform
 * code features at runtime. Common usages include parameter decorators,
 * class decorators, and method decorators.
 *
 * For example, in NestJS, the @Controller(), @Injectable(),
 * and @Get() decorators are used to define controllers, inject services,
 * and map route handlers, respectively. Param decorators like @Body(),
 * @Query(), or custom ones like the `@CurrentUser` below, make it easy
 * to retrieve data from the request context in a concise and readable way.
 *
 * --------------------------------------------------------------------------
 * Purpose of this App & How it Works
 * --------------------------------------------------------------------------
 * The purpose of this Digital Twin Backend application is to provide a backend
 * service that handles authentication, user management, account status, and
 * transactional workflows for a digital twin system.
 *
 * The app utilizes several core concepts:
 *  - Enums define constants (such as user roles, transaction or account status).
 *  - Interfaces, like `AuthenticatedUser`, describe the structured shape of
 *    objects (such as the logged-in user's identity).
 *  - Decorators (like `@CurrentUser`) are used to easily inject user context
 *    into controllers or services, so routes can access details about the
 *    currently authenticated user.
 *  - Constants centralize application-wide values for easy reuse.
 *
 * Authentication and authorization system:
 *  - When a user logs in, their identity and roles are stored in the request
 *    context (often attached to the request object).
 *  - Custom parameter decorators such as `@CurrentUser` (defined below) allow
 *    controller methods to access the authenticated user by simply
 *    adding it as a parameter, making code cleaner and easier to maintain.
 *
 * This structure promotes clear separation of concerns, type safety, and easy
 * extensibility for scenarios like restricting access based on role, tracking
 * account status changes, or managing transactional states.
 */
