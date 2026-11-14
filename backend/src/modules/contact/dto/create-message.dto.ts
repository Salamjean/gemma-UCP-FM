import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Données attendues pour POST /api/contact (validées automatiquement) */
export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
