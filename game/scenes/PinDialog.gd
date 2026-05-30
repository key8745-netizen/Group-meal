extends Window
## PinDialog.gd — 家長 PIN 碼驗證視窗
## Phase 4: 支援「驗證」與「設定新 PIN」兩種模式
## 發出 pin_verified(success: bool) 訊號通知呼叫端

signal pin_verified(success: bool)

enum PinMode { VERIFY, SET_FIRST, CONFIRM_NEW }

const MAX_LEN := 4
const MASK := "●"
const EMPTY := "○"

@onready var title_label: Label = $VBoxContainer/TitleLabel
@onready var pin_display: Label = $VBoxContainer/PinDisplay
@onready var error_label: Label = $VBoxContainer/ErrorLabel
@onready var numpad: GridContainer = $VBoxContainer/NumPad

var _mode: PinMode = PinMode.VERIFY
var _entered: String = ""
var _new_pin_temp: String = ""

func _ready() -> void:
	hide()
	error_label.hide()
	_wire_numpad()
	close_requested.connect(_on_cancel)

func _wire_numpad() -> void:
	for child in numpad.get_children():
		if child is Button:
			child.pressed.connect(_on_btn.bind(child.name))

# ── Public API ─────────────────────────────────────────────────────

func open_for_verification() -> void:
	_mode = PinMode.VERIFY
	title_label.text = "家長驗證 🔐"
	_reset()
	popup_centered()

func open_for_set_pin() -> void:
	_mode = PinMode.SET_FIRST
	_new_pin_temp = ""
	title_label.text = "設定新 PIN（第 1/2 次輸入）"
	_reset()
	popup_centered()

# ── Input Handling ─────────────────────────────────────────────────

func _reset() -> void:
	_entered = ""
	_refresh_display()
	error_label.hide()

func _refresh_display() -> void:
	var filled := MASK.repeat(_entered.length())
	var empty  := EMPTY.repeat(MAX_LEN - _entered.length())
	pin_display.text = filled + empty

func _on_btn(btn_name: String) -> void:
	match btn_name:
		"ClearButton":
			_entered = ""
			_refresh_display()
			error_label.hide()
		"ConfirmButton":
			_try_confirm()
		_:
			# Button names are "Btn0" … "Btn9"
			var digit := btn_name.trim_prefix("Btn")
			if digit.is_valid_int() and _entered.length() < MAX_LEN:
				_entered += digit
				_refresh_display()
				if _entered.length() == MAX_LEN:
					_try_confirm()

func _try_confirm() -> void:
	match _mode:
		PinMode.VERIFY:
			if SaveManager.verify_pin(_entered):
				hide()
				pin_verified.emit(true)
			else:
				error_label.text = "❌ PIN 碼不正確，請再試一次"
				error_label.show()
				_entered = ""
				_refresh_display()

		PinMode.SET_FIRST:
			_new_pin_temp = _entered
			_mode = PinMode.CONFIRM_NEW
			title_label.text = "確認新 PIN（第 2/2 次輸入）"
			_reset()

		PinMode.CONFIRM_NEW:
			if _entered == _new_pin_temp:
				SaveManager.set_pin(_entered)
				hide()
				pin_verified.emit(true)
			else:
				error_label.text = "❌ 兩次輸入不一致，請重新設定"
				error_label.show()
				_new_pin_temp = ""
				_mode = PinMode.SET_FIRST
				title_label.text = "設定新 PIN（第 1/2 次輸入）"
				_reset()

func _on_cancel() -> void:
	hide()
	pin_verified.emit(false)
