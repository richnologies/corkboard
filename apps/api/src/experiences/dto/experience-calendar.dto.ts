import { IsDateString } from 'class-validator';

export class ExperienceCalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
