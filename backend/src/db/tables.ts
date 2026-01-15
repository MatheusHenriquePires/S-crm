import { pool } from './db';
import {
  accountsPascal,
  accountsSnake,
  usersPascal,
  usersSnake,
} from './schema';

type Flavor = 'snake' | 'pascal';

let detectedFlavor: Flavor | null = null;

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

export async function getAccountsTable() {
  const flavor = await detectFlavor();
  return flavor === 'pascal' ? accountsPascal : accountsSnake;
}

export async function getUsersTable() {
  const flavor = await detectFlavor();
  return flavor === 'pascal' ? usersPascal : usersSnake;
}
