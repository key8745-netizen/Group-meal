/**
 * CraftingBench — 今日開工的「灶台合成」挑菜介面。
 *
 * 左：配方背包（類別篩選、成本/份、惜食、近期出過、推薦、庫存可做份數）。
 * 右：依菜色配額排的灶台格 + 加菜區 + 成品（每人成本 vs 目標）+ 開火。
 * 點背包裡的菜 → 飛進同類別的格子（framer-motion 共用 layoutId）；點格子裡的菜 → 退回背包。
 *
 * 純呈現元件：所有資料與動作（選取、開工、推薦…）都由 DayStartPage 傳入，
 * 格子分配由純函式 `assignBenchSlots` 決定；開工的菜色 = 全部已選的菜（含加菜）。
 */

import { useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { LayoutGroup, MotionConfig, motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import type { CostAwareRecipeAssessmentItem, DishCategory, Recipe } from '@/services/types';
import type { RecipeCostEstimate } from '@/services/costAwareMenuSuggestionService';
import type { BalancedMenuQuota } from '@/services/balancedMenuPlanner';
import { assignBenchSlots } from '@/services/craftingBenchPlanner';

const SPRING = { type: 'spring', stiffness: 420, damping: 30 } as const;
const HOVER = { y: -3, transition: { type: 'spring', stiffness: 400, damping: 18 } } as const;
const TAP = { scale: 0.95 } as const;

const CATEGORY_COLOR: Record<DishCategory, string> = {
  主菜: '#d39a7c',
  主食: '#d8c08e',
  蔬菜: '#9fb3a1',
  湯: '#8f9db4',
  其他: '#bfb2c4',
};
const FILTERS: (DishCategory | '全部')[] = ['全部', '主菜', '主食', '蔬菜', '湯', '其他'];

export interface PickedCost {
  perPerson: number;
  incompleteCount: number;
  pricedDishCount: number;
}

export interface CraftingBenchProps {
  /** 全部配方（找已選菜的資料用）。 */
  recipes: Recipe[];
  /** 背包顯示的配方（已套用搜尋與推薦排序）。 */
  bagRecipes: Recipe[];
  loading: boolean;
  picked: Set<string>;
  onToggle: (recipeId: string) => void;
  quotas: BalancedMenuQuota[];
  search: string;
  onSearchChange: (value: string) => void;
  /** 背包上方的工具列（帶入月菜單、一鍵均衡、推薦…）。 */
  toolbar?: ReactNode;
  costEstimateByRecipeId: Map<string, RecipeCostEstimate>;
  assessmentByRecipeId: Map<string, CostAwareRecipeAssessmentItem> | null;
  rankedIds: string[] | null;
  rankBadgeCount: number;
  clearingIds: Set<string>;
  recentIds: Set<string>;
  headCount: number;
  pickedCost: PickedCost;
  targetCostPerServing: number;
  hasMarketSnapshot: boolean;
  onStart: () => void;
}

function categoryOf(r: Recipe | undefined): DishCategory {
  return r?.category ?? '其他';
}

function trackGlow(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
}

function DishGlyph({ recipe, size = 'md' }: { recipe: Recipe; size?: 'md' | 'lg' }) {
  const color = CATEGORY_COLOR[categoryOf(recipe)];
  return (
    <span
      className={`craft-glyph ${size === 'lg' ? 'h-11 w-11 text-xl' : 'h-9 w-9 text-base'}`}
      style={{ '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      {recipe.name.slice(0, 1)}
    </span>
  );
}

export function CraftingBench(props: CraftingBenchProps) {
  const {
    recipes, bagRecipes, loading, picked, onToggle, quotas, search, onSearchChange, toolbar,
    costEstimateByRecipeId, assessmentByRecipeId, rankedIds, rankBadgeCount, clearingIds, recentIds,
    headCount, pickedCost, targetCostPerServing, hasMarketSnapshot, onStart,
  } = props;
  const [filter, setFilter] = useState<DishCategory | '全部'>('全部');

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const layout = useMemo(
    () => assignBenchSlots(picked, new Map(recipes.map((r) => [r.id, r.category])), quotas),
    [picked, recipes, quotas],
  );
  const bag = useMemo(
    () => bagRecipes.filter((r) => !picked.has(r.id) && (filter === '全部' || categoryOf(r) === filter)),
    [bagRecipes, picked, filter],
  );
  const repeats = [...picked].filter((id) => recentIds.has(id)).map((id) => recipeById.get(id)?.name).filter(Boolean);

  function costText(id: string): string | null {
    const a = assessmentByRecipeId?.get(id);
    if (a) return a.estimatedCostPerServing != null ? `$${a.estimatedCostPerServing.toFixed(1)}/份` : '成本未知';
    const e = costEstimateByRecipeId.get(id);
    if (e && e.costPerServing != null) return `$${e.costPerServing.toFixed(1)}/份${e.complete ? '' : '*'}`;
    return null;
  }

  const over = targetCostPerServing > 0 && pickedCost.perPerson > targetCostPerServing;
  const targetPct = targetCostPerServing > 0 ? Math.min(100, (pickedCost.perPerson / targetCostPerServing) * 100) : 0;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="craft craft-surface grid gap-4 rounded-[24px] p-3 sm:p-4 md:grid-cols-[1.1fr_1fr]">
          {/* ── 配方背包 ── */}
          <section className="craft-panel flex min-w-0 flex-col gap-3 rounded-[20px] p-4" onPointerMove={trackGlow} aria-labelledby="craftBagTitle">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="craftBagTitle" className="text-sm font-medium">配方背包</h2>
              <input
                id="craftSearch"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜尋配方…"
                aria-label="搜尋配方"
                className="craft-input h-8 w-36 rounded-full px-3 text-sm"
              />
            </div>
            {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="依類別篩選">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className="craft-chip rounded-full px-3 py-1 text-xs"
                >
                  {f}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="載入配方中">
                {Array.from({ length: 6 }, (_, i) => <div key={i} className="craft-shimmer h-[92px] rounded-2xl" />)}
              </div>
            ) : recipes.length === 0 ? (
              <p className="py-6 text-center text-sm craft-muted">還沒有配方。先到「配方管理」建立，或在配方管理按「匯入工具 → 從月菜單產生配方草稿」。</p>
            ) : bag.length === 0 ? (
              <p className="py-6 text-center text-sm craft-muted">{picked.size > 0 && !search && filter === '全部' ? '背包裡的菜都上灶台了。' : '沒有符合的配方。'}</p>
            ) : (
              <ul className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {bag.map((r) => {
                  const rank = rankedIds ? rankedIds.indexOf(r.id) : -1;
                  const stock = assessmentByRecipeId?.get(r.id)?.maxServingsFromStock;
                  const cost = costText(r.id);
                  return (
                    <li key={r.id} className="min-w-0">
                      <motion.button
                        type="button"
                        layoutId={`craft-${r.id}`}
                        transition={SPRING}
                        whileHover={HOVER}
                        whileTap={TAP}
                        onClick={() => onToggle(r.id)}
                        className="craft-tile flex h-full w-full flex-col gap-1.5 rounded-2xl p-2.5 text-left"
                        style={{ '--c': CATEGORY_COLOR[categoryOf(r)] } as CSSProperties}
                        aria-label={`放上灶台：${r.name}`}
                      >
                        <span className="flex items-start gap-2">
                          <DishGlyph recipe={r} />
                          <span className="line-clamp-2 min-w-0 text-sm font-medium leading-snug">{r.name}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1 text-[11px] tabular-nums craft-muted">
                          {cost && <span>{cost}</span>}
                          {stock != null && <span>・庫存可做 {stock} 份</span>}
                        </span>
                        {(clearingIds.has(r.id) || recentIds.has(r.id) || (rank >= 0 && rank < rankBadgeCount)) && (
                          <span className="flex flex-wrap gap-1">
                            {rank >= 0 && rank < rankBadgeCount && <span className="craft-badge craft-badge-gold">推薦 #{rank + 1}</span>}
                            {clearingIds.has(r.id) && <span className="craft-badge craft-badge-ember">惜食</span>}
                            {recentIds.has(r.id) && <span className="craft-badge">近 3 天出過</span>}
                          </span>
                        )}
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── 灶台 ── */}
          <section className="craft-panel flex min-w-0 flex-col gap-4 rounded-[20px] p-4" onPointerMove={trackGlow} aria-labelledby="craftBenchTitle">
            <div className="flex items-center justify-between">
              <h2 id="craftBenchTitle" className="text-sm font-medium">灶台</h2>
              <span className="text-xs tabular-nums craft-muted">
                {layout.filled}/{layout.slots.length} 格{layout.extras.length > 0 && `・加菜 ${layout.extras.length}`}
              </span>
            </div>

            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {layout.slots.map((slot, i) => {
                const r = slot.recipeId ? recipeById.get(slot.recipeId) : undefined;
                return (
                  <li key={`${slot.category}-${i}`} className="craft-slot min-h-[76px] rounded-2xl" style={{ '--c': CATEGORY_COLOR[slot.category] } as CSSProperties}>
                    {r ? (
                      <BenchDish recipe={r} cost={costText(r.id)} onRemove={() => onToggle(r.id)} />
                    ) : (
                      <span className="flex h-full min-h-[76px] items-center justify-center text-xs craft-muted">{slot.category}</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {layout.extras.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs craft-muted">加菜（超出配額，一樣會開工）</span>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {layout.extras.map((id) => {
                    const r = recipeById.get(id);
                    return r ? (
                      <li key={id} className="craft-slot min-h-[76px] rounded-2xl" style={{ '--c': CATEGORY_COLOR[categoryOf(r)] } as CSSProperties}>
                        <BenchDish recipe={r} cost={costText(id)} onRemove={() => onToggle(id)} />
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}

            {/* ── 成品 ── */}
            <div className="craft-result flex flex-col gap-2.5 rounded-2xl p-3.5" data-ready={picked.size > 0}>
              {picked.size === 0 ? (
                <p className="text-sm craft-muted">點背包裡的菜放上灶台，或用上方「一鍵均衡菜單」「帶入月菜單」。</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm">{picked.size} 道菜 × {headCount} 人份</span>
                    {pickedCost.pricedDishCount > 0 && (
                      <span className="text-sm tabular-nums">
                        每人 <b className="font-semibold">${pickedCost.perPerson.toFixed(1)}</b>
                        <span className="craft-muted">・共 NT$ {Math.round(pickedCost.perPerson * headCount).toLocaleString('zh-TW')}</span>
                      </span>
                    )}
                  </div>
                  {targetCostPerServing > 0 && pickedCost.pricedDishCount > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="craft-bar" aria-hidden="true">
                        <motion.i
                          className={over ? 'craft-bar-over' : ''}
                          initial={false}
                          animate={{ width: `${targetPct}%` }}
                          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                        />
                      </div>
                      <span className={`text-xs tabular-nums ${over ? 'craft-warn' : 'craft-ok'}`}>
                        {over
                          ? `超出目標 $${targetCostPerServing}/人（+$${(pickedCost.perPerson - targetCostPerServing).toFixed(1)}/人，${headCount} 人多 NT$ ${Math.round((pickedCost.perPerson - targetCostPerServing) * headCount).toLocaleString('zh-TW')}）`
                          : `低於目標 $${targetCostPerServing}/人（還有 $${(targetCostPerServing - pickedCost.perPerson).toFixed(1)} 空間）`}
                      </span>
                    </div>
                  )}
                  {pickedCost.incompleteCount > 0 && (
                    <span className="text-xs craft-muted">{pickedCost.incompleteCount} 道成本不完整（*），實際會略高</span>
                  )}
                  {repeats.length > 0 && <span className="text-xs craft-warn">近 3 天出過：{repeats.join('、')}</span>}
                  <span className="text-[11px] craft-muted">
                    {hasMarketSnapshot ? '成本以今日市價優先、無市價用基準價' : '今日無市價快取，成本以基準價估算'}
                  </span>
                </>
              )}
            </div>

            <motion.button
              type="button"
              disabled={picked.size === 0}
              onClick={onStart}
              whileHover={picked.size > 0 ? { y: -2 } : undefined}
              whileTap={picked.size > 0 ? TAP : undefined}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="craft-fire inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-sm font-medium"
            >
              <Flame size={16} />
              開火（{picked.size} 道 × {headCount} 人份）
            </motion.button>
            <p className="text-[11px] leading-relaxed craft-muted">
              開火會依序建立：當日菜單 → 備料 → 採購需求草稿（已扣現有庫存）→ 製程任務 → 排程建議。全部是草稿，採購不會自動送出。
            </p>
          </section>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function BenchDish({ recipe, cost, onRemove }: { recipe: Recipe; cost: string | null; onRemove: () => void }) {
  return (
    <motion.button
      type="button"
      layoutId={`craft-${recipe.id}`}
      transition={SPRING}
      whileHover={HOVER}
      whileTap={TAP}
      onClick={onRemove}
      className="craft-tile craft-tile-placed flex h-full min-h-[76px] w-full items-center gap-2 rounded-2xl p-2.5 text-left"
      style={{ '--c': CATEGORY_COLOR[categoryOf(recipe)] } as CSSProperties}
      aria-label={`從灶台拿下：${recipe.name}`}
    >
      <DishGlyph recipe={recipe} size="lg" />
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{recipe.name}</span>
        {cost && <span className="text-[11px] tabular-nums craft-muted">{cost}</span>}
      </span>
    </motion.button>
  );
}
