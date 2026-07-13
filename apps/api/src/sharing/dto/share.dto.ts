import { IsEmail, IsEnum } from 'class-validator';
import { SharePermission } from '@org/domain';

export class ShareItemDto {
  @IsEmail()
  email!: string;

  @IsEnum(SharePermission)
  permission!: SharePermission;
}
