import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class RatingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  food?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  service?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  atmosphere?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  valueForMoney?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  overall?: number;
}
