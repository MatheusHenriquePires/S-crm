import { pool } from './db';
import {
  accountsPascal,
  accountsSnake,
  usersPascal,
  usersSnake,
} from './schema';

type Flavor = 'snake' | 'pascal';

let detectedFlavor: Flavor | null = null;
let detectedConvo: Flavor | null = null;
let detectedMsg: Flavor | null = null;
let detectedIntegration: Flavor | null = null;

async function detectFlavor(): Promise<Flavor> {
  if (detectedFlavor) return detectedFlavor;

  try {
    const res = await pool.query(
      "select to_regclass('public.accounts') as accounts_lc, to_regclass('public.\"Account\"') as accounts_uc, to_regclass('public.users') as users_lc, to_regclass('public.\"User\"') as users_uc",
    );
    const row = res.rows?.[0] ?? {};
    if (row.accounts_lc || row.users_lc) {
      detectedFlavor = 'snake';
    } else if (row.accounts_uc || row.users_uc) {
      detectedFlavor = 'pascal';
    } else {
      detectedFlavor = 'snake';
    }
  } catch (err) {
    console.error('Table flavor detection failed, defaulting to snake_case', err);
    detectedFlavor = 'snake';
  }

  return detectedFlavor;
}

async function detectConversationFlavor(): Promise<Flavor> {
  if (detectedConvo) return detectedConvo;
  try {
    const res = await pool.query(
      "select column_name from information_schema.columns where table_name='conversations'",
    );
    const cols = (res.rows || []).map((r: any) => String(r.column_name));
    if (cols.includes('account_id')) {
      detectedConvo = 'snake';
    } else if (cols.includes('accountId')) {
      detectedConvo = 'pascal';
    } else {
      detectedConvo = 'snake';
    }
  } catch (err) {
    console.error('Conversation table detection failed, defaulting to snake_case', err);
    detectedConvo = 'snake';
  }
  return detectedConvo;
}

async function detectMessageFlavor(): Promise<Flavor> {
  if (detectedMsg) return detectedMsg;
  try {
    const res = await pool.query(
      "select column_name from information_schema.columns where table_name='messages'",
    );
    const cols = (res.rows || []).map((r: any) => String(r.column_name));
    if (cols.includes('conversation_id')) {
      detectedMsg = 'snake';
    } else if (cols.includes('conversationId')) {
      detectedMsg = 'pascal';
    } else {
      detectedMsg = 'snake';
    }
  } catch (err) {
    console.error('Message table detection failed, defaulting to snake_case', err);
    detectedMsg = 'snake';
  }
  return detectedMsg;
}

async function detectIntegrationFlavor(): Promise<Flavor> {
  if (detectedIntegration) return detectedIntegration;
  try {
    const res = await pool.query(
      "select column_name from information_schema.columns where table_name='whatsapp_connections'",
    );
    const cols = (res.rows || []).map((r: any) => String(r.column_name));
    if (cols.includes('account_id')) {
      detectedIntegration = 'snake';
    } else if (cols.includes('accountId')) {
      detectedIntegration = 'pascal';
    } else {
      detectedIntegration = 'snake';
    }
  } catch (err) {
    console.error('Integration table detection failed, defaulting to snake_case', err);
    detectedIntegration = 'snake';
  }
  return detectedIntegration;
}

export async function getAccountsTable() {
  const flavor = await detectFlavor();
  return flavor === 'pascal' ? accountsPascal : accountsSnake;
}

export async function getUsersTable() {
  const flavor = await detectFlavor();
  return flavor === 'pascal' ? usersPascal : usersSnake;
}

export async function getConversationsTable() {
  const flavor = await detectConversationFlavor();
  return flavor === 'pascal'
    ? whatsappConversationsCamel
    : whatsappConversationsSnake;
}

export async function getMessagesTable() {
  const flavor = await detectMessageFlavor();
  return flavor === 'pascal' ? whatsappMessagesCamel : whatsappMessagesSnake;
}

export async function getWhatsappIntegrationsTable() {
  const flavor = await detectIntegrationFlavor();
  return flavor === 'pascal'
    ? whatsappIntegrationsCamel
    : whatsappIntegrationsSnake;
}
