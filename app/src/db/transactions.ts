import { Platform } from 'react-native';

import { getDatabase } from './db';

export type Database = Awaited<ReturnType<typeof getDatabase>>;

export async function runInTransaction<T>(
  database: Database,
  task: (transaction: Database) => Promise<T>
): Promise<T> {
  let result: T | undefined;
  let completed = false;
  const execute = async (transaction: Database) => {
    result = await task(transaction);
    completed = true;
  };

  if (Platform.OS === 'web') {
    await database.withTransactionAsync(() => execute(database));
  } else {
    await database.withExclusiveTransactionAsync((transaction) => execute(transaction));
  }

  if (!completed) {
    throw new Error('transactionDidNotReturn');
  }
  return result as T;
}
