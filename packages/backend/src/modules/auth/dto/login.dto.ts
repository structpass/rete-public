import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@rete.local', description: 'ログイン用メールアドレス' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'your-password', description: 'パスワード' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string;
}
