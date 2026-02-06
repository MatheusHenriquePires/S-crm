import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

import { db } from '../db/db';
import { getAccountsTable, getUsersTable } from '../db/tables';
import { SignupAccountDto } from './dto/signup-account.dto';
import { SignupUserDto } from './dto/signup-user.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly accessExpiresIn: string | number;
  private readonly saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  constructor(private jwt: JwtService) {
    this.jwtSecret = process.env.JWT_SECRET || '';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is not set');
    }
    // Permite configurar via env (ex.: "7d"); default: 7 dias
    this.accessExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
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

    const inserted = await db
      .insert(accounts)
      .values({
        name: dto.name,
        ownerName: dto.ownerName ?? null,
        email: dto.email ?? null,
      })
      .returning({ id: accounts.id });

    const accountId = inserted?.[0]?.id;
    if (!accountId) {
      throw new InternalServerErrorException('Falha ao criar conta.');
    }

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

    const inserted = await db
      .insert(users)
      .values({
        accountId: dto.accountId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: 'ADMIN',
      })
      .returning({
        id: users.id,
        accountId: users.accountId,
        name: users.name,
        email: users.email,
        role: users.role,
      });

    const user = inserted?.[0];
    if (!user) {
      throw new InternalServerErrorException('Falha ao criar usuario.');
    }

    const token = await this.signToken(user.id, user.accountId, user.role);

    return { user, token };
  }

  // ===============================
  // LOGIN
  // ===============================
  async login(dto: LoginDto) {
    const users = await getUsersTable();
    let found: (typeof users.$inferSelect)[] = [];
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
      expiresIn: this.accessExpiresIn as any,
    });
  }
}
