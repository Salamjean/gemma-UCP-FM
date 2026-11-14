import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreerPermissionDto, InfirmierPermissionsService } from './permissions.service';

@Controller('infirmier/permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierPermissionsController {
  constructor(private readonly service: InfirmierPermissionsService) {}

  @Get()
  getPermissions(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getPermissions(req.user.sub);
  }

  @Post()
  creerPermission(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: CreerPermissionDto,
  ) {
    return this.service.creerPermission(req.user.sub, dto);
  }
}

