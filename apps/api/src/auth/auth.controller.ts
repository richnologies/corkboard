import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto.js';
import { AuthUser, CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }
}
