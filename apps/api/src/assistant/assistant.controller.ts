import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';
import { AssistantService } from './assistant.service.js';
import { AssistantChatDto } from './dto/assistant-chat.dto.js';

@Controller('assistant')
@UseGuards(AuthGuard('jwt'))
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat(user.userId, dto);
  }
}
