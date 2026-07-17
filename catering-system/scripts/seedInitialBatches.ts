/**
 * Feature 087 — 初始批次種子腳本。
 *
 * 替「有 currentStock 但無批次」的易腐食材建立一筆初始批次，讓保鮮系統看得見
 * 架上既有庫存（否則保鮮警示只涵蓋批次功能上線後的新進貨）。計畫由純函式
 * initialBatchSeedPlanner 產生；本腳本只負責讀取與寫入。
 *
 * 安全原則：merge-only（已有批次者不動）、乾貨略過、無庫存略過、無保存天數略過
 * （不臆測效期）。初始批次入庫日與效期為估計（以今日起算完整保存期），
 * sourceNote 已標明，使用者可於「批次明細」再調整。Dry-run by default。
 *
 * Run with:
 *   npx dotenv -e ../.env -- npx tsx scripts/seedInitialBatches.ts            # dry-run（預設）
 *   npx dotenv -e ../.env -- npx tsx scripts/seedInitialBatches.ts --execute   # 寫入 Firestore
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, collectionGroup, getDocs, doc, setDoc } from 'firebase/firestore';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import type { IngredientFreshnessParams, InventoryBatch, InventoryDoc } from '../src/services/types';
import {
  planInitialBatchSeedBatch,
  type InitialBatchSeedIngredient,
  type InitialBatchSeedResult,
  type InitialBatchSeedAction,
} from '../src/services/initialBatchSeedPlanner';
import { nextBatchId } from '../src/services/inventoryBatchPlanner';
import { todayLocalIsoDate } from '../src/services/marketPriceService';

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

function printReport(results: InitialBatchSeedResult[]): void {
  const byAction: Record<InitialBatchSeedAction, InitialBatchSeedResult[]> = {
    willSeed: [], alreadyHasBatches: [], skippedNonPerishable: [], noStock: [], noShelfLife: [],
  };
  for (const r of results) byAction[r.action].push(r);

  console.log('\n=== Feature 087 初始批次種子 — Dry-Run 報表 ===\n');
  console.log(`食材總數：${results.length}`);
  for (const a of Object.keys(byAction) as InitialBatchSeedAction[]) {
    console.log(`  ${a}: ${byAction[a].length}`);
  }

  if (byAction.willSeed.length > 0) {
    console.log('\n--- 將建立初始批次 (willSeed) ---');
    for (const r of byAction.willSeed) {
      console.log(`  [${r.id}] ${r.name} → ${r.batch?.qtyKg}kg ${r.batch?.storageType} 效期 ${r.batch?.expirationDate}`);
    }
  }
  if (byAction.noShelfLife.length > 0) {
    console.log('\n--- 無保存天數、跳過（請先於食材主檔設定保存天數）---');
    for (const r of byAction.noShelfLife) console.log(`  [${r.id}] ${r.name}`);
  }
  console.log('\n=== 報表結束 ===\n');
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const today = todayLocalIsoDate();

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, 'group-meal');

  const [ingredientSnap, inventorySnap, batchSnap] = await Promise.all([
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'inventory')),
    getDocs(collectionGroup(db, 'batches')),
  ]);

  const stockById = new Map<string, number>();
  inventorySnap.docs.forEach((d) => {
    const inv = d.data() as InventoryDoc;
    if (typeof inv.currentStock === 'number') stockById.set(d.id, inv.currentStock);
  });

  const ingredientIdsWithBatches = new Set<string>();
  batchSnap.docs.forEach((d) => {
    const b = d.data() as Omit<InventoryBatch, 'id'>;
    if (b.ingredientId) ingredientIdsWithBatches.add(b.ingredientId);
  });

  const list: InitialBatchSeedIngredient[] = ingredientSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown> & IngredientFreshnessParams;
    return {
      id: d.id,
      name: (data.name as string) ?? d.id,
      currentStockKg: stockById.get(d.id) ?? 0,
      hasBatches: ingredientIdsWithBatches.has(d.id),
      params: {
        isPerishable: data.isPerishable,
        defaultStorageType: data.defaultStorageType,
        shelfLifeDaysChilled: data.shelfLifeDaysChilled,
        shelfLifeDaysFrozen: data.shelfLifeDaysFrozen,
        shelfLifeDaysAmbient: data.shelfLifeDaysAmbient,
      },
    };
  });

  const results = planInitialBatchSeedBatch(list, today);
  printReport(results);

  if (!execute) {
    console.log('Dry-run only — 未寫入。加上 --execute 才會寫入 Firestore。');
    return;
  }

  console.log('\n--execute 已指定 — 開始建立初始批次…\n');
  let count = 0;
  for (const r of results) {
    if (r.action !== 'willSeed' || !r.batch) continue;
    const id = nextBatchId(r.batch.receivedDate, []); // 無既有批次，第一筆
    const data: Omit<InventoryBatch, 'id'> = {
      ingredientId: r.id,
      storageType: r.batch.storageType,
      receivedDate: r.batch.receivedDate,
      expirationDate: r.batch.expirationDate,
      qtyReceivedKg: r.batch.qtyKg,
      qtyRemainingKg: r.batch.qtyKg,
      sourceNote: r.batch.sourceNote,
    };
    await setDoc(doc(db, 'inventory', r.id, 'batches', id), data);
    console.log(`  ✓ ${r.id} (${r.name}) → 批次 #${id} ${r.batch.qtyKg}kg`);
    count++;
  }
  console.log(`\n完成，共建立 ${count} 筆初始批次。`);
}

const isDirectRun =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error('初始批次種子腳本失敗：', err);
    process.exit(1);
  });
}
