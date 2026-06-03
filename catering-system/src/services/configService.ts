import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AIAutomationSettings {
  /** Master switch — when false, generatePurchaseSuggestion returns empty */
  purchaseSuggestionEnabled: boolean;
  /** Allow AI to create DRAFT orders automatically */
  autoDraftEnabled: boolean;
  /** Suggested qty above safetyLevel × this multiplier triggers BLOCKED */
  maxSuggestionMultiplier: number;
  /** Whether human approval is required before DRAFT → PENDING */
  requireHumanApproval: boolean;
}

export interface SystemSettings {
  /** Gross margin below this triggers a low-margin alert (decimal, e.g. 0.2 = 20%) */
  profitMarginThreshold: number;
  /** BOM wasteFactor above this triggers an optimization suggestion (e.g. 0.3 = 30%) */
  wasteFactorWarning: number;
  tenantName: string;
  /** Default safety buffer added on top of minStockLevel (e.g. 0.1 = 10%) */
  defaultSafetyBuffer: number;
  /** AI automation controls */
  aiAutomation: AIAutomationSettings;
}

const DEFAULT_AI_AUTOMATION: AIAutomationSettings = {
  purchaseSuggestionEnabled: true,
  autoDraftEnabled:          true,
  maxSuggestionMultiplier:   5,
  requireHumanApproval:      true,
};

const DEFAULT_SETTINGS: SystemSettings = {
  profitMarginThreshold: 0.2,
  wasteFactorWarning:    0.3,
  tenantName:            '我的機構',
  defaultSafetyBuffer:   0.1,
  aiAutomation:          { ...DEFAULT_AI_AUTOMATION },
};

export const configService = {
  async getSettings(tenantId: string): Promise<SystemSettings> {
    const snap = await getDoc(doc(db, 'settings', tenantId));
    if (!snap.exists()) return { ...DEFAULT_SETTINGS };
    // Merge with defaults so new fields added in future don't break old tenants
    const raw = snap.data() as Partial<SystemSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      aiAutomation: { ...DEFAULT_AI_AUTOMATION, ...raw.aiAutomation },
    };
  },

  async updateSettings(tenantId: string, settings: SystemSettings): Promise<void> {
    await setDoc(doc(db, 'settings', tenantId), settings);
  },
};
