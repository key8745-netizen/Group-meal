extends Control
## Main.gd — 家族冒險主世界
## Phase 4 實作：
##   1. 見證儀式 PIN 驗證（家長設定 PIN 後，確認前強制驗證）
##   2. 早晨→暮色切換時計算「學校大陸」離線 XP 補貼
##   3. 週末 Boss 每週六自動重置

signal mode_changed(new_mode: String)
signal witness_completed(player_name: String, domain: String, xp: int)

# ── Node refs ──────────────────────────────────────────────────────
@onready var mode_toggle_btn: Button       = $TopBar/ModeToggleBtn
@onready var current_mode_label: Label     = $TopBar/CurrentModeLabel

@onready var morning_panel: Panel          = $ContentArea/MorningPanel
@onready var evening_panel: Panel          = $ContentArea/EveningPanel

@onready var yohani_xp_label: Label        = $ContentArea/PlayerStatusBox/YohaniStatus/YohaniXPLabel
@onready var yohani_level_label: Label     = $ContentArea/PlayerStatusBox/YohaniStatus/YohaniLevelLabel
@onready var sani_xp_label: Label          = $ContentArea/PlayerStatusBox/SaniStatus/SaniXPLabel
@onready var sani_level_label: Label       = $ContentArea/PlayerStatusBox/SaniStatus/SaniLevelLabel

@onready var witness_player_opt: OptionButton = $WitnessSection/WitnessPlayerOption
@onready var witness_domain_opt: OptionButton = $WitnessSection/WitnessDomainOption
@onready var witness_xp_spin: SpinBox      = $WitnessSection/WitnessXPSpinBox
@onready var witness_btn: Button           = $WitnessSection/WitnessButton
@onready var witness_result_lbl: Label     = $WitnessSection/WitnessResultLabel

@onready var set_pin_btn: Button           = $PinSection/SetPinButton
@onready var clear_pin_btn: Button         = $PinSection/ClearPinButton
@onready var pin_status_lbl: Label         = $PinSection/PinStatusLabel

@onready var offline_xp_dialog: AcceptDialog = $OfflineXPDialog
@onready var pin_dialog: Window              = $PinDialog

# ── Constants ──────────────────────────────────────────────────────
const PLAYERS := ["yohani", "sani"]
const DOMAINS := ["school", "home", "social"]
const DOMAIN_LABEL := {
	"school": "學校大陸",
	"home":   "家之島",
	"social": "社交廣場",
}
const MODE_LABEL := {
	"morning": "☀️ 早晨遠征",
	"evening": "🌙 暮色營火",
}

# ── State ──────────────────────────────────────────────────────────
var _pending_player: String  = ""
var _pending_domain: String  = ""
var _pending_xp: int         = 0
# Callable invoked after successful PIN verification; reset to empty after use.
var _pin_callback: Callable  = Callable()

# ── Lifecycle ──────────────────────────────────────────────────────

func _ready() -> void:
	_setup_witness_options()
	_connect_signals()
	_refresh_ui()
	SaveManager.reset_weekend_boss_if_needed()

func _setup_witness_options() -> void:
	witness_player_opt.clear()
	for p in PLAYERS:
		witness_player_opt.add_item(p.capitalize())

	witness_domain_opt.clear()
	for d in DOMAINS:
		witness_domain_opt.add_item(DOMAIN_LABEL[d])

	witness_xp_spin.min_value = 1
	witness_xp_spin.max_value = 100
	witness_xp_spin.value     = 10

func _connect_signals() -> void:
	mode_toggle_btn.pressed.connect(_on_mode_toggle)
	witness_btn.pressed.connect(_on_witness_pressed)
	set_pin_btn.pressed.connect(_on_set_pin)
	clear_pin_btn.pressed.connect(_on_clear_pin)
	pin_dialog.pin_verified.connect(_on_pin_result)

# ── Mode Toggle ────────────────────────────────────────────────────

func _on_mode_toggle() -> void:
	if SaveManager.get_mode() == "morning":
		_switch_to_evening()
	else:
		_switch_to_morning()

func _switch_to_evening() -> void:
	# Calculate offline XP before committing the mode switch
	var offline_xp := SaveManager.calculate_offline_xp()
	if offline_xp > 0:
		for player in PLAYERS:
			SaveManager.award_xp(player, "school", offline_xp)
		_show_offline_xp_popup(offline_xp)
	SaveManager.begin_mode("evening")
	_refresh_ui()
	mode_changed.emit("evening")

func _switch_to_morning() -> void:
	SaveManager.begin_mode("morning")
	_refresh_ui()
	mode_changed.emit("morning")

func _show_offline_xp_popup(xp: int) -> void:
	offline_xp_dialog.dialog_text = (
		"你在學校奮鬥的時間已被記錄！\n\n"
		+ "「學校大陸」離線 XP：+%d\n（yohani + sani 全員獲得）" % xp
	)
	offline_xp_dialog.popup_centered()

# ── Witness Ceremony ───────────────────────────────────────────────

func _on_witness_pressed() -> void:
	_pending_player = PLAYERS[witness_player_opt.selected]
	_pending_domain = DOMAINS[witness_domain_opt.selected]
	_pending_xp     = int(witness_xp_spin.value)

	if SaveManager.has_pin():
		# PIN is required — open verification dialog before confirming witness
		_pin_callback = _confirm_witness
		pin_dialog.open_for_verification()
	else:
		_confirm_witness()

func _on_pin_result(success: bool) -> void:
	if success and _pin_callback.is_valid():
		_pin_callback.call()
	elif not success:
		witness_result_lbl.text  = "❌ PIN 碼錯誤，見證取消"
		witness_result_lbl.modulate = Color.RED
	_pin_callback = Callable()

func _confirm_witness() -> void:
	SaveManager.award_xp(_pending_player, _pending_domain, _pending_xp)
	SaveManager.log_witness(_pending_player, _pending_domain, _pending_xp)

	var dlbl := DOMAIN_LABEL.get(_pending_domain, _pending_domain)
	witness_result_lbl.text = (
		"✅ 見證完成！\n%s 在「%s」獲得 +%d XP"
		% [_pending_player.capitalize(), dlbl, _pending_xp]
	)
	witness_result_lbl.modulate = Color.GREEN
	witness_completed.emit(_pending_player, _pending_domain, _pending_xp)
	_refresh_ui()

# ── PIN Management ─────────────────────────────────────────────────

func _on_set_pin() -> void:
	pin_dialog.open_for_set_pin()
	# pin_dialog will call SaveManager.set_pin() internally on success
	_pin_callback = _refresh_pin_status

func _on_clear_pin() -> void:
	if SaveManager.has_pin():
		_pin_callback = _do_clear_pin
		pin_dialog.open_for_verification()
	else:
		pin_status_lbl.text = "尚未設定 PIN 碼"

func _do_clear_pin() -> void:
	SaveManager.clear_pin()
	_refresh_pin_status()

func _refresh_pin_status() -> void:
	if SaveManager.has_pin():
		pin_status_lbl.text    = "🔒 PIN 已設定"
		clear_pin_btn.disabled = false
	else:
		pin_status_lbl.text    = "🔓 未設定 PIN"
		clear_pin_btn.disabled = true

# ── UI Refresh ─────────────────────────────────────────────────────

func _refresh_ui() -> void:
	var mode := SaveManager.get_mode()
	current_mode_label.text = MODE_LABEL.get(mode, mode)
	morning_panel.visible   = (mode == "morning")
	evening_panel.visible   = (mode == "evening")
	mode_toggle_btn.text    = (
		"切換至暮色營火 🌙" if mode == "morning" else "切換至早晨遠征 ☀️"
	)
	_refresh_player("yohani", yohani_xp_label, yohani_level_label)
	_refresh_player("sani",   sani_xp_label,   sani_level_label)
	_refresh_pin_status()

func _refresh_player(pname: String, xp_lbl: Label, lv_lbl: Label) -> void:
	var pdata: Dictionary = SaveManager.data.players.get(pname, {})
	if pdata.is_empty():
		return
	var school_xp: int = pdata.xp.get("school", 0)
	xp_lbl.text = "XP: %d  (學校 %d)" % [SaveManager.get_total_xp(pname), school_xp]
	lv_lbl.text = "Lv. %d" % pdata.level
