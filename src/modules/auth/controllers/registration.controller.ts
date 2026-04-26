import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { RegistrationContactStepDto } from '../dto/registration-contact-step.dto';
import { RegistrationLocationStepDto } from '../dto/registration-location-step.dto';
import { RegistrationPersonalInfoStepDto } from '../dto/registration-personal-info-step.dto';
import { RegistrationRecipientDetailsStepDto } from '../dto/registration-recipient-details-step.dto';
import { RegistrationCompleteDto } from '../dto/registration-complete.dto';
import { SelectRoleDto } from '../dto/select-role.dto';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { RegistrationService } from '../registration/registration.service';

@Controller('auth')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('registration-sessions')
  createSession() {
    return this.registration.createSession();
  }

  @Patch('registration-sessions/:id/role')
  selectRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SelectRoleDto,
  ) {
    return this.registration.selectRole(id, dto);
  }

  @Patch('registration-sessions/:id/steps/contact')
  saveContact(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationContactStepDto,
  ) {
    return this.registration.saveContactStep(id, dto);
  }

  @Patch('registration-sessions/:id/steps/personal-info')
  savePersonalInfo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationPersonalInfoStepDto,
  ) {
    // return this.registration.savePersonalInfoStep(id, dto);
    return {
      message: 'Personal info step saved',
      data: dto,
    };
  }

  @Patch('registration-sessions/:id/steps/location')
  saveLocation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationLocationStepDto,
  ) {
    return this.registration.saveLocationStep(id, dto);
  }

  @Patch('registration-sessions/:id/steps/recipient-details')
  saveRecipientDetails(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationRecipientDetailsStepDto,
  ) {
    return this.registration.saveRecipientDetailsStep(id, dto);
  }

  @Post('register/complete')
  complete(
    @Body() body: RegistrationCompleteDto,
  ): Promise<{ userId: string; accountStatus: AccountStatus }> {
    return this.registration.completeRegistration(body.registrationSessionId);
  }
}
