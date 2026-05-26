import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';

export interface SystemSettings {
  /** Gross margin below this triggers a low-margin alert (decimal, e.g. 0.2 = 20%) */
  profitMarginThreshold: number;
  /** BOM wasteFactor above this triggers an optimization suggestion (e.g. 0.3 = 30%) */
  wasteFactorWarning: number;
  tenantName: string;
  /** Default safety buffer added on top of minStockLevel (e.g. 0.1 = 10%) */
  defaultSafetyBuffer: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  profitMarginThreshold: 0.2,
  wasteFactorWarning:    0.3,
  tenantName:            '我的機構',
  defaultSafetyBuffer:   0.1,
};

export const configService = {
  async getSettings(db: Firestore, tenantId: string): Promise<SystemSettings> {
    const snap = await getDoc(doc(db, 'settings', tenantId));
    if (!snap.exists()) return { ...DEFAULT_SETTINGS };
    // Merge with defaults so new fields added in future don't break old tenants
    return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<SystemSettings>) };
  },

  async updateSettings(
    db:       Firestore,
    tenantId: string,
    settings: SystemSettings,
  ): Promise<void> {
    await setDoc(doc(db, 'settings', tenantId), settings);
  },
};
