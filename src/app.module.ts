import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { configLoaders } from './config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrokerAModule } from './modules/broker-a/broker-a.module';
import { BrokerBModule } from './modules/broker-b/broker-b.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RecipientFeedbackModule } from './modules/recipient-feedback/recipient-feedback.module';
import { RecipientsModule } from './modules/recipients/recipients.module';
import { SharedModule } from './modules/shared/shared.module';
import { SystemModule } from './modules/system/system.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // this is used to make the config module available globally to all the modules in the application.
      cache: true, // this is used to cache the config values so that they are not read from the file on every request.
      expandVariables: true, // this is used to expand the variables in the config file, meaning that if we have a variable in the config file like ${PORT} it will be expanded to the value of the PORT environment variable, this is useful when we have a variable in the config file that is not a string but a number or a boolean for example.
      load: [...configLoaders],
      validationSchema: envValidationSchema, // this is used to validate the environment variables coming from the .env file by using the envValidationSchema. This is a schema that defines the environment variables that are allowed in the application.
    }),
    // the modules that are imported here are the modules that are used in the application.
    CommonModule,
    DatabaseModule,
    SharedModule,
    SystemModule,
    AuthModule,
    UsersModule,
    ApprovalModule,
    RecipientsModule,
    TransactionsModule,
    BrokerAModule,
    BrokerBModule,
    RecipientFeedbackModule,
    NotificationsModule,
    AdminModule,
    AuditModule,
  ],
})
export class AppModule {}
