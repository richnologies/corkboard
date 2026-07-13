import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SharingService } from './sharing.service.js';
import { ShareItemDto } from './dto/share.dto.js';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';

@Controller('items/:itemId/shares')
@UseGuards(AuthGuard('jwt'))
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Post()
  share(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: ShareItemDto,
  ) {
    return this.sharingService.shareItem(user.userId, itemId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.sharingService.listShares(user.userId, itemId);
  }

  @Delete(':sharedWithUserId')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Param('sharedWithUserId') sharedWithUserId: string,
  ) {
    return this.sharingService.revokeShare(
      user.userId,
      itemId,
      sharedWithUserId,
    );
  }
}
