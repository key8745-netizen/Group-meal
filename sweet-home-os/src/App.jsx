// Sweet Home OS — React Prototype
// Phase 3A: 任務完成直接打 Boss (battle log)
// Software 3.2: Gemini → ChatGPT → Claude

import { useState, useMemo } from 'react'

// ═══════════════════════════════════════════════════════════════
// STATIC DATA
// ═══════════════════════════════════════════════════════════════

const BOSS_NAME   = '混沌霧靈'
const BOSS_MAX_HP = 100

const SYSTEM_QUESTS = [
  {
    id: 'q_bed',
    label: '床鋪重置',
    zone: 'bedroom',
    dmg: 10,
    xp: 15,
    fantasy: '臥室塔的混亂退散一縷',
    eventTitle: '臥室混亂事件',
    monsterName: '枕頭史萊姆',
  },
  {
    id: 'q_dishes',
    label: '洗碗',
    zone: 'kitchen',
    dmg: 12,
    xp: 18,
    fantasy: '廚房護城河清澈了一分',
    eventTitle: '廚房污穢蔓延',
    monsterName: '碗碟哥布林',
  },
  {
    id: 'q_laundry',
    label: '收衣整理',
    zone: 'living',
    dmg: 8,
    xp: 12,
    fantasy: '家庭廣場的霧氣散去',
    eventTitle: '衣物混亂入侵',
    monsterName: '散落衣魔',
  },
  {
    id: 'q_study',
    label: '完成今日功課',
    zone: 'study',
    dmg: 20,
    xp: 30,
    fantasy: '書房塔的智慧之光燃起',
    eventTitle: '拖延史萊姆盤踞書房',
    monsterName: '拖延史萊姆',
  },
  {
    id: 'q_bath',
    label: '洗澡',
    zone: 'bedroom',
    dmg: 6,
    xp: 10,
    fantasy: '臥室塔恢復安全結界',
    eventTitle: '臥室疲憊之氣',
    monsterName: '懶怠精靈',
  },
  {
    id: 'q_sweep',
    label: '掃地',
    zone: 'living',
    dmg: 8,
    xp: 12,
    fantasy: '家庭廣場的混亂之塵被清除',
    eventTitle: '客廳塵埃暴動',
    monsterName: '亂亂哥布林',
  },
]

const ZONES = {
  bedroom: { name: '臥室塔',     emoji: '🏰' },
  kitchen: { name: '廚房護城河', emoji: '🏯' },
  living:  { name: '家庭廣場',   emoji: '🌿' },
  study:   { name: '書房之塔',   emoji: '📚' },
  custom:  { name: '家庭新邊境', emoji: '🗺️' },
}

const REWARDS = [
  { id: 'r_screen', label: '30 分鐘 3C 時間',  cost: 30 },
  { id: 'r_snack',  label: '選一個點心',        cost: 20 },
  { id: 'r_movie',  label: '家庭電影之夜',      cost: 50 },
]

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function zoneStatusOf(zoneId, quests, done) {
  const zq = quests.filter(q => q.zone === zoneId)
  if (zq.length === 0) return 'clear'
  const ratio = zq.filter(q => done[q.id]).length / zq.length
  if (ratio === 0)   return 'chaos'
  if (ratio < 1)     return 'recovering'
  return 'clear'
}

const STATUS_LABEL = { chaos: '混亂盤踞', recovering: '正在恢復', clear: '已淨化' }
const STATUS_COLOR = { chaos: '#f85149',  recovering:  '#e3b341', clear:  '#3fb950' }

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  // ── Quest state ───────────────────────────────────────────────
  const [done,         setDone]         = useState({})
  const [customQuests, setCustomQuests] = useState([])
  const [flashId,      setFlashId]      = useState(null)

  // ── Phase 3A: battle log ──────────────────────────────────────
  // Stores one entry per completed quest (questId = quest.id).
  // Boss-defeated entry is derived separately via displayBattleLog.
  const [battleLog, setBattleLog] = useState([])

  // ── XP / rewards ─────────────────────────────────────────────
  const [totalXP,       setTotalXP]       = useState(0)
  const [spentXP,       setSpentXP]       = useState(0)
  const [rewardHistory, setRewardHistory] = useState([])

  // ── Mode ──────────────────────────────────────────────────────
  const [mode,            setMode]            = useState('morning')
  const [showDailyResult, setShowDailyResult] = useState(false)

  // ── QuestBuilder ──────────────────────────────────────────────
  const [builderOpen,       setBuilderOpen]       = useState(false)
  const [builderLabel,      setBuilderLabel]      = useState('')
  const [builderDmg,        setBuilderDmg]        = useState(10)
  const [builderXp,         setBuilderXp]         = useState(15)
  const [builderZone,       setBuilderZone]       = useState('custom')
  const [builderEventTitle, setBuilderEventTitle] = useState('')
  const [builderMonster,    setBuilderMonster]    = useState('')

  // ── UI panel toggles ──────────────────────────────────────────
  const [mapOpen,  setMapOpen]  = useState(true)
  const [shopOpen, setShopOpen] = useState(false)

  // ── Derived values ────────────────────────────────────────────
  const allQuests    = [...SYSTEM_QUESTS, ...customQuests]
  const totalDmg     = allQuests.filter(q => done[q.id]).reduce((s, q) => s + q.dmg, 0)
  const bossHP       = Math.max(0, BOSS_MAX_HP - totalDmg)
  const bossDefeated = bossHP === 0
  const availableXP  = totalXP - spentXP
  const doneCount    = allQuests.filter(q => done[q.id]).length

  // Phase 3A: prepend boss-defeated entry when boss HP hits 0
  const displayBattleLog = useMemo(() => {
    if (!bossDefeated || battleLog.length === 0) return battleLog
    return [
      {
        id: '__boss__',
        questId: '__boss__',
        isBossDefeated: true,
        message: `🏆 ${BOSS_NAME}被擊敗！家園的光明恢復了！`,
      },
      ...battleLog,
    ]
  }, [battleLog, bossDefeated])

  // ── toggleQuest (Phase 3A core) ───────────────────────────────
  function toggleQuest(id) {
    const quest = allQuests.find(q => q.id === id)
    if (!quest) return
    const nowDone = !done[id]

    setDone(prev => ({ ...prev, [id]: nowDone }))

    if (nowDone) {
      // Add battle log entry immediately
      setBattleLog(prev => [
        {
          id: `${id}_${Date.now()}`,
          questId: id,
          questLabel: quest.label,
          fantasy: quest.fantasy,
          dmg: quest.dmg,
          xp: quest.xp,
          createdAt: Date.now(),
        },
        ...prev,
      ])
      setTotalXP(prev => prev + quest.xp)
      // Flash feedback on the quest row
      setFlashId(id)
      setTimeout(() => setFlashId(null), 700)
    } else {
      // Remove this quest's entry from the log; boss-defeat entry auto-clears via displayBattleLog
      setBattleLog(prev => prev.filter(e => e.questId !== id))
      setTotalXP(prev => Math.max(0, prev - quest.xp))
    }
  }

  // ── QuestBuilder submit ───────────────────────────────────────
  function handleBuilderSubmit(e) {
    e.preventDefault()
    if (!builderLabel.trim()) return
    setCustomQuests(prev => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        label: builderLabel.trim(),
        zone: builderZone,
        dmg: Number(builderDmg),
        xp: Number(builderXp),
        fantasy: `家庭新邊境的${builderLabel.trim()}完成了`,
        eventTitle: builderEventTitle.trim() || undefined,
        monsterName: builderMonster.trim() || undefined,
      },
    ])
    setBuilderLabel('')
    setBuilderEventTitle('')
    setBuilderMonster('')
    setBuilderDmg(10)
    setBuilderXp(15)
    setBuilderZone('custom')
    setBuilderOpen(false)
  }

  // ── Reward shop ───────────────────────────────────────────────
  function buyReward(reward) {
    if (availableXP < reward.cost) return
    setSpentXP(prev => prev + reward.cost)
    setRewardHistory(prev => [{ ...reward, boughtAt: Date.now() }, ...prev])
  }

  // ── Daily reset (Evening Hearth) ──────────────────────────────
  function welcomeDawn() {
    setDone({})
    setBattleLog([])
    setTotalXP(0)
    setSpentXP(0)
    setCustomQuests([])
    setRewardHistory([])
    setMode('morning')
    setShowDailyResult(false)
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <span className="logo">🏰</span>
          <span className="app-name">Sweet Home OS</span>
          <span className="version">v0.3a</span>
        </div>
        <button
          className={`mode-btn ${mode === 'morning' ? 'mode-morning' : 'mode-evening'}`}
          onClick={() => {
            if (mode === 'morning') setMode('evening')
            else { setMode('morning'); setShowDailyResult(false) }
          }}
        >
          {mode === 'morning' ? '☀️ 早晨遠征' : '🌙 暮色營火'}
        </button>
      </header>

      <main className="main">
        {/* ── Software 3.2 banner ─────────────────────────────── */}
        <div className="s3-banner">
          <span>🔍 Perplexity</span>
          <span className="arrow">→</span>
          <span>⚡ Grok</span>
          <span className="arrow">→</span>
          <span>✨ Gemini</span>
          <span className="arrow">→</span>
          <span>📋 ChatGPT</span>
          <span className="arrow">→</span>
          <span className="active-role">⚙️ Claude · Phase 3A</span>
        </div>

        {/* ── Boss HP Card ────────────────────────────────────── */}
        <section className="card boss-card">
          <div className="boss-header">
            <span className="boss-avatar">{bossDefeated ? '💀' : '👾'}</span>
            <div className="boss-info">
              <div className="boss-name">{BOSS_NAME}</div>
              <div className="boss-sub">今日混亂之源</div>
            </div>
            <div className={`boss-hp-num ${bossDefeated ? 'defeated' : ''}`}>
              {bossDefeated ? '已擊敗' : `HP ${bossHP} / ${BOSS_MAX_HP}`}
            </div>
          </div>

          <div className="hp-track">
            <div
              className="hp-fill"
              style={{
                width: `${(bossHP / BOSS_MAX_HP) * 100}%`,
                background: bossDefeated ? '#3fb950' : bossHP < 30 ? '#f85149' : '#e3b341',
              }}
            />
          </div>

          {/* ── Phase 3A: 戰鬥速報 ─────────────────────────── */}
          <div className="battle-log-section">
            <div className="battle-log-title">⚔️ 戰鬥速報</div>
            {displayBattleLog.length === 0 ? (
              <div className="log-empty">
                完成第一個任務後，戰鬥速報會開始記錄。
              </div>
            ) : (
              <div className="log-list">
                {displayBattleLog.slice(0, 5).map(entry => (
                  <div
                    key={entry.id}
                    className={`log-entry ${entry.isBossDefeated ? 'log-victory' : ''}`}
                  >
                    {entry.isBossDefeated ? (
                      <span className="log-victory-msg">{entry.message}</span>
                    ) : (
                      <>
                        <span className="log-icon">⚔️</span>
                        <div className="log-body">
                          <span className="log-quest">{entry.questLabel}</span>
                          <span className="log-stats">
                            <span className="log-dmg">−{entry.dmg} HP</span>
                            <span className="log-xp">+{entry.xp} XP</span>
                          </span>
                          <div className="log-fantasy">{entry.fantasy}</div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {displayBattleLog.length > 5 && (
                  <div className="log-more">
                    …還有 {displayBattleLog.length - 5} 條記錄
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Quest Board ─────────────────────────────────────── */}
        <section className="card">
          <div className="section-title">
            📜 今日任務
            <span className="badge">{doneCount}/{allQuests.length}</span>
          </div>

          <div className="quest-list">
            {allQuests.map(q => (
              <div
                key={q.id}
                className={[
                  'quest-item',
                  done[q.id] ? 'quest-done' : '',
                  flashId === q.id ? 'quest-flash' : '',
                ].join(' ')}
                onClick={() => toggleQuest(q.id)}
                role="checkbox"
                aria-checked={!!done[q.id]}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && toggleQuest(q.id)}
              >
                <span className="q-check">{done[q.id] ? '✅' : '⬜'}</span>
                <div className="q-info">
                  <span className="q-label">{q.label}</span>
                  {q.eventTitle && (
                    <span className="q-event">
                      {ZONES[q.zone]?.emoji} {q.eventTitle}
                      {q.monsterName && ` — ${q.monsterName}`}
                    </span>
                  )}
                </div>
                <div className="q-stats">
                  <span className="q-dmg" title="對 Boss 造成傷害">⚔️{q.dmg}</span>
                  <span className="q-xp"  title="獲得 XP">✨{q.xp}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-ghost" onClick={() => setBuilderOpen(o => !o)}>
            {builderOpen ? '✕ 關閉編輯器' : '＋ GM 新增任務'}
          </button>

          {/* ── QuestBuilder ──────────────────────────────── */}
          {builderOpen && (
            <form className="builder" onSubmit={handleBuilderSubmit}>
              <div className="builder-title">🛠 GM 任務編輯器</div>

              <label className="field">
                <span>任務名稱 *</span>
                <input
                  value={builderLabel}
                  onChange={e => setBuilderLabel(e.target.value)}
                  placeholder="例：整理玩具"
                  required
                />
              </label>

              <label className="field">
                <span>世界事件（可選）</span>
                <input
                  value={builderEventTitle}
                  onChange={e => setBuilderEventTitle(e.target.value)}
                  placeholder="例：玩具混亂入侵"
                />
              </label>

              <label className="field">
                <span>怪物名稱（可選）</span>
                <input
                  value={builderMonster}
                  onChange={e => setBuilderMonster(e.target.value)}
                  placeholder="例：亂亂哥布林"
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>區域</span>
                  <select value={builderZone} onChange={e => setBuilderZone(e.target.value)}>
                    {Object.entries(ZONES).map(([id, z]) => (
                      <option key={id} value={id}>{z.emoji} {z.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>傷害 (1–30)</span>
                  <input
                    type="number" value={builderDmg} min={1} max={30}
                    onChange={e => setBuilderDmg(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>XP (1–50)</span>
                  <input
                    type="number" value={builderXp} min={1} max={50}
                    onChange={e => setBuilderXp(e.target.value)}
                  />
                </label>
              </div>

              <button type="submit" className="btn btn-primary">加入任務</button>
            </form>
          )}
        </section>

        {/* ── World Map ────────────────────────────────────────── */}
        <section className="card">
          <div className="section-title clickable" onClick={() => setMapOpen(o => !o)}>
            🗺 世界地圖 <span className="toggle-arrow">{mapOpen ? '▲' : '▼'}</span>
          </div>
          {mapOpen && (
            <div className="zone-grid">
              {Object.entries(ZONES).map(([zoneId, zone]) => {
                const status    = zoneStatusOf(zoneId, allQuests, done)
                const zoneQs    = allQuests.filter(q => q.zone === zoneId)
                const lastDone  = [...zoneQs].reverse().find(q => done[q.id])
                const nextTodo  = zoneQs.find(q => !done[q.id])
                return (
                  <div key={zoneId} className="zone-card">
                    <div className="zone-top">
                      <span className="zone-emoji">{zone.emoji}</span>
                      <span className="zone-name">{zone.name}</span>
                    </div>
                    <div className="zone-status" style={{ color: STATUS_COLOR[status] }}>
                      {STATUS_LABEL[status]}
                    </div>
                    {lastDone && (
                      <div className="zone-recent">✦ {lastDone.fantasy}</div>
                    )}
                    {nextTodo && status !== 'clear' && (
                      <div className="zone-next">▶ {nextTodo.label}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Evening Hearth ───────────────────────────────────── */}
        {mode === 'evening' && (
          <section className="card evening-card">
            <div className="section-title">🌙 暮色營火</div>
            {showDailyResult ? (
              <div className="daily-result">
                <div className="result-title">📊 今日戰果</div>
                <div className="result-grid">
                  <div className="result-row">
                    <span>完成任務</span>
                    <strong>{doneCount} / {allQuests.length}</strong>
                  </div>
                  <div className="result-row">
                    <span>累積 XP</span>
                    <strong>{totalXP}</strong>
                  </div>
                  <div className="result-row">
                    <span>造成傷害</span>
                    <strong>{totalDmg}</strong>
                  </div>
                  <div className="result-row">
                    <span>Boss 狀態</span>
                    <strong>{bossDefeated ? '💀 已擊敗' : `HP ${bossHP} 殘留`}</strong>
                  </div>
                </div>
                <div className="result-msg">
                  {bossDefeated
                    ? '🏆 今日完美！家園的光明完全恢復了！'
                    : doneCount > 0
                    ? '✨ 今天的努力讓家園更明亮了一些。'
                    : '💤 今天先休息，明天再戰吧。'}
                </div>
                <button className="btn btn-primary" onClick={welcomeDawn}>
                  迎接黎明 · 重置今日
                </button>
              </div>
            ) : (
              <button className="btn btn-evening" onClick={() => setShowDailyResult(true)}>
                查看今日戰果
              </button>
            )}
          </section>
        )}

        {/* ── Reward Shop ──────────────────────────────────────── */}
        <section className="card">
          <div className="section-title clickable" onClick={() => setShopOpen(o => !o)}>
            💎 獎勵商店
            <span className="xp-badge">可用 XP: {availableXP}</span>
            <span className="toggle-arrow">{shopOpen ? '▲' : '▼'}</span>
          </div>
          {shopOpen && (
            <>
              <div className="reward-list">
                {REWARDS.map(r => (
                  <div key={r.id} className="reward-row">
                    <span className="reward-label">{r.label}</span>
                    <button
                      className={`btn btn-small ${availableXP < r.cost ? 'btn-dim' : 'btn-reward'}`}
                      onClick={() => buyReward(r)}
                      disabled={availableXP < r.cost}
                    >
                      兌換 {r.cost} XP
                    </button>
                  </div>
                ))}
              </div>
              {rewardHistory.length > 0 && (
                <div className="reward-history">
                  已兌換：
                  {rewardHistory.slice(0, 3).map((r, i) => (
                    <span key={i} className="reward-done">✓ {r.label}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
