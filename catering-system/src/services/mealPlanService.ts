import {
  collection, deleteDoc, doc, getDoc, getDocs,
  serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MealPlan, Menu } from './types';

const COL = 'mealPlans';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const mealPlanService = {
  async get(date: string): Promise<MealPlan | null> {
    const snap = await getDoc(doc(db, COL, date));
    return snap.exists() ? ({ date: snap.id, ...snap.data() } as MealPlan) : null;
  },

  async getRange(from: string, to: string): Promise<MealPlan[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs
      .map((d) => ({ date: d.id, ...d.data() } as MealPlan))
      .filter((p) => p.date >= from && p.date <= to);
  },

  async save(plan: MealPlan): Promise<void> {
    const { date, ...rest } = plan;
    await setDoc(doc(db, COL, date), {
      ...rest,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  },

  async remove(date: string): Promise<void> {
    await deleteDoc(doc(db, COL, date));
  },

  today,
};

// ─── Menu CRUD ────────────────────────────────────────────────────────────────

const MENUS = 'menus';

export const dishService = {
  async list(): Promise<Menu[]> {
    const snap = await getDocs(collection(db, MENUS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Menu));
  },

  async save(menu: Menu): Promise<string> {
    if (menu.id) {
      await setDoc(doc(db, MENUS, menu.id), {
        ...menu,
        updatedAt: serverTimestamp(),
      });
      return menu.id;
    }
    const ref = doc(collection(db, MENUS));
    await setDoc(ref, {
      ...menu,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, MENUS, id));
  },

  empty(): Omit<Menu, 'id'> {
    return {
      name:        '',
      category:    '主菜',
      servingSize: 1,
      unitPrice:   0,
      ingredients: [],
    };
  },
};
