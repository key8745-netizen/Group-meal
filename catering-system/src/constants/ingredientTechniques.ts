/**
 * ingredientTechniques — Feature 073: 料理技法規則庫（Salt Fat Acid Heat）。
 *
 * 把《鹽脂酸熱》的處理原則萃取成「可執行規則」（撒鹽時機、蛋白類型、火候關鍵、
 * 解膩/油脂提示），供未來菜單設計/配方編輯時，依食材給出技法提醒。
 * 僅保留系統能用的結構化欄位；完整敘述性心法屬參考文件，不入此檔。
 *
 * id 儘量對應 flavorPairings；台式專有品項（豬五花、油蔥酥、乾香菇…）自成 id。
 */

/** 撒鹽時機——SFAH 最核心的一條。 */
export type SaltTiming = '提早' | '最後' | '鹽水' | '不適用';

/** 蛋白類型決定火候策略。 */
export type ProteinType = '軟嫩快煮' | '強韌慢燉' | '脆弱海鮮';

export interface IngredientTechnique {
  id: string;
  name: string;
  /** 何時撒鹽（肉提早、海鮮最後、大塊可鹽水）。 */
  saltTiming?: SaltTiming;
  proteinType?: ProteinType;
  /** 火候/質地關鍵一句。 */
  cookKey?: string;
  /** 酸如何用來解膩/平衡。 */
  acidTip?: string;
  /** 油脂如何運用。 */
  fatTip?: string;
}

/** 四大元素速記（供 UI 參考顯示，非逐食材）。 */
export const SFAH_PRINCIPLES = {
  salt: '鹽是放大鏡，靠「時間」入味不是靠量；肉提早、海鮮最後；燙菜/煮麵水要像海水一樣鹹。',
  fat: '脂肪承載風味、帶來高溫褐變；判斷它是主體/介質/調味。烘焙堅果油(芝麻油)只當最後調味。',
  acid: '酸不是酸溜溜，是平衡與對比，用來切斷油膩與澱粉的沉重；烏醋/米酒是台式秘密武器。',
  heat: '水蒸氣是梅納反應剋星——表面擦乾、鍋要夠熱；軟嫩肉快煮即起、強韌肉慢燉；留意餘溫與休息。',
} as const;

export const INGREDIENT_TECHNIQUES: IngredientTechnique[] = [
  // ── 蛋白質：肉／家禽 ──────────────────────────────────────────────────────
  { id: 'beef', name: '牛肉／牛排', saltTiming: '提早', proteinType: '軟嫩快煮',
    cookKey: '回溫至室溫、表面擦乾高溫煎、三~五分熟為限，起鍋休息 5–10 分再切。',
    acidTip: '紅酒醬的酸＋焦糖化紅蔥頭切斷油脂、提肉香。' },
  { id: 'pork-belly', name: '豬五花／帶骨豬', saltTiming: '提早', proteinType: '強韌慢燉',
    cookKey: '滷肉屬強韌肉，看時間不看溫度、低溫慢燉到膠原分解；煎則中小火逼油得脆皮。',
    acidTip: '滷肉飯/控肉配醃蘿蔔、酸菜，用酸切斷肥膩。' },
  { id: 'ground-pork', name: '豬絞肉', saltTiming: '提早',
    cookKey: '提早拌鹽/醬油使蛋白凝膠化，肉丸/水餃餡加熱時鎖汁不乾柴。',
    fatTip: '絞肉的脂肪即主體，提供多汁口感。' },
  { id: 'chicken', name: '雞肉／雞胸', saltTiming: '鹽水', proteinType: '軟嫩快煮',
    cookKey: '鹽水/提早撒鹽改變蛋白結構→不易柴；回溫再煮、剛熟立刻起鍋、休息 5–10 分。' },
  { id: 'chicken-wings', name: '雞翅', saltTiming: '提早', proteinType: '軟嫩快煮',
    cookKey: '提早抹鹽、不加蓋冰箱風乾過夜→雞皮乾燥，隔天煎烤如玻璃般酥脆。' },
  { id: 'lamb', name: '羊肉', saltTiming: '提早', proteinType: '強韌慢燉',
    cookKey: '大蒜＋夏香薄荷醃、慢烤到肉質放鬆。' },
  { id: 'foie-gras', name: '肥肝', proteinType: '軟嫩快煮',
    cookKey: '高溫快煎表面上色即起。', acidTip: '配櫻桃/巴薩米克醋切斷肥膩。' },

  // ── 蛋白質：海鮮（共同鐵則：最後撒鹽、脆弱） ─────────────────────────────
  { id: 'shrimp', name: '蝦仁', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '高溫快炒，變紅捲曲立刻離火（防餘溫過熟變橡皮）。' },
  { id: 'squid', name: '透抽／花枝', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '兩極化：極高溫 1 分內起鍋，或慢燉 45 分＋；中間時間必變橡皮筋。' },
  { id: 'clams', name: '蛤蜊', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '本身即鮮味來源，開殼釋出天然鹽分後再試味調味（別先下鹽）。',
    fatTip: '白酒蛤蜊麵靠搖鍋讓蛤蜊汁與油乳化成醬。' },
  { id: 'fish-white', name: '虱目魚／吳郭魚／鯛魚', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '魚皮徹底擦乾、油鍋夠熱才煎得脆（水是梅納剋星）。',
    acidTip: '起鍋擠檸檬提亮、平衡。' },
  { id: 'mackerel', name: '鯖魚', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '油脂豐厚亮皮魚。', acidTip: '起鍋檸檬/醋切斷魚油肥膩。' },
  { id: 'salmon', name: '鮭魚', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '表面擦乾高溫煎皮；風味濃郁足以抗衡橄欖。' },
  { id: 'cod', name: '鱈魚', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '細緻呈片狀，鹽盤上烤十分鐘；與蛤蜊絕配。' },
  { id: 'scallops', name: '干貝', saltTiming: '最後', proteinType: '脆弱海鮮',
    cookKey: '表面擦乾、高溫煎上色即起。' },

  // ── 蛋 ────────────────────────────────────────────────────────────────────
  { id: 'eggs', name: '雞蛋', proteinType: '軟嫩快煮',
    cookKey: '滑順炒蛋靠極低溫慢炒，剛熟前 30 秒關火用餘溫收尾（防擰毛巾出水）。' },

  // ── 蔬菜：需破解水分/吸油/苦味 ───────────────────────────────────────────
  { id: 'eggplant', name: '茄子', saltTiming: '提早',
    cookKey: '提早 15 分撒鹽逼水（破果膠）、擦乾再炒/炸→不吸油、質地緊實。' },
  { id: 'cabbage', name: '高麗菜',
    cookKey: '徹底瀝乾、鍋要極熱，炒到邊緣微焦（梅納）才有鑊氣甜香；帶水下鍋只會變水煮。' },
  { id: 'napa-cabbage', name: '大白菜',
    cookKey: '白菜滷：先爆香扁魚/蝦米/香菇再慢燉，白菜吸鮮；或鹽抓後做酸脆涼拌。' },
  { id: 'leafy-greens', name: '空心菜／地瓜葉／小白菜', saltTiming: '鹽水',
    cookKey: '燙菜水像海水鹹（防礦物質/甜味流失、保翠綠）；高溫快炒別悶出水。',
    acidTip: '起鍋滴檸檬/烏醋切苦味、提亮。' },
  { id: 'spinach', name: '菠菜', saltTiming: '鹽水',
    cookKey: '極易煮過頭變黃，剛熟前一分鐘離火用餘溫收尾。', acidTip: '幾滴檸檬/醋切苦味。' },
  { id: 'mustard-greens', name: '芥菜（刈菜）',
    cookKey: '苦味粗纖維：先像海水鹹的水汆燙去苦、再用大量脂肪（豬油/培根）長時間燉軟。' },
  { id: 'lettuce', name: '萵苣／生菜', saltTiming: '最後',
    cookKey: '沙拉絕不早撒鹽（滲透壓抽乾細胞變軟爛），上桌前一秒才拌油醋與鹽。' },
  { id: 'bitter-melon', name: '苦瓜',
    cookKey: '撒鹽抓醃逼苦水、洗淨；鹽比糖更能掩苦，配鹹蛋/豆豉堆疊鹽分轉回甘。' },
  { id: 'loofah', name: '絲瓜',
    cookKey: '蓋蓋利用自身水分＋蛤蜊/蝦米悶煮，成鮮甜濃湯。' },
  { id: 'celery', name: '芹菜',
    cookKey: '清湯用低溫出水(不變色)；肉醬用中高溫褐變疊甜味。與黑松露同季絕配。' },
  { id: 'chives', name: '韭菜',
    cookKey: '芳香脂溶，靠脂肪（蛋油/豬油）爆香包覆。', fatTip: '韭菜炒蛋/豬絞肉水餃最發揮。' },
  { id: 'yellow-chives', name: '韭黃',
    cookKey: '細胞極脆、含水高：幾秒即軟，完全出水前立刻關火用餘溫收尾。' },
  { id: 'bean-sprouts', name: '豆芽（綠豆/黃豆芽）',
    cookKey: '幾乎全是水：鍋要極高溫快炒鎖水保脆，火不夠只會蒸出豆腥。' },

  // ── 根莖／澱粉：靠時間從內部調味、搶糖分 ─────────────────────────────────
  { id: 'daikon', name: '白蘿蔔', saltTiming: '提早',
    cookKey: '含水高、無味：燉煮過程就要讓湯底夠鹹，靠擴散慢慢吸入鮮甜（別起鍋才加鹽）。' },
  { id: 'winter-melon', name: '冬瓜', saltTiming: '提早',
    cookKey: '完美鮮味海綿：泡蛤蜊/蝦米/排骨鮮味高湯慢燉，起鍋滴香油包覆。' },
  { id: 'burdock', name: '牛蒡',
    cookKey: '切開泡醋水防氧化；高溫炒出梅納焦糖香。', acidTip: '起鍋米醋/味醂平衡木質土味。' },
  { id: 'yam', name: '山藥',
    cookKey: '不喜黏液就切塊裹油極高溫乾煸/油炸，改變表面質地變酥脆。' },
  { id: 'okra', name: '秋葵',
    cookKey: '高溫裹粉油炸或快速乾煸，改變黏液質地變酥脆。' },
  { id: 'lotus-root', name: '蓮藕', saltTiming: '提早',
    cookKey: '富澱粉、厚實：水滾就加鹽，靠擴散慢慢滲入內部。' },
  { id: 'water-chestnut', name: '荸薺',
    cookKey: '耐熱清脆，混入軟嫩肉丸（獅子頭/肉羹）製造質地對比。' },
  { id: 'bamboo-shoot', name: '竹筍／玉米／茭白筍／菱角',
    cookKey: '採後糖分快速轉澱粉：買回盡快帶殼水煮止損；水加鹽軟化果膠、保鮮甜。' },
  { id: 'potatoes', name: '馬鈴薯', saltTiming: '鹽水',
    cookKey: '澱粉難入味：水煮階段水就要像海水鹹，事後表面撒鹽也救不回內部平淡。' },
  { id: 'pumpkin', name: '南瓜',
    cookKey: '高溫烤觸發焦糖化。', acidTip: '義式糖醋(agrodolce)加點醋平衡厚重甜味。' },

  // ── 菇蕈 ──────────────────────────────────────────────────────────────────
  { id: 'mushrooms', name: '蕈菇（香菇/杏鮑菇/洋菇/草菇）',
    cookKey: '含水高：鍋極熱、剛下鍋別翻動，逼水褐變才出堅果大地香；下鍋前才洗免吸水。',
    fatTip: '萬用調味＝奶油/油煎後最後加大蒜巴西里碎＋鹽。' },
  { id: 'wood-ear', name: '濕木耳',
    cookKey: '風味安靜但爽脆，用來在軟嫩肉/燉菜中製造質地對比。' },

  // ── 蔥蒜辛香與油脂/調味 ──────────────────────────────────────────────────
  { id: 'garlic', name: '大蒜',
    cookKey: '冷/溫油下鍋爆香萃取脂溶香氣；含糖高，火太大易燒焦變苦。' },
  { id: 'ginger', name: '生薑',
    cookKey: '「喚醒」風味，平衡海鮮腥與肥肉；配柑橘/熱帶水果絕配。' },
  { id: 'scallion', name: '青蔥',
    cookKey: '蔥白脂溶香→溫油爆香；蔥綠易揮發→起鍋前才撒，提供清脆對比。' },
  { id: 'shallots-fried', name: '紅蔥頭／油蔥酥',
    cookKey: '中低溫炸脫水至「淺金黃」就撈起，餘溫會續深；全熟才撈冷卻必焦苦。' },
  { id: 'basil', name: '九層塔／羅勒',
    cookKey: '起鍋前最後一秒才加，用餘溫拌入釋放精油；過熱變黑發苦。',
    fatTip: '三杯的黑麻油包覆延長香氣停留。' },
  { id: 'cilantro', name: '香菜／芫荽',
    cookKey: '生用不煮、最後加；為油膩澱粉小吃提供類似「酸」的清新對比。' },
  { id: 'lemongrass', name: '香茅',
    cookKey: '粗纖維：先拍碎搗裂，用椰奶/高湯慢燉萃取精油。', acidTip: '檸檬般香氣切斷椰奶濃膩。' },

  // ── 乾貨／發酵／油醋（鮮味、堆疊鹽分、解膩） ─────────────────────────────
  { id: 'dried-shiitake', name: '乾香菇／蝦米',
    cookKey: '泡軟後別直接水煮——先熱油煸香萃取脂溶香氣，濃郁十倍；泡發水留用當鮮味高湯。' },
  { id: 'dried-radish', name: '菜脯（蘿蔔乾）',
    cookKey: '先熱油煸香再入蛋；菜脯蛋靠中低溫、餘溫收尾得外酥內嫩。' },
  { id: 'pickled-greens', name: '酸菜／榨菜／雪里紅／泡菜',
    acidTip: '發酵酸＋鮮味切斷肥膩（刈包配酸菜、榨菜配肉絲）。',
    cookKey: '本身已鹹→先洗/稀釋、用糖或脂肪平衡強烈酸鹹（堆疊鹽分陷阱）。' },
  { id: 'tofu', name: '豆腐／豆乾／豆皮／素雞', saltTiming: '提早',
    cookKey: '含水高：壓乾擦乾才煎得脆；內部無味→紅燒/滷需慢滾讓鹽擴散入味。' },
  { id: 'soy-sauce', name: '醬油',
    cookKey: '發酵鮮味＋鹹味來源；已用醬油醃/調味就別再盲目加鹽（堆疊鹽分）。' },
  { id: 'black-vinegar', name: '烏醋',
    acidTip: '羹湯/滷肉飯/炒麵起鍋淋一點，切斷勾芡澱粉與油脂的沉重、瞬間明亮。',
    cookKey: '香氣易揮發→關火前才淋；燉酸辣湯則早加讓熱馴服尖銳酸味。' },
  { id: 'rice-wine', name: '台灣米酒',
    cookKey: '熗鍋(deglaze)溶出鍋底焦香精華、同時去腥。', acidTip: '在麻油雞/三杯提供層次與解膩。' },
  { id: 'sesame-oil', name: '芝麻香油／黑麻油',
    fatTip: '發煙點極低：只當「最後調味」滴入，切勿高溫熱炒（會苦、生致癌物）。' },
  { id: 'olive-oil', name: '橄欖油',
    fatTip: '炒菜用一般款；生菜/完成醬汁/最後提味才用頂級初榨。' },
  { id: 'salt', name: '鹽', saltTiming: '提早',
    cookKey: '靠時間入味非數量；用醬油/蝦米/破布子堆疊鹹與鮮；燙菜/煮麵水要像海水。' },
];

/** 依 id 快速查詢。 */
export const INGREDIENT_TECHNIQUE_BY_ID = new Map(INGREDIENT_TECHNIQUES.map((t) => [t.id, t]));
