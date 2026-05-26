import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDIz0TFNU0EFC2E9b2XWVkexoSCYAm3DrA',
  authDomain: 'umas-booking-manager.firebaseapp.com',
  projectId: 'umas-booking-manager',
  storageBucket: 'umas-booking-manager.firebasestorage.app',
  messagingSenderId: '7381346891',
  appId: '1:7381346891:web:21d171a648e7c2c86b7bce',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  // ── Ingredients ───────────────────────────────────────────────────────────
  const ingredients = [
    { id: 'ing-chicken',  name: '雞腿肉',   unit: 'kg',  unitCost: 180, category: '肉類', minStockLevel: 5,  supplierIds: ['sup-fresh'] },
    { id: 'ing-onion',    name: '洋蔥',     unit: 'kg',  unitCost: 30,  category: '蔬菜', minStockLevel: 3,  supplierIds: ['sup-veg']   },
    { id: 'ing-garlic',   name: '大蒜',     unit: 'kg',  unitCost: 60,  category: '蔬菜', minStockLevel: 1,  supplierIds: ['sup-veg']   },
    { id: 'ing-rice',     name: '白米',     unit: 'kg',  unitCost: 45,  category: '主食', minStockLevel: 20, supplierIds: ['sup-grain'] },
    { id: 'ing-soy',      name: '醬油',     unit: 'L',   unitCost: 50,  category: '調味', minStockLevel: 2,  supplierIds: ['sup-sauce'] },
    { id: 'ing-egg',      name: '雞蛋',     unit: 'piece', unitCost: 5, category: '蛋類', minStockLevel: 30, supplierIds: ['sup-fresh'] },
  ];

  for (const ing of ingredients) {
    await setDoc(doc(db, 'ingredients', ing.id), ing);
    console.log(`✓ ingredient: ${ing.name}`);
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  const inventory = [
    { id: 'ing-chicken', currentStock: 3,  unit: 'kg' },
    { id: 'ing-onion',   currentStock: 8,  unit: 'kg' },
    { id: 'ing-garlic',  currentStock: 0.5, unit: 'kg' },
    { id: 'ing-rice',    currentStock: 15, unit: 'kg' },
    { id: 'ing-soy',     currentStock: 1,  unit: 'L'  },
    { id: 'ing-egg',     currentStock: 12, unit: 'piece' },
  ];

  for (const inv of inventory) {
    await setDoc(doc(db, 'inventory', inv.id), {
      ingredientId: inv.id,
      ingredientName: ingredients.find(i => i.id === inv.id)?.name ?? '',
      currentStock: inv.currentStock,
      unit: inv.unit,
      lastUpdated: Timestamp.now(),
    });
    console.log(`✓ inventory: ${inv.id} = ${inv.currentStock}`);
  }

  // ── Menus ─────────────────────────────────────────────────────────────────
  const menus = [
    {
      id: 'menu-chicken-rice',
      name: '雞腿飯',
      category: '主餐',
      servingSize: 1,
      unitPrice: 120,
      ingredients: [
        { ingredientId: 'ing-chicken', ingredientName: '雞腿肉', quantity: 0.25, unit: 'kg',    wasteFactor: 0.1 },
        { ingredientId: 'ing-rice',    ingredientName: '白米',   quantity: 0.15, unit: 'kg',    wasteFactor: 0   },
        { ingredientId: 'ing-soy',     ingredientName: '醬油',   quantity: 0.03, unit: 'L',     wasteFactor: 0   },
        { ingredientId: 'ing-garlic',  ingredientName: '大蒜',   quantity: 0.01, unit: 'kg',    wasteFactor: 0.2 },
      ],
    },
    {
      id: 'menu-egg-fried-rice',
      name: '蛋炒飯',
      category: '主餐',
      servingSize: 1,
      unitPrice: 80,
      ingredients: [
        { ingredientId: 'ing-rice',   ingredientName: '白米',   quantity: 0.2,  unit: 'kg',    wasteFactor: 0   },
        { ingredientId: 'ing-egg',    ingredientName: '雞蛋',   quantity: 2,    unit: 'piece', wasteFactor: 0   },
        { ingredientId: 'ing-onion',  ingredientName: '洋蔥',   quantity: 0.05, unit: 'kg',    wasteFactor: 0.1 },
        { ingredientId: 'ing-soy',    ingredientName: '醬油',   quantity: 0.02, unit: 'L',     wasteFactor: 0   },
      ],
    },
  ];

  for (const menu of menus) {
    await setDoc(doc(db, 'menus', menu.id), { ...menu, createdAt: Timestamp.now() });
    console.log(`✓ menu: ${menu.name}`);
  }

  console.log('\n🎉 Seed 完成！');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
