/**
 * Feature 082 — 加工延壽良率種子腳本。
 *
 * 替常見食材帶入預設 processedYieldRatio（加工延壽良率），讓使用者不必逐一手填。
 * 計畫由純函式 preservationYieldSeedPlanner 產生；本腳本只負責讀取與寫入。
 *
 * 安全原則（沿用 Feature 030 backfill）：
 *   - Merge-only：已有良率的食材不動。
 *   - 不臆測：名稱/類別都對不上的食材跳過（noMatch）。
 *   - 乾貨（isPerishable === false）略過。
 *   - Dry-run by default：預設只印報表、不寫入；需 --execute 才寫。
 *
 * Run with:
 *   npx dotenv -e ../.env -- npx tsx scripts/seedPreservationYields.ts            # dry-run（預設）
 *   npx dotenv -e ../.env -- npx tsx scripts/seedPreservationYields.ts --execute   # 寫入 Firestore
 *
 * 需要與其他腳本相同的 VITE_FIREBASE_* 環境變數。
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import {
  planYieldSeedBatch,
  type YieldSeedIngredient,
  type YieldSeedResult,
  type YieldSeedAction,
} from '../src/services/preservationYieldSeedPlanner';

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

function printReport(results: YieldSeedResult[]): void {
  const byAction: Record<YieldSeedAction, YieldSeedResult[]> = {
    willSet: [], alreadySet: [], noMatch: [], skippedNonPerishable: [],
  };
  for (const r of results) byAction[r.action].push(r);

  console.log('\n=== Feature 082 加工延壽良率種子 — Dry-Run 報表 ===\n');
  console.log(`食材總數：${results.length}`);
  for (const a of Object.keys(byAction) as YieldSeedAction[]) {
    console.log(`  ${a}: ${byAction[a].length}`);
  }

  if (byAction.willSet.length > 0) {
    console.log('\n--- 將設定良率 (willSet) ---');
    for (const r of byAction.willSet) {
      console.log(`  [${r.id}] ${r.name} → ${r.ratio}　(${r.matchedRule})`);
    }
  }
  if (byAction.noMatch.length > 0) {
    console.log('\n--- 未命中、跳過 (noMatch，可日後手動設定) ---');
    for (const r of byAction.noMatch) console.log(`  [${r.id}] ${r.name}`);
  }
  console.log('\n=== 報表結束 ===\n');
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, 'group-meal');

  const snap = await getDocs(collection(db, 'ingredients'));
  const docs: YieldSeedIngredient[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: (data.name as string) ?? d.id,
      category: data.category as string | undefined,
      processedYieldRatio: data.processedYieldRatio as number | undefined,
      isPerishable: data.isPerishable as boolean | undefined,
    };
  });

  const results = planYieldSeedBatch(docs);
  printReport(results);

  if (!execute) {
    console.log('Dry-run only — 未寫入。加上 --execute 才會寫入 Firestore。');
    return;
  }

  console.log('\n--execute 已指定 — 開始寫入良率…\n');
  let count = 0;
  for (const r of results) {
    if (r.action !== 'willSet' || r.ratio == null) continue;
    await updateDoc(doc(db, 'ingredients', r.id), { processedYieldRatio: r.ratio });
    console.log(`  ✓ ${r.id} (${r.name}) → ${r.ratio}`);
    count++;
  }
  console.log(`\n完成，共設定 ${count} 項食材良率。`);
}

const isDirectRun =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error('良率種子腳本失敗：', err);
    process.exit(1);
  });
}
