/**
 * Feature 091 — 菜色類別種子腳本。
 *
 * 依配方名稱自動猜「菜色類別」（主菜/主食/蔬菜/湯），讓菜單平衡檢查(089)與
 * 一鍵均衡菜單(090)立刻有資料可用。計畫由純函式 dishCategorySeedPlanner 產生；
 * 本腳本只負責讀取與寫入。
 *
 * 安全原則：merge-only（已分類不動）、不臆測（對不上關鍵字跳過）。
 * Dry-run by default——預設只印報表；需 --execute 才寫入。「其他」不自動指派，
 * 猜測可能不完美，寫入後仍可在配方管理逐一手動調整。
 *
 * Run with:
 *   npx dotenv -e ../.env -- npx tsx scripts/seedDishCategories.ts            # dry-run（預設）
 *   npx dotenv -e ../.env -- npx tsx scripts/seedDishCategories.ts --execute   # 寫入 Firestore
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import type { DishCategory } from '../src/services/types';
import {
  planDishCategorySeedBatch,
  type DishCategorySeedRecipe,
  type DishCategorySeedResult,
  type DishCategorySeedAction,
} from '../src/services/dishCategorySeedPlanner';

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

function printReport(results: DishCategorySeedResult[]): void {
  const byAction: Record<DishCategorySeedAction, DishCategorySeedResult[]> = {
    willSet: [], alreadySet: [], noMatch: [],
  };
  for (const r of results) byAction[r.action].push(r);

  console.log('\n=== Feature 091 菜色類別種子 — Dry-Run 報表 ===\n');
  console.log(`配方總數：${results.length}`);
  for (const a of Object.keys(byAction) as DishCategorySeedAction[]) {
    console.log(`  ${a}: ${byAction[a].length}`);
  }

  if (byAction.willSet.length > 0) {
    console.log('\n--- 將設定類別 (willSet) ---');
    for (const r of byAction.willSet) console.log(`  [${r.id}] ${r.name} → ${r.category}`);
  }
  if (byAction.noMatch.length > 0) {
    console.log('\n--- 猜不出、跳過（請於配方管理手動設定）---');
    for (const r of byAction.noMatch) console.log(`  [${r.id}] ${r.name}`);
  }
  console.log('\n=== 報表結束 ===\n');
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, 'group-meal');

  const snap = await getDocs(collection(db, 'recipes'));
  const recipes: DishCategorySeedRecipe[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: (data.name as string) ?? d.id,
      category: data.category as DishCategory | undefined,
    };
  });

  const results = planDishCategorySeedBatch(recipes);
  printReport(results);

  if (!execute) {
    console.log('Dry-run only — 未寫入。加上 --execute 才會寫入 Firestore。');
    return;
  }

  console.log('\n--execute 已指定 — 開始寫入類別…\n');
  let count = 0;
  for (const r of results) {
    if (r.action !== 'willSet' || !r.category) continue;
    await updateDoc(doc(db, 'recipes', r.id), { category: r.category });
    console.log(`  ✓ ${r.id} (${r.name}) → ${r.category}`);
    count++;
  }
  console.log(`\n完成，共設定 ${count} 道配方類別。可於配方管理手動調整。`);
}

const isDirectRun =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error('菜色類別種子腳本失敗：', err);
    process.exit(1);
  });
}
