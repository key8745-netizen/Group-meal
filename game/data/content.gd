## content.gd — Static game content (Phase 4 Gemini content layer)
## class_name makes all consts globally accessible without autoloading.
class_name GameContent

# ── 晨間守衛 NPC — Morning Guardian NPCs ──────────────────────────
# 7 guardians, each with pixel art description, role, and greeting.

const MORNING_GUARDIANS: Array[Dictionary] = [
	{
		"id": "owl_guardian",
		"name": "貓頭鷹守衛 霍米爾",
		"role": "知識之門守衛",
		"domain": "school",
		"pixel_desc": (
			"尺寸 18×24 px。主色：深棕(#4A3728) + 金黃(#D4A017)。"
			+ "圓形大眼各佔 5×5 px，金色(#FFD700)，位於臉部上 1/3。"
			+ "胸前 V 形白紋(#F5F5F0，7 px 寬)。翅膀折疊呈梯形；"
			+ "展翅時左右各延伸 8 px。頭頂三根羽毛(#D4A017)呈王冠狀，"
			+ "各高 4 px。嘴喙橙黃(#E8A020，2×2 px)。"
			+ "閒置動畫：眨眼(每 3 s)、頭部微轉(左右各 1 px)。"
		),
		"greeting": "知識之人，你來了。今日的功課，我已為你記錄在案。",
	},
	{
		"id": "fox_guardian",
		"name": "狐狸守衛 花緋",
		"role": "創意工坊守衛",
		"domain": "home",
		"pixel_desc": (
			"尺寸 16×22 px。主色：橙紅(#E05020) + 白(#FFFAF0)。"
			+ "耳尖黑(#2A2A2A，各 1×3 px)；耳內橙紅。"
			+ "九條尾巴各 4 px 寬，扇形排列於身後，漸層橙→黃(#FFD700)，"
			+ "每條末端白色 2 px。左眼戴單片鏡片(金色方框，5×5 px)。"
			+ "右眼半閉，顯示幽默感。閒置動畫：尾巴輪流微擺(上下 1 px)。"
		),
		"greeting": "創意的孩子！讓你的想像力在這裡燃燒吧！",
	},
	{
		"id": "bear_guardian",
		"name": "熊守衛 力大",
		"role": "體力訓練場守衛",
		"domain": "home",
		"pixel_desc": (
			"尺寸 20×26 px（體型最寬，18 px）。主色：灰棕(#7A6555) + 米白(#F0E8D8)。"
			+ "耳朵半圓各 6×4 px，內耳粉(#FFB6C1，4×2 px)。"
			+ "腹部橢圓米白區 10×14 px。"
			+ "右手持哨子(黃色#FFD700，2×4 px，繩子 3 px)。"
			+ "眉毛粗黑(各 4 px)，表情嚴肅但友善。"
			+ "閒置動畫：吹哨(嘴部色塊每 4 s 變化 1 幀)。"
		),
		"greeting": "精神！今天要動起來了嗎？身體是冒險的根基！",
	},
	{
		"id": "cat_guardian",
		"name": "貓守衛 安靜",
		"role": "閱讀角守衛",
		"domain": "school",
		"pixel_desc": (
			"尺寸 14×20 px。主色：淡灰(#C8C8C8) + 深藍(#1A2A4A)。"
			+ "三根細長鬍鬚左右各三(每根 8 px，中灰#AAAAAA)。"
			+ "穿深藍小外套佔身高下 2/3，金色鈕扣三顆(各 1×1 px)。"
			+ "尾巴 20 px 長，末端白色 4 px，呈 S 形彎曲。"
			+ "耳朵三角各 3×4 px，內耳淡粉(#FFCCDD，2×2 px)。"
			+ "閒置動畫：尾巴緩慢左右擺動(每 2 s 一個週期)。"
		),
		"greeting": "噓……這裡的書在等你。安靜地閱讀，智慧就會流入你心中。",
	},
	{
		"id": "rabbit_guardian",
		"name": "兔守衛 早早",
		"role": "晨間打卡守衛",
		"domain": "school",
		"pixel_desc": (
			"尺寸 16×22 px。主色：白(#FFFFFF) + 粉(#FFB6C1)。"
			+ "耳朵各 3×12 px，內耳粉(#FF8FAB，2×8 px)。"
			+ "腹部心形紋路 5×4 px(粉紅#FF69B4)。"
			+ "右手持大型時鐘(8×8 px，黃色圓框#FFD700)，"
			+ "指針指向 07:00(短針向上，長針向左)。"
			+ "眼睛閃亮(白色高光 1 px)。"
			+ "閒置動畫：時鐘分針每秒跳動 1 格。"
		),
		"greeting": "早安！你準時到了！今天可以加 10 分！加油！",
	},
	{
		"id": "turtle_guardian",
		"name": "龜守衛 穩穩",
		"role": "任務追蹤守衛",
		"domain": "school",
		"pixel_desc": (
			"尺寸 18×16 px（矮胖型）。主色：草綠(#4A7A2A) + 黃綠(#8DB560)。"
			+ "龜殼六角蜂巢紋：每格 4×4 px，邊線深綠(#2A4A1A，1 px)。"
			+ "頭部伸出殼外 4 px，表情嚴肅，單眉右側微皺。"
			+ "左手持竹筒捲軸(米白#F5E8C0，6×10 px)，上有黑色橫線三條(待辦清單)。"
			+ "四肢短圓，各 3×3 px。"
			+ "閒置動畫：捲軸緩緩展開再收起(每 5 s)。"
		),
		"greeting": "你的任務清單已更新。一件一件完成，不急——穩穩來。",
	},
	{
		"id": "firefly_guardian",
		"name": "螢火蟲守衛 光光",
		"role": "暮色過渡守衛",
		"domain": "home",
		"pixel_desc": (
			"尺寸 12×16 px（最小）。主色：黃綠(#A0FF60，發光) + 深藍(#0A1A3A)。"
			+ "翅膀透明(邊線#80FF40，2 px)，展開 12×8 px，半透明疊加。"
			+ "腹部燈籠 4×6 px，在深色背景下使用 Color Modulate 模擬發光暈。"
			+ "身體懸浮於地面上 2 px。"
			+ "眼睛各 2×2 px，亮黃(#FFFF80)。"
			+ "閒置動畫：上下浮動(±3 px，2 s 週期)；燈籠閃爍(明暗交替，1.5 s)。"
		),
		"greeting": "白天快要結束了……你今天的努力，我都看見了。好好休息吧。",
	},
]

# ── 戰鬥語錄 — Battle Quotes ──────────────────────────────────────
# 強調「怪獸只是阻力，孩子可以戰勝它們」

const BATTLE_QUOTES: Dictionary = {
	"拖延史萊姆": [
		"呵呵……再等一下下……就一下下嘛……你也覺得沙發很舒服對吧？",
		"等一下！等我先玩五分鐘……不對，再十分鐘……再一點點就好……",
		"來加入我！躺著多舒服，什麼都不用做……嘿嘿嘿……",
	],
	"亂亂哥布林": [
		"東西亂放才有創意！整齊的房間是無聊的房間！你懂嗎！",
		"哈哈！你找不到你的鉛筆盒！哈哈哈！我把它藏起來了！",
		"混亂是我的力量！越亂越強！你的整理根本傷不了我！",
	],
	"系統": {
		"player_win": (
			"你戰勝了阻力！\n"
			+ "這些怪物只是習慣的影子——\n"
			+ "你比它們強大，因為你選擇了行動！"
		),
		"player_skill": "特技發動！孩子的決心，任何阻力都無法阻擋！",
		"enemy_attack": "怪物試圖讓你分心……但你的意志是最堅固的盾牌！",
		"player_lose": "這次沒有成功……但每一次嘗試都讓你更強大！再試一次！",
	},
}

# ── 週末島嶼：雜物巨獸 — Weekend Boss: Clutter Beast ─────────────

const WEEKEND_BOSS: Dictionary = {
	"name": "雜物巨獸",
	"subtitle": "混沌之源，由積累而生",
	"max_hp": 100,
	"pixel_desc": (
		"尺寸 40×60 px（龐大型）。由各種雜物構成：\n"
		+ "舊書(#8B6914)作骨架，玩具碎片(多色混雜)作皮膚紋路。\n"
		+ "主色暗灰(#3A3A3A)，縫隙間透出垃圾黃(#B8A020)。\n"
		+ "兩眼由舊電池構成(各 6×8 px)，發綠光(#40FF80)。\n"
		+ "弱點標記：胸前發光心形整理圖示(白色#FFFFFF，12×12 px)；\n"
		+ "被攻擊時閃爍紅色(#FF4444)，持續 0.5 s。\n"
		+ "攻擊動畫：揮舞雜物臂(左右各擺 6 px)。"
	),
	"weaknesses": [
		{
			"action": "整理書桌",
			"base_damage": 25,
			"is_crit": true,
			"crit_multiplier": 2.0,
			"crit_message": "📚 書桌整理完成！暴擊！雜物巨獸的核心弱點被擊中！傷害 ×2！",
			"desc": "將書桌上所有物品歸位，觸發巨獸核心弱點暴擊",
		},
		{
			"action": "整理衣物",
			"base_damage": 20,
			"is_crit": true,
			"crit_multiplier": 1.8,
			"crit_message": "👕 衣物折好收納！雜物巨獸的力量大幅減弱！",
			"desc": "折疊並收納散落衣物",
		},
		{
			"action": "整理玩具",
			"base_damage": 15,
			"is_crit": true,
			"crit_multiplier": 1.5,
			"crit_message": "🧸 玩具入箱！雜物巨獸痛苦嚎叫！",
			"desc": "將散落玩具收納至指定位置",
		},
		{
			"action": "清理垃圾",
			"base_damage": 10,
			"is_crit": false,
			"crit_multiplier": 1.2,
			"crit_message": "🗑️ 環境清潔！雜物巨獸的毒素被清除！",
			"desc": "將垃圾投入垃圾桶，回收物分類",
		},
	],
	"attack_lines": [
		"巨獸揮出凌亂的巨臂！碎紙片四飛！",
		"巨獸釋放混沌之氣！你感到有點懶……",
		"巨獸從廢物堆召喚小雜物助陣！",
	],
	"defeat_message": (
		"💥 雜物巨獸轟然倒下！\n"
		+ "房間恢復了光明與秩序！\n"
		+ "你們是最棒的清潔勇士！"
	),
}

# ── 學校大陸 XP 費率參考 — School XP Rate Reference ──────────────

const SCHOOL_XP_RATES: Dictionary = {
	"offline_per_300s": 1,    # 每 5 分鐘早晨模式得 1 XP
	"offline_max": 60,         # 每次切換最多 60 XP
	"homework_done": 30,       # 完成一份作業
	"reading_10min": 10,       # 閱讀 10 分鐘
	"test_pass": 50,           # 考試通過
	"on_time_arrival": 15,     # 準時打卡
}
