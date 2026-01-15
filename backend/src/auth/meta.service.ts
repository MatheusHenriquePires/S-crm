import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { getAccountsTable, getUsersTable } from '../db/tables';
import { encryptPayload } from '../whatsapp/crypto';

type MetaTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type MetaUser = {
  id: string;
  name: string;
  email?: string;
};

@Injectable()
export class MetaAuthService {
  private appId = process.env.META_APP_ID;
  private appSecret = process.env.META_APP_SECRET;
  private redirectUri =
    process.env.META_REDIRECT_URI || 'http://localhost:3001/auth/meta/callback';
  private frontendUrl = process.env.APP_FRONTEND_URL || 'http://localhost:5173';
  private scopes =
    process.env.META_SCOPES ||
    'email,public_profile,business_management,whatsapp_business_management,whatsapp_business_messaging';

  buildLoginUrl(returnUrl?: string) {
    if (!this.appId) {
      throw new Error('META_APP_ID is not set');
    }
    const state = returnUrl ? encodeURIComponent(returnUrl) : '';
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes,
      state,
    });
    return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  }

  resolveReturnUrl(state?: string) {
    if (!state) return this.frontendUrl;
    try {
      const decoded = decodeURIComponent(state);
      if (decoded.startsWith(this.frontendUrl)) {
        return decoded;
      }
      return this.frontendUrl;
    } catch {
      return this.frontendUrl;
    }
  }

  async exchangeCode(code: string): Promise<MetaTokenResponse> {
    if (!this.appId || !this.appSecret) {
      throw new Error('META_APP_ID or META_APP_SECRET is not set');
    }
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    const response = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error('Failed to exchange code with Meta');
    }
    return response.json();
  }

  async getAppStatus() {
    if (!this.appId || !this.appSecret) {
      return { mode: 'unknown', permissions: [] as string[] };
    }
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'client_credentials',
    });
    const tokenResp = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`,
    );
    if (!tokenResp.ok) {
      return { mode: 'unknown', permissions: [] as string[] };
    }
    const tokenData = await tokenResp.json();
    const appToken = tokenData.access_token as string | undefined;
    if (!appToken) {
      return { mode: 'unknown', permissions: [] as string[] };
    }

    const appResp = await fetch(
      `https://graph.facebook.com/v20.0/${this.appId}?fields=app_name,app_type,app_roles,is_live&access_token=${appToken}`,
    );
    const permResp = await fetch(
      `https://graph.facebook.com/v20.0/${this.appId}/permissions?access_token=${appToken}`,
    );
    const appData = appResp.ok ? await appResp.json() : {};
    const permData = permResp.ok ? await permResp.json() : {};
    const perms = Array.isArray(permData?.data)
      ? permData.data.map((p: any) => p.permission)
      : [];

    return {
      mode: appData?.is_live ? 'live' : 'dev',
      appName: appData?.app_name,
      permissions: perms,
    };
  }

  async getUserProfile(accessToken: string): Promise<MetaUser> {
    const params = new URLSearchParams({
      fields: 'id,name,email',
      access_token: accessToken,
    });
    const response = await fetch(
      `https://graph.facebook.com/v20.0/me?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error('Failed to fetch Meta profile');
    }
    return response.json();
  }

  async upsertAccountAndUser(metaUser: MetaUser) {
    const accounts = await getAccountsTable();
    const users = await getUsersTable();
    const email = metaUser.email?.toLowerCase() || null;
    let accountId = '';
    let userId = '';

    if (email) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser.length) {
        accountId = existingUser[0].accountId;
        userId = existingUser[0].id;
        return { accountId, userId };
      }
    }

    accountId = createId();
    await db.insert(accounts).values({
      id: accountId,
      name: metaUser.name || 'Conta Meta',
      ownerName: metaUser.name || null,
      email,
    });

    userId = createId();
    await db.insert(users).values({
      id: userId,
      accountId,
      name: metaUser.name || 'Usuario Meta',
      email: email || `${accountId}@meta.local`,
      passwordHash: createId(),
      role: 'ADMIN',
    });

    return { accountId, userId };
  }

  async saveIntegration(
    accountId: string,
    metaUserId: string,
    accessToken: string,
  ) {
    const encryptedPayload = encryptPayload({ accessToken });
    await db.execute(
      `INSERT INTO "MetaIntegration" ("id", "accountId", "metaUserId", "encryptedPayload", "createdAt", "updatedAt")
       VALUES ('${createId()}', '${accountId}', '${metaUserId}', '${encryptedPayload}', now(), now())
       ON CONFLICT ("accountId") DO UPDATE SET "metaUserId" = EXCLUDED."metaUserId", "encryptedPayload" = EXCLUDED."encryptedPayload", "updatedAt" = now()` as any,
    );
  }
}
