import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { User } from '../entities/user.entity';
import { Repository } from 'typeorm';

@Controller()
export class MeController {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Current authenticated user/profile.
   * Responds under global API prefix, e.g. GET /api/me.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: Request & { user?: AuthenticatedUser }) {
    const authUser = req.user;
    if (!authUser?.userId) {
      // Guard should handle auth, but keep a defensive check.
      throw new NotFoundException('User not found');
    }

    const user = await this.users.findOne({
      where: { id: authUser.userId },
      relations: ['profile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = user.profile;

    return {
      id: user.id,
      role: user.role,
      account_status: user.accountStatus,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      profile: profile
        ? {
            organization_name: profile.organizationName,
            country: profile.country,
            state_province: profile.stateProvince,
            address_line_1: profile.addressLine1,
            address_line_2: profile.addressLine2,
            city_town: profile.cityTown,
            zip_code: profile.zipCode,
            phone_number: profile.phoneNumber,
            whatsapp_country_code: profile.whatsappCountryCode,
            whatsapp_number: profile.whatsappNumber,
            normalized_whatsapp_number: profile.normalizedWhatsappNumber,
            issuing_country: profile.issuingCountry,
            identification_number: profile.identificationNumber,
          }
        : null,
      notification_preferences: null, // placeholder until preferences API is implemented
    };
  }
}
