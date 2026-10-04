import * as SQLite from 'expo-sqlite';

import { CREATE_PRODUCTS_TABLE } from './product/schema';
import { CREATE_SALES_TABLE } from './sale/schema';


export async function initializeDatabase() {

  const db = await SQLite.openDatabaseAsync("stockroom")

  const tablesToCreate = [
    CREATE_PRODUCTS_TABLE,
    CREATE_SALES_TABLE
  ]

  await db.execAsync(tablesToCreate.join("\n"))

  return db
}
