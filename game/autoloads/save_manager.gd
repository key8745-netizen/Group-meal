extends Node
## SaveManager — Autoload singleton
## Schema v4: players · parent PIN · session mode · weekend boss
## Persists to user://save_data.json

const SAVE_PATH := "user://save_data.json"
const SCHEMA_VERSION := 4
const PIN_SALT := "family_rpg_v4_"

# 1 XP per 5 real minutes of morning mode, capped at 60 XP per transition
const OFFLINE_XP_PER_SECOND := 1.0 / 300.0
const OFFLINE_XP_MAX := 60

var data: Dictionary = {}

func _ready() -> void:
	load_save()

# ── Load / Save ────────────────────────────────────────────────────

func load_save() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		data = _build_default()
		save_game()
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		data = _build_default()
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed == null or not parsed is Dictionary:
		data = _build_default()
		save_game()
		return
	data = _migrate(parsed)

func save_game() -> void:
	data.session.last_save_time = int(Time.get_unix_time_from_system())
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("[SaveManager] Cannot open save file for writing")
		return
	file.store_string(JSON.stringify(data, "\t"))
	file.close()

static func _build_default() -> Dictionary:
	return {
		"schema_version": SCHEMA_VERSION,
		"players": {
			"yohani": {
				"xp": {"school": 0, "home": 0, "social": 0},
				"level": 1,
				"special_charges": 3,
			},
			"sani": {
				"xp": {"school": 0, "home": 0, "social": 0},
				"level": 1,
				"special_charges": 3,
			},
		},
		"parent": {
			"pin_hash": "",
			"witness_log": [],
		},
		"session": {
			"mode": "morning",
			"mode_start_time": 0,
			"last_save_time": 0,
		},
		"weekend_boss": {
			"hp": 100,
			"max_hp": 100,
			"last_reset_date": "",
			"weakness_active": false,
		},
	}

# ── Schema Migration ───────────────────────────────────────────────

func _migrate(raw: Dictionary) -> Dictionary:
	var v: int = raw.get("schema_version", 1)
	if v == SCHEMA_VERSION:
		return raw
	var d := _build_default()
	# Carry over player progress and parent data from older schemas
	if raw.has("players"):
		for pname in raw.players:
			if d.players.has(pname):
				var p: Dictionary = raw.players[pname]
				if p.has("xp"):
					d.players[pname].xp = p.xp
				if p.has("level"):
					d.players[pname].level = p.level
	if raw.has("parent"):
		var par: Dictionary = raw.parent
		if par.has("pin_hash"):
			d.parent.pin_hash = par.pin_hash
		if par.has("witness_log"):
			d.parent.witness_log = par.witness_log
	d.schema_version = SCHEMA_VERSION
	return d

# ── PIN Management ─────────────────────────────────────────────────

func has_pin() -> bool:
	return data.parent.pin_hash != ""

func set_pin(new_pin: String) -> void:
	data.parent.pin_hash = _hash_pin(new_pin)
	save_game()

func clear_pin() -> void:
	data.parent.pin_hash = ""
	save_game()

func verify_pin(input: String) -> bool:
	if not has_pin():
		return true
	return _hash_pin(input) == data.parent.pin_hash

func _hash_pin(pin: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update((PIN_SALT + pin).to_utf8_buffer())
	return ctx.finish().hex_encode()

# ── XP & Levels ───────────────────────────────────────────────────

func award_xp(player_name: String, domain: String, amount: int) -> void:
	if not data.players.has(player_name):
		return
	if not data.players[player_name].xp.has(domain):
		return
	data.players[player_name].xp[domain] += amount
	_check_level_up(player_name)
	save_game()

func _check_level_up(player_name: String) -> void:
	var player: Dictionary = data.players[player_name]
	var total_xp := get_total_xp(player_name)
	# Level = floor(sqrt(total / 50)) + 1, minimum 1
	var new_level := int(sqrt(float(total_xp) / 50.0)) + 1
	player.level = maxi(player.level, new_level)

func get_total_xp(player_name: String) -> int:
	if not data.players.has(player_name):
		return 0
	var total := 0
	for domain in data.players[player_name].xp:
		total += data.players[player_name].xp[domain]
	return total

# ── Witness Log ───────────────────────────────────────────────────

func log_witness(player_name: String, domain: String, xp: int) -> void:
	var entry := {
		"timestamp": int(Time.get_unix_time_from_system()),
		"date": Time.get_date_string_from_system(),
		"player": player_name,
		"domain": domain,
		"xp": xp,
	}
	data.parent.witness_log.append(entry)
	save_game()

# ── Session / Offline XP ──────────────────────────────────────────

func get_mode() -> String:
	return data.session.mode

func begin_mode(mode: String) -> void:
	data.session.mode = mode
	data.session.mode_start_time = int(Time.get_unix_time_from_system())
	save_game()

## Returns school XP earned passively during the current morning session.
## Call before switching to evening mode, then call begin_mode("evening").
func calculate_offline_xp() -> int:
	if data.session.mode != "morning":
		return 0
	var start: int = data.session.mode_start_time
	if start == 0:
		return 0
	var elapsed: float = Time.get_unix_time_from_system() - float(start)
	return clampi(int(elapsed * OFFLINE_XP_PER_SECOND), 0, OFFLINE_XP_MAX)

# ── Special Charges ───────────────────────────────────────────────

## Returns false if no charges remain (caller should reject the action).
func use_special_charge(player_name: String) -> bool:
	if not data.players.has(player_name):
		return false
	if data.players[player_name].special_charges <= 0:
		return false
	data.players[player_name].special_charges -= 1
	save_game()
	return true

func restore_special_charges(player_name: String, amount: int = 1) -> void:
	if not data.players.has(player_name):
		return
	data.players[player_name].special_charges = clampi(
		data.players[player_name].special_charges + amount, 0, 3
	)
	save_game()

# ── Weekend Boss ──────────────────────────────────────────────────

func reset_weekend_boss_if_needed() -> void:
	var today := Time.get_date_string_from_system()
	if data.weekend_boss.last_reset_date == today:
		return
	var dt := Time.get_datetime_dict_from_system()
	# Reset boss HP every Saturday (weekday == 6)
	if dt.weekday == 6:
		data.weekend_boss.hp = data.weekend_boss.max_hp
		data.weekend_boss.last_reset_date = today
		data.weekend_boss.weakness_active = false
		save_game()

func deal_boss_damage(damage: int) -> void:
	data.weekend_boss.hp = maxi(0, data.weekend_boss.hp - damage)
	save_game()

func set_boss_weakness(active: bool) -> void:
	data.weekend_boss.weakness_active = active
	save_game()
