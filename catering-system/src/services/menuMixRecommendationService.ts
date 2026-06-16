import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type {
  ProductionWorkflowPlan,
  ProcessType,
  EquipmentType,
  AvailableStaffInput,
  AvailableEquipmentInput,
  MenuMixConstraints,
  MenuMixRecommendationItem,
  MenuMixRecommendation,
  MenuMixRecommendationStatus,
  MenuMixRiskLevel,
} from './types';

export interface MenuMixRecommendationInput {
  targetServingCount: number;
  targetServiceDateTime: Date;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  candidateRecipeIds: string[];
  constraints: MenuMixConstraints;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
}

interface RecipeWorkflowMetadata {
  recipeId: string;
  primaryProcessType: ProcessType;
  primaryEquipmentType: EquipmentType;
  totalRecipeTaskMinutes: number;
  staffMinutesByRole: Record<string, number>;
}

// Resolve workflow metadata for a recipe from active plans' active tasks
function resolveRecipeWorkflowMetadata(
  plans: ProductionWorkflowPlan[],
  recipeId: string,
): RecipeWorkflowMetadata | null {
  const linkedTasks = plans
    .filter((p) => p.isActive && p.status !== 'archived')
    .flatMap((p) => p.tasks)
    .filter((t) => t.taskStatus === 'active' && t.recipeId === recipeId);

  if (linkedTasks.length === 0) return null;

  const totalRecipeTaskMinutes = linkedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

  // primaryProcessType = processType with highest estimatedMinutes
  const processTotals: Record<string, number> = {};
  for (const t of linkedTasks) {
    processTotals[t.processType] = (processTotals[t.processType] ?? 0) + t.estimatedMinutes;
  }
  const primaryProcessType = Object.entries(processTotals).sort(([, a], [, b]) => b - a)[0][0] as ProcessType;

  // primaryEquipmentType = equipmentType (excluding 'none') with highest estimatedMinutes
  const equipTotals: Record<string, number> = {};
  for (const t of linkedTasks) {
    if (t.equipmentType !== 'none') {
      equipTotals[t.equipmentType] = (equipTotals[t.equipmentType] ?? 0) + t.estimatedMinutes;
    }
  }
  const primaryEquipmentType: EquipmentType =
    Object.keys(equipTotals).length > 0
      ? (Object.entries(equipTotals).sort(([, a], [, b]) => b - a)[0][0] as EquipmentType)
      : 'none';

  // staffMinutesByRole
  const staffMinutesByRole: Record<string, number> = {};
  for (const t of linkedTasks) {
    if (t.staffRole) {
      staffMinutesByRole[t.staffRole] =
        (staffMinutesByRole[t.staffRole] ?? 0) + t.estimatedMinutes * t.staffCount;
    }
  }

  return { recipeId, primaryProcessType, primaryEquipmentType, totalRecipeTaskMinutes, staffMinutesByRole };
}

// isFriedProcess / isBakedProcess removed:
// ProcessType (wash|peel|cut|marinate|blanch|preCook|cool|portion|cook|hold|clean)
// cannot reliably identify fried/baked cooking methods. CookingMethod is the correct
// discriminator but is not aggregated onto RecipeWorkflowMetadata in v1.
// maxFriedRatio / maxBakedRatio are therefore treated as unenforceable in v1.

export type MenuMixRecommendationResult = Omit<MenuMixRecommendation, 'id' | 'createdAt' | 'createdBy'>;

// Pure function — zero Firestore writes
export function calculateMenuMixRecommendation(
  input: MenuMixRecommendationInput,
  plans: ProductionWorkflowPlan[],
  recipeNameSnapshots: Record<string, string>,
): MenuMixRecommendationResult {
  const {
    targetServingCount,
    targetServiceDateTime,
    capacityWindowMinutes,
    bufferMinutes,
    candidateRecipeIds,
    constraints,
    availableStaff,
    availableEquipment,
  } = input;

  if (targetServingCount <= 0) throw new Error('targetServingCount must be > 0');
  if (capacityWindowMinutes <= 0) throw new Error('capacityWindowMinutes must be > 0');
  if (bufferMinutes < 0) throw new Error('bufferMinutes must be >= 0');
  if (bufferMinutes >= capacityWindowMinutes) throw new Error('bufferMinutes must be < capacityWindowMinutes');

  const effectiveWindowMinutes = capacityWindowMinutes - bufferMinutes;
  const manualReviewNotes: string[] = [];
  const excludedSet = new Set(constraints.excludedRecipeIds ?? []);

  // Unenforced constraint warnings
  if (constraints.maxFriedRatio !== undefined || constraints.maxBakedRatio !== undefined) {
    manualReviewNotes.push(
      'Fried/baked ratio constraints cannot be verified from current workflow metadata (ProcessType does not reliably identify cooking method) and are not enforced in v1',
    );
  }

  if (
    (constraints.requiredCategories && constraints.requiredCategories.length > 0) ||
    constraints.vegetarianRequired ||
    (constraints.allergenAvoidance && constraints.allergenAvoidance.length > 0)
  ) {
    manualReviewNotes.push(
      'Recipe category/vegetarian/allergen fields do not exist in current data model; these constraints cannot be verified and are not enforced',
    );
  }

  // Build eligible recipes
  interface EligibleRecipe {
    meta: RecipeWorkflowMetadata;
    nameSnapshot: string;
  }
  const eligibleRecipes: EligibleRecipe[] = [];

  for (const recipeId of candidateRecipeIds) {
    if (excludedSet.has(recipeId)) continue;
    const meta = resolveRecipeWorkflowMetadata(plans, recipeId);
    if (!meta) {
      manualReviewNotes.push(
        `Recipe ${recipeNameSnapshots[recipeId] ?? recipeId} has no resolvable active workflow tasks and is excluded`,
      );
      continue;
    }
    eligibleRecipes.push({ meta, nameSnapshot: recipeNameSnapshots[recipeId] ?? recipeId });
  }

  const notRecommendedResult = (reason: string): MenuMixRecommendationResult => {
    manualReviewNotes.push(reason);
    return {
      targetServingCount,
      targetServiceDateTime: Timestamp.fromDate(targetServiceDateTime),
      capacityWindowMinutes,
      bufferMinutes,
      candidateRecipeIds,
      constraints,
      availableStaff,
      availableEquipment,
      recommendedMixItems: [],
      recommendationStatus: 'notRecommended',
      riskLevel: 'high',
      estimatedProcessLoadSummary: {},
      estimatedEquipmentLoadRatios: {},
      estimatedStaffLoadRatios: {},
      bottleneckWarnings: [],
      manualReviewNotes,
    };
  };

  if (eligibleRecipes.length === 0) {
    return notRecommendedResult('No eligible recipes after applying exclusions and metadata resolution');
  }

  // Serving allocation — deterministic 1-serving round-robin
  const servingCounts: Record<string, number> = {};
  for (const r of eligibleRecipes) servingCounts[r.meta.recipeId] = 0;

  // Track per-process and per-equipment total servings for constraint checks
  const processTotalServings: Record<string, number> = {};
  const equipmentTotalServings: Record<string, number> = {};

  let remaining = targetServingCount;

  // Helper: check if allocating 1 more serving to a recipe violates constraints
  function wouldViolate(r: EligibleRecipe): boolean {
    const { meta } = r;
    const nextCount = (servingCounts[meta.recipeId] ?? 0) + 1;
    const nextProcessTotal = (processTotalServings[meta.primaryProcessType] ?? 0) + 1;
    const nextEquipTotal = (equipmentTotalServings[meta.primaryEquipmentType] ?? 0) + 1;

    // maxFriedRatio / maxBakedRatio: not enforced in v1 (see manualReviewNotes above)
    void nextCount;

    if (
      constraints.maxSameProcessRatio !== undefined &&
      nextProcessTotal / targetServingCount > constraints.maxSameProcessRatio
    ) return true;

    if (
      constraints.maxSameEquipmentRatio !== undefined &&
      meta.primaryEquipmentType !== 'none' &&
      nextEquipTotal / targetServingCount > constraints.maxSameEquipmentRatio
    ) return true;

    return false;
  }

  // Phase A: preferred recipes get allocation first
  const preferredIds = new Set(constraints.preferredRecipeIds ?? []);
  for (const r of eligibleRecipes) {
    if (!preferredIds.has(r.meta.recipeId)) continue;
    if (remaining <= 0) break;
    if (excludedSet.has(r.meta.recipeId)) {
      manualReviewNotes.push(
        `Recipe ${r.nameSnapshot} appears in both preferredRecipeIds and excludedRecipeIds; excluded takes priority`,
      );
      continue;
    }
    if (!wouldViolate(r)) {
      servingCounts[r.meta.recipeId]++;
      processTotalServings[r.meta.primaryProcessType] =
        (processTotalServings[r.meta.primaryProcessType] ?? 0) + 1;
      if (r.meta.primaryEquipmentType !== 'none') {
        equipmentTotalServings[r.meta.primaryEquipmentType] =
          (equipmentTotalServings[r.meta.primaryEquipmentType] ?? 0) + 1;
      }
      remaining--;
    }
  }

  // Phase B: round-robin, lowest load first
  let stuckRounds = 0;
  while (remaining > 0) {
    // Sort by current estimatedLoadContribution ascending (lowest load first)
    const sorted = [...eligibleRecipes].sort((a, b) => {
      const loadA = servingCounts[a.meta.recipeId] * a.meta.totalRecipeTaskMinutes;
      const loadB = servingCounts[b.meta.recipeId] * b.meta.totalRecipeTaskMinutes;
      return loadA - loadB;
    });

    let allocated = false;
    for (const r of sorted) {
      if (!wouldViolate(r)) {
        servingCounts[r.meta.recipeId]++;
        processTotalServings[r.meta.primaryProcessType] =
          (processTotalServings[r.meta.primaryProcessType] ?? 0) + 1;
        if (r.meta.primaryEquipmentType !== 'none') {
          equipmentTotalServings[r.meta.primaryEquipmentType] =
            (equipmentTotalServings[r.meta.primaryEquipmentType] ?? 0) + 1;
        }
        remaining--;
        allocated = true;
        break;
      }
    }

    if (!allocated) {
      stuckRounds++;
      if (stuckRounds >= 1) break; // all eligible recipes blocked by constraints
    }
  }

  if (remaining > 0) {
    return notRecommendedResult(
      `Could not fully allocate ${targetServingCount} servings under the given constraints; ${remaining} servings unallocated`,
    );
  }

  // Build result items
  const recommendedMixItems: MenuMixRecommendationItem[] = eligibleRecipes
    .filter((r) => servingCounts[r.meta.recipeId] > 0)
    .map((r) => {
      const count = servingCounts[r.meta.recipeId];
      return {
        recipeId: r.meta.recipeId,
        recipeNameSnapshot: r.nameSnapshot,
        suggestedServingCount: count,
        suggestedRatio: count / targetServingCount,
        primaryProcessType: r.meta.primaryProcessType,
        primaryEquipmentType: r.meta.primaryEquipmentType,
        totalRecipeTaskMinutes: r.meta.totalRecipeTaskMinutes,
        estimatedLoadContribution: count * r.meta.totalRecipeTaskMinutes,
        reasoningNotes: [],
      };
    });

  // Process load summary
  const estimatedProcessLoadSummary: Record<string, number> = {};
  for (const item of recommendedMixItems) {
    estimatedProcessLoadSummary[item.primaryProcessType] =
      (estimatedProcessLoadSummary[item.primaryProcessType] ?? 0) + item.estimatedLoadContribution;
  }

  // Equipment load ratios
  const equipmentLoadMinutes: Record<string, number> = {};
  for (const item of recommendedMixItems) {
    if (item.primaryEquipmentType !== 'none') {
      equipmentLoadMinutes[item.primaryEquipmentType] =
        (equipmentLoadMinutes[item.primaryEquipmentType] ?? 0) + item.estimatedLoadContribution;
    }
  }
  const availableEquipmentMap = new Map(availableEquipment.map((e) => [e.type as string, e.count]));
  const estimatedEquipmentLoadRatios: Record<string, number> = {};
  for (const [type, load] of Object.entries(equipmentLoadMinutes)) {
    const avail = availableEquipmentMap.get(type) ?? 0;
    estimatedEquipmentLoadRatios[type] = avail === 0 ? Infinity : load / (avail * effectiveWindowMinutes);
  }

  // Staff load ratios
  const staffLoadMinutes: Record<string, number> = {};
  for (const r of eligibleRecipes) {
    const count = servingCounts[r.meta.recipeId];
    if (count === 0) continue;
    for (const [role, mins] of Object.entries(r.meta.staffMinutesByRole)) {
      staffLoadMinutes[role] = (staffLoadMinutes[role] ?? 0) + count * mins;
    }
  }
  const availableStaffMap = new Map(availableStaff.map((s) => [s.role, s.count]));
  const estimatedStaffLoadRatios: Record<string, number> = {};
  for (const [role, load] of Object.entries(staffLoadMinutes)) {
    const avail = availableStaffMap.get(role) ?? 0;
    estimatedStaffLoadRatios[role] = avail === 0 ? Infinity : load / (avail * effectiveWindowMinutes);
  }

  // Bottleneck warnings
  const bottleneckWarnings: string[] = [];
  for (const [type, ratio] of Object.entries(estimatedEquipmentLoadRatios)) {
    if (!isFinite(ratio)) bottleneckWarnings.push(`設備 ${type} 無可用數量`);
    else if (ratio > 0.8) bottleneckWarnings.push(`設備 ${type} 負載率 ${Math.round(ratio * 100)}%`);
  }
  for (const [role, ratio] of Object.entries(estimatedStaffLoadRatios)) {
    if (!isFinite(ratio)) bottleneckWarnings.push(`人員 ${role} 無可用人數`);
    else if (ratio > 0.8) bottleneckWarnings.push(`人員 ${role} 負載率 ${Math.round(ratio * 100)}%`);
  }

  manualReviewNotes.push('本計算為啟發式估算，無法精準反映每份份量，僅供人工參考');

  // Status decision — priority: notRecommended > risky > feasible
  const anyEquipOver1 = Object.values(estimatedEquipmentLoadRatios).some((r) => r > 1.0);
  const anyStaffOver1 = Object.values(estimatedStaffLoadRatios).some((r) => r > 1.0);
  const anyOver08 =
    Object.values(estimatedEquipmentLoadRatios).some((r) => r > 0.8) ||
    Object.values(estimatedStaffLoadRatios).some((r) => r > 0.8);

  let recommendationStatus: MenuMixRecommendationStatus;
  let riskLevel: MenuMixRiskLevel;

  if (anyEquipOver1 || anyStaffOver1) {
    recommendationStatus = 'notRecommended';
    riskLevel = 'high';
  } else if (anyOver08 || manualReviewNotes.some((n) => n.includes('cannot be verified'))) {
    recommendationStatus = 'risky';
    riskLevel = 'medium';
  } else {
    recommendationStatus = 'feasible';
    riskLevel = 'low';
  }

  return {
    targetServingCount,
    targetServiceDateTime: Timestamp.fromDate(targetServiceDateTime),
    capacityWindowMinutes,
    bufferMinutes,
    candidateRecipeIds,
    constraints,
    availableStaff,
    availableEquipment,
    recommendedMixItems,
    recommendationStatus,
    riskLevel,
    estimatedProcessLoadSummary,
    estimatedEquipmentLoadRatios,
    estimatedStaffLoadRatios,
    bottleneckWarnings,
    manualReviewNotes,
  };
}

export async function createMenuMixRecommendation(
  db: Firestore,
  input: MenuMixRecommendationInput,
  plans: ProductionWorkflowPlan[],
  recipeNameSnapshots: Record<string, string>,
  uid: string,
): Promise<MenuMixRecommendation> {
  const result = calculateMenuMixRecommendation(input, plans, recipeNameSnapshots);

  const docData = {
    ...result,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };

  const ref = await addDoc(collection(db, 'menuMixRecommendations'), docData);

  return {
    id: ref.id,
    ...result,
    createdBy: uid,
  };
}

export async function listMenuMixRecommendations(db: Firestore): Promise<MenuMixRecommendation[]> {
  const q = query(collection(db, 'menuMixRecommendations'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuMixRecommendation, 'id'>) }));
}

export async function getMenuMixRecommendation(
  db: Firestore,
  id: string,
): Promise<MenuMixRecommendation> {
  const snap = await getDoc(doc(db, 'menuMixRecommendations', id));
  if (!snap.exists()) throw new Error(`menuMixRecommendation ${id} not found`);
  return { id: snap.id, ...(snap.data() as Omit<MenuMixRecommendation, 'id'>) };
}
