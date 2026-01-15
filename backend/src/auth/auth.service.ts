import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { db } from '../db/db';
import { getAccountsTable, getUsersTable } from '../db/tables';
import { SignupAccountDto } from './dto/signup-account.dto';
import { SignupUserDto } from './dto/signup-user.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly accessExpiresIn = 60 * 15; // 15 minutos
  private readonly saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  constructor(private jwt: JwtService) {
    this.jwtSecret = process.env.JWT_SECRET || '';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is not set');
    }
  }

  // ===============================
  // SIGNUP ACCOUNT (empresa)
  // ===============================
  async signupAccount(dto: SignupAccountDto) {
    const accounts = await getAccountsTable();

    if (dto.email) {
      const existing = await db
        .select()
        .from(accounts)
        .where(eq(accounts.email, dto.email))
        .limit(1);

      if (existing.length) {
        throw new BadRequestException('Ja existe uma conta com esse email.');
      }
    }

    const accountId = createId();

    await db.insert(accounts).values({
      id: accountId,
      name: dto.name,
      ownerName: dto.ownerName ?? null,
      email: dto.email ?? null,
    });

    return { id: accountId };
  }

  // ===============================
  // SIGNUP USER (admin)
  // ===============================
  async signupUser(dto: SignupUserDto) {
    const accounts = await getAccountsTable();
    const users = await getUsersTable();

    // Verifica se a conta existe
    const acc = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, dto.accountId))
      .limit(1);

    if (!acc.length) {
      throw new BadRequestException('Conta nao encontrada.');
    }

    // Email unico
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existingUser.length) {
      throw new BadRequestException('Email ja esta em uso.');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);
    const userId = createId();

    await db.insert(users).values({
      id: userId,
      accountId: dto.accountId,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'ADMIN',
    });

    const token = await this.signToken(userId, dto.accountId, 'ADMIN');

    return {
      user: {
        id: userId,
        accountId: dto.accountId,
        name: dto.name,
        email: dto.email,
        role: 'ADMIN',
      },
      token,
    };
  }

  // ===============================
  // LOGIN
  // ===============================
  async login(dto: LoginDto) {
    const users = await getUsersTable();
    let found: typeof users.$inferSelect[] = [];
    try {
      found = await db
        .select()
        .from(users)
        .where(eq(users.email, dto.email))
        .limit(1);
    } catch (err) {
      console.error('AuthService.login query error', err);
      throw new InternalServerErrorException('Falha ao consultar usuario.');
    }

    if (!found.length) {
      throw new UnauthorizedException('Email ou senha invalidos.');
    }

    const user = found[0];

    if (!user.passwordHash) {
      throw new UnauthorizedException('Usuario nao possui senha local.');
    }

    try {
      const ok = await bcrypt.compare(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Email ou senha invalidos.');
      }
    } catch (err) {
      console.error('AuthService.login bcrypt error', err);
      throw new UnauthorizedException('Email ou senha invalidos.');
    }

    const token = await this.signToken(user.id, user.accountId, user.role);

    return {
      user: {
        id: user.id,
        accountId: user.accountId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  // ===============================
  // JWT
  // ===============================
  signToken(userId: string, accountId: string, role: string) {
    const payload = {
      sub: userId,
      accountId,
      role,
    };

    return this.jwt.signAsync(payload, {
      secret: this.jwtSecret,
      expiresIn: this.accessExpiresIn,
    });
  }
}
