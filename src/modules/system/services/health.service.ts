import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getHealthStatus(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service:
        this.configService.get<string>('app.serviceName') ??
        'digital-twin-backend',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`health.service.ts`)
 * --------------------------------------------------------------------------
 *
 * This file implements the `HealthService` class, which provides a simple
 * endpoint for checking the operational "health" of the Digital Twin Backend service.
 *
 * Why we need it:
 * - Health checks are crucial for automated monitoring, orchestration systems,
 *   and DevOps processes to determine if the backend service is running and
 *   responding as expected.
 * - Infrastructure tools, such as load balancers, Kubernetes probes, or
 *   uptime monitors, will frequently request the health endpoint supplied by
 *   this service to decide whether to route traffic or trigger alerts.
 * - By centralizing the health check logic in this service, we enable easy
 *   extensibility (e.g., adding downstream dependency checks, application metrics,
 *   or feature flags in the future) without duplicating status logic elsewhere.
 *
 * The service exposes:
 *   - A `getHealthStatus()` method that returns an object with the service's
 *     current status, name, and a timestamp in ISO8601 format.
 *   - Service name resolution via configuration supports flexible deployment and
 *     environment-specific identification.
 *
 * This pattern promotes resilient, reliable backend operations and increases
 * visibility into the application's real-time availability.
 */
