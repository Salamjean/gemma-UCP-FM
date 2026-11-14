import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Données attendues pour POST /api/auth/login */
export class LoginDto {
  // Comme Laravel : email simplement "required" (pas de format imposé)
  @IsString()
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  /** "Se souvenir de moi" : jeton valable plus longtemps */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
