extends Control
## Battle.gd — 戰鬥場景
## Phase 4 實作：
##   1. yohani 專屬特技「星光連擊」→ 藍色粒子特效
##   2. sani 專屬特技「粉紅颶風」→ 粉色粒子特效
##   3. 敵人戰鬥語錄（拖延史萊姆 / 亂亂哥布林）

signal battle_ended(player_won: bool)

# ── Node refs ──────────────────────────────────────────────────────
@onready var enemy_name_lbl:   Label        = $EnemyArea/EnemyNameLabel
@onready var enemy_hp_bar:     ProgressBar  = $EnemyArea/EnemyHPBar
@onready var enemy_dialog_lbl: Label        = $EnemyArea/EnemyDialogLabel
@onready var enemy_avatar_lbl: Label        = $EnemyArea/EnemyAvatarLabel

@onready var yohani_hp_bar:     ProgressBar = $PlayerArea/YohaniPanel/YohaniHPBar
@onready var yohani_attack_btn: Button      = $PlayerArea/YohaniPanel/AttackButton
@onready var yohani_special_btn: Button     = $PlayerArea/YohaniPanel/YohaniSpecialButton
@onready var yohani_charges_lbl: Label      = $PlayerArea/YohaniPanel/ChargesLabel

@onready var sani_hp_bar:     ProgressBar   = $PlayerArea/SaniPanel/SaniHPBar
@onready var sani_attack_btn: Button        = $PlayerArea/SaniPanel/AttackButton
@onready var sani_special_btn: Button       = $PlayerArea/SaniPanel/SaniSpecialButton
@onready var sani_charges_lbl: Label        = $PlayerArea/SaniPanel/ChargesLabel

@onready var battle_log:     RichTextLabel  = $BattleLog
@onready var yohani_particles: GPUParticles2D = $YohaniParticles
@onready var sani_particles:   GPUParticles2D = $SaniParticles
@onready var return_btn: Button              = $ReturnButton

# ── Enemy Data ─────────────────────────────────────────────────────

const ENEMY_DATA: Dictionary = {
	"拖延史萊姆": {
		"max_hp": 60,
		"avatar": "🟢\n拖延史萊姆",
		"color": Color(0.3, 0.8, 0.3),
	},
	"亂亂哥布林": {
		"max_hp": 80,
		"avatar": "🟤\n亂亂哥布林",
		"color": Color(0.8, 0.5, 0.2),
	},
}

const BASE_ATK    := 10
const YOHANI_SPL  := 25   # 星光連擊傷害
const SANI_SPL    := 22   # 粉紅颶風傷害
const ENEMY_ATK   := 8

# ── Battle State ───────────────────────────────────────────────────

var _enemy_name:    String = "拖延史萊姆"
var _enemy_hp:      int    = 60
var _enemy_max_hp:  int    = 60
var _player_hp:     Dictionary = {"yohani": 50, "sani": 50}
var _player_max_hp: Dictionary = {"yohani": 50, "sani": 50}
var _is_player_turn: bool  = true
var _battle_over:   bool   = false

# ── Lifecycle ──────────────────────────────────────────────────────

func _ready() -> void:
	_setup_particles()
	_connect_buttons()
	start_battle("拖延史萊姆")

func _connect_buttons() -> void:
	yohani_attack_btn.pressed.connect(_on_yohani_attack)
	yohani_special_btn.pressed.connect(_on_yohani_special)
	sani_attack_btn.pressed.connect(_on_sani_attack)
	sani_special_btn.pressed.connect(_on_sani_special)
	return_btn.pressed.connect(_on_return)

# ── Particle Setup ─────────────────────────────────────────────────

func _setup_particles() -> void:
	_configure_particle(yohani_particles, Color(0.2, 0.5, 1.0))  # 藍色 — yohani
	_configure_particle(sani_particles,   Color(1.0, 0.5, 0.7))  # 粉色 — sani

func _configure_particle(p: GPUParticles2D, color: Color) -> void:
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape          = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius  = 20.0
	mat.direction               = Vector3(0.0, -1.0, 0.0)
	mat.spread                  = 70.0
	mat.initial_velocity_min    = 80.0
	mat.initial_velocity_max    = 160.0
	mat.gravity                 = Vector3(0.0, 200.0, 0.0)
	mat.color                   = color

	p.process_material = mat
	p.amount           = 48
	p.lifetime         = 1.5
	p.one_shot         = true
	p.emitting         = false

# ── Public API ─────────────────────────────────────────────────────

func start_battle(enemy_key: String) -> void:
	_battle_over     = false
	_enemy_name      = enemy_key
	var ed: Dictionary = ENEMY_DATA.get(enemy_key, ENEMY_DATA["拖延史萊姆"])
	_enemy_max_hp    = ed.max_hp
	_enemy_hp        = _enemy_max_hp

	enemy_name_lbl.text   = enemy_key
	enemy_avatar_lbl.text = ed.avatar
	_player_hp            = {"yohani": 50, "sani": 50}

	_update_enemy_bar()
	_update_player_bars()
	_refresh_charges()
	_set_buttons_active(true)

	battle_log.clear()
	_log("[b]⚔️ 戰鬥開始！[/b]  對手：%s" % enemy_key)
	_show_enemy_quote()
	return_btn.hide()

# ── Attack Actions ─────────────────────────────────────────────────

func _on_yohani_attack() -> void:
	if not _can_act():
		return
	_log("yohani 普通攻擊！造成 %d 傷害" % BASE_ATK)
	_hit_enemy(BASE_ATK)
	if not _battle_over:
		_run_enemy_turn()

func _on_sani_attack() -> void:
	if not _can_act():
		return
	_log("sani 普通攻擊！造成 %d 傷害" % BASE_ATK)
	_hit_enemy(BASE_ATK)
	if not _battle_over:
		_run_enemy_turn()

# ── Special Skills ─────────────────────────────────────────────────

func _on_yohani_special() -> void:
	if not _can_act():
		return
	if not SaveManager.use_special_charge("yohani"):
		_log("[color=gray]yohani 的特技次數用盡！[/color]")
		return

	_log("[color=#4488FF][b]★ 星光連擊！造成 %d 傷害！[/b][/color]" % YOHANI_SPL)
	_log("[color=#88AAFF][i]%s[/i][/color]" % GameContent.BATTLE_QUOTES["系統"]["player_skill"])

	# 藍色粒子爆發
	yohani_particles.restart()
	yohani_particles.emitting = true

	_refresh_charges()
	_hit_enemy(YOHANI_SPL)
	if not _battle_over:
		_run_enemy_turn()

func _on_sani_special() -> void:
	if not _can_act():
		return
	if not SaveManager.use_special_charge("sani"):
		_log("[color=gray]sani 的特技次數用盡！[/color]")
		return

	_log("[color=#FF88BB][b]♡ 粉紅颶風！造成 %d 傷害！[/b][/color]" % SANI_SPL)
	_log("[color=#FFAAD0][i]%s[/i][/color]" % GameContent.BATTLE_QUOTES["系統"]["player_skill"])

	# 粉色粒子爆發
	sani_particles.restart()
	sani_particles.emitting = true

	_refresh_charges()
	_hit_enemy(SANI_SPL)
	if not _battle_over:
		_run_enemy_turn()

# ── Enemy Turn ─────────────────────────────────────────────────────

func _run_enemy_turn() -> void:
	_is_player_turn = false
	_set_buttons_active(false)
	await get_tree().create_timer(0.8).timeout
	if _battle_over:
		return

	_show_enemy_quote()
	var target: String = "yohani" if randi() % 2 == 0 else "sani"
	_player_hp[target] = maxi(0, _player_hp[target] - ENEMY_ATK)
	_update_player_bars()
	_log("[color=orange]%s 攻擊了 %s！造成 %d 傷害[/color]" % [_enemy_name, target.capitalize(), ENEMY_ATK])
	_log("[color=#888888][i]%s[/i][/color]" % GameContent.BATTLE_QUOTES["系統"]["enemy_attack"])

	var all_down := _player_hp.values().all(func(hp): return hp <= 0)
	if all_down:
		_end_battle(false)
		return

	_is_player_turn = true
	_set_buttons_active(true)

# ── Damage & HP ────────────────────────────────────────────────────

func _hit_enemy(dmg: int) -> void:
	_enemy_hp = maxi(0, _enemy_hp - dmg)
	_update_enemy_bar()
	if _enemy_hp <= 0:
		_end_battle(true)

func _update_enemy_bar() -> void:
	enemy_hp_bar.value = 100.0 * _enemy_hp / _enemy_max_hp

func _update_player_bars() -> void:
	yohani_hp_bar.value = 100.0 * _player_hp["yohani"] / _player_max_hp["yohani"]
	sani_hp_bar.value   = 100.0 * _player_hp["sani"]   / _player_max_hp["sani"]

func _refresh_charges() -> void:
	var yc: int = SaveManager.data.players.get("yohani", {}).get("special_charges", 0)
	var sc: int = SaveManager.data.players.get("sani",   {}).get("special_charges", 0)
	yohani_charges_lbl.text    = "特技：%s" % "★".repeat(yc)
	sani_charges_lbl.text      = "特技：%s" % "♡".repeat(sc)
	yohani_special_btn.disabled = yc <= 0
	sani_special_btn.disabled   = sc <= 0

func _set_buttons_active(on: bool) -> void:
	var yc: int = SaveManager.data.players.get("yohani", {}).get("special_charges", 0)
	var sc: int = SaveManager.data.players.get("sani",   {}).get("special_charges", 0)
	yohani_attack_btn.disabled  = not on
	sani_attack_btn.disabled    = not on
	yohani_special_btn.disabled = not on or yc <= 0
	sani_special_btn.disabled   = not on or sc <= 0

func _can_act() -> bool:
	return _is_player_turn and not _battle_over

# ── Battle End ─────────────────────────────────────────────────────

func _end_battle(player_won: bool) -> void:
	_battle_over = true
	_set_buttons_active(false)

	if player_won:
		_log("\n[b][color=gold]🏆 %s[/color][/b]" % GameContent.BATTLE_QUOTES["系統"]["player_win"])
		# Restore 1 special charge per player as battle reward
		SaveManager.restore_special_charges("yohani")
		SaveManager.restore_special_charges("sani")
	else:
		_log("\n[color=red]%s[/color]" % GameContent.BATTLE_QUOTES["系統"]["player_lose"])

	battle_ended.emit(player_won)
	return_btn.show()

# ── Helpers ────────────────────────────────────────────────────────

func _show_enemy_quote() -> void:
	var lines: Array = GameContent.BATTLE_QUOTES.get(_enemy_name, [])
	if lines.is_empty():
		return
	enemy_dialog_lbl.text = "「%s」" % lines[randi() % lines.size()]

func _log(text: String) -> void:
	battle_log.append_text(text + "\n")

func _on_return() -> void:
	get_tree().change_scene_to_file("res://scenes/Main.tscn")
