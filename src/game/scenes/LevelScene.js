import Phaser from 'phaser'
import Gerald from '../objects/Gerald'
import Collectible from '../objects/Collectible'
import Hazard, { HAZARD_TYPES } from '../objects/Hazard'
import { LEVELS, LEVEL_ORDER } from '../data/levels'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { loadSave, saveSave } from '../data/saveData'
import { DEBUG_GERALD, debugLog, getSceneDebugSnapshot } from '../debug'

const WATER_TOP = 150
const POOL_BOTTOM = GAME_HEIGHT - 50
// Zone thresholds for drown meter behavior
const SURFACE_ZONE_Y = WATER_TOP + 65  // y <= 215: broader surface recovery zone
const DANGER_ZONE_Y = 540              // y >= 540: rapid drown zone
const MAX_ACTIVE_HAZARDS = 40

export default class LevelScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelScene' })
  }

  init(data) {
    this.levelId = data.levelId || 'shallow_end'
    this.levelDef = LEVELS[this.levelId]
  }

  create() {
    if (!this.levelDef) {
      debugLog('LevelScene.missingLevelDef', { levelId: this.levelId })
      this.scene.start('MenuScene')
      return
    }

    const save = loadSave()
    this.saveData = save

    this.drownMeter = 0
    this.isBossLevel = !!this.levelDef.isBoss
    this.score = this.registry.get('score') || 0
    this.geraldPoints = save.geraldPoints || this.registry.get('geraldPoints') || 0
    this.levelProgress = 0
    this.campaignProgress = save.campaignProgress || 0
    this.isGameOver = false
    this.isWon = false
    this.checkpointsPassed = new Set()
    this.splashZones = []
    this.jetZones = []
    this.vacuumZones = []
    this.hazardList = []
    this.finishLineSpawned = false
    this.finishLineObj = null
    this.drownBlinkEvent = null
    this.sectionFill = null
    this._hazardSequenceIdx = 0
    this._transitioning = false
    this._lastDebugAt = 0
    this._envVelocityX = 0
    this._envVelocityY = 0
    this._lastAppliedForce = null
    this._forceDebugZones = []
    this._forceDebugCircles = []
    this.surfaceBreathCount = 0
    this._surfaceVisitRecovery = 0
    this._surfaceVisitCounted = false
    this._wasInSurfaceZone = false
    this._surfaceHoldMs = 0
    this._surfacePressureIdx = 0
    this.bossHealth = this.levelDef.bossHealth || 0
    this.bossMaxHealth = this.levelDef.bossHealth || 0
    this.bossPhase = 1
    this.bossObj = null
    this.bossDefeated = false
    this.bossGuardTarget = null
    this.bossGuardUntil = 0

    debugLog('LevelScene.create', getSceneDebugSnapshot(this))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._cleanupLevelScene('shutdown'))

    this.collectibles = this.physics.add.group()
    this.hazardPhysicsGroup = this.physics.add.group()

    this._createBackground()
    this._spawnGerald()
    this._createUI()
    this._createMobileControls()
    if (this.isBossLevel) this._createBoss()

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      bob: Phaser.Input.Keyboard.KeyCodes.SPACE,
    })

    this.physics.add.overlap(this.gerald, this.collectibles, this._onCollect, null, this)
    this.physics.add.overlap(this.gerald, this.hazardPhysicsGroup, this._onPhysicsHazardHit, null, this)
    this._createForceDebugOverlay()

    this.input.on('pointerdown', (pointer, currentlyOver) => {
      if (this.isGameOver || this.isWon) return
      if (currentlyOver && currentlyOver.length > 0) return
      this.gerald.bob()
    })

    this._startSpawnTimers()

    this.time.addEvent({
      delay: 1000,
      callback: this._addSurviveScore,
      callbackScope: this,
      loop: true,
    })
  }

  // --- BACKGROUND ---
  _createBackground() {
    const bg = this.add.graphics().setDepth(0)
    const def = this.levelDef

    bg.fillStyle(0xf0f8ff)
    bg.fillRect(0, 0, GAME_WIDTH, WATER_TOP)

    const topColor = def.waterColorTop || 0x29b6f6
    const botColor = def.waterColorBottom || 0x01579b
    bg.fillGradientStyle(topColor, topColor, botColor, botColor, 1)
    bg.fillRect(0, WATER_TOP, GAME_WIDTH, GAME_HEIGHT - WATER_TOP)

    bg.fillStyle(0x80c8e0)
    bg.fillRect(0, POOL_BOTTOM, GAME_WIDTH, GAME_HEIGHT - POOL_BOTTOM)

    bg.fillStyle(0xe8f4f8)
    bg.fillRect(0, WATER_TOP - 14, GAME_WIDTH, 14)
    bg.fillStyle(0x2196f3, 0.4)
    bg.fillRect(0, WATER_TOP, GAME_WIDTH, 6)

    for (let i = 0; i < 10; i++) {
      const sh = this.add.text(
        Phaser.Math.Between(10, GAME_WIDTH - 10),
        Phaser.Math.Between(WATER_TOP + 20, POOL_BOTTOM - 20),
        '~', { fontSize: '18px', color: '#aaddff', alpha: 0.3 }
      ).setDepth(1)
      this.tweens.add({
        targets: sh, alpha: 0.08,
        duration: Phaser.Math.Between(900, 2200),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
      })
    }

    // Level title - plain text, no emoji
    this.add.text(GAME_WIDTH / 2, 16, this.levelDef.name.toUpperCase(), {
      fontSize: '15px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#003399',
    }).setOrigin(0.5).setDepth(20)
  }

  // --- GERALD SPAWN ---
  _spawnGerald() {
    this.gerald = new Gerald(this, 80, WATER_TOP + 60)

    this.gerald.baseSinkSpeed = this.levelDef.sinkSpeed || 16
    this.gerald.sinkSpeed = this.gerald.baseSinkSpeed
    this.gerald.maxDownVelocity = this.levelDef.maxDownVelocity || 190

    const purchased = this.saveData.purchasedUpgrades || this.registry.get('purchasedUpgrades') || []
    this.gerald.applyUpgrades(purchased)

    console.log(`[LevelScene] Level ${this.levelDef.name} - sinkSpeed=${this.gerald.sinkSpeed.toFixed(1)} bobPower=${this.gerald.bobPower}`)

    this.physics.world.setBounds(0, -200, GAME_WIDTH, POOL_BOTTOM + 200)
    this.gerald.setCollideWorldBounds(true)
  }

  // --- UI ---
  _createUI() {
    this.add.text(10, 36, 'DROWN', {
      fontSize: '11px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ff4444',
    }).setDepth(30)

    this.drownBg = this.add.graphics().setDepth(29)
    this.drownBg.fillStyle(0x000000, 0.5)
    this.drownBg.fillRoundedRect(8, 48, 120, 16, 6)

    this.drownFill = this.add.graphics().setDepth(30)

    const drownBorder = this.add.graphics().setDepth(31)
    drownBorder.lineStyle(2, 0xff4444)
    drownBorder.strokeRoundedRect(8, 48, 120, 16, 6)

    // SCORE - plain text
    this.scoreTxt = this.add.text(GAME_WIDTH - 10, 36, `SCORE: ${this.score}`, {
      fontSize: '13px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00',
      stroke: '#664400',
      strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(30)

    // GERALD POINTS - plain text
    this.gpTxt = this.add.text(GAME_WIDTH - 10, 54, `GP: ${this.geraldPoints}`, {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffdd00',
    }).setOrigin(1, 0).setDepth(30)

    // Campaign progress bar — label "DEEP END" (no arrow)
    this.add.text(GAME_WIDTH / 2, 36, 'DEEP END', {
      fontSize: '9px',
      fontFamily: 'Arial, sans-serif',
      color: '#99ccff',
    }).setOrigin(0.5).setDepth(30)

    this.progressBg = this.add.graphics().setDepth(29)
    this.progressBg.fillStyle(0x000000, 0.4)
    this.progressBg.fillRoundedRect(GAME_WIDTH / 2 - 60, 44, 120, 8, 3)

    this.progressFill = this.add.graphics().setDepth(30)

    // Section progress bar — plain label
    this.add.text(GAME_WIDTH / 2, 56, 'Section', {
      fontSize: '7px',
      fontFamily: 'Arial, sans-serif',
      color: '#6688aa',
    }).setOrigin(0.5).setDepth(30)

    const sectionBg = this.add.graphics().setDepth(29)
    sectionBg.fillStyle(0x000000, 0.3)
    sectionBg.fillRoundedRect(GAME_WIDTH / 2 - 50, 63, 100, 5, 2)

    this.sectionFill = this.add.graphics().setDepth(30)

    const hintText = this.add.text(GAME_WIDTH / 2, WATER_TOP + 50, 'Tap SPACE or click to swim up! Reach FINISH to win!', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      stroke: '#000033',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 30 },
    }).setOrigin(0.5).setDepth(25)
    this.time.delayedCall(3500, () => {
      this.tweens.add({ targets: hintText, alpha: 0, duration: 1000, onComplete: () => hintText.destroy() })
    })

    this._updateUI()
  }

  _updateUI() {
    const drownPct = this.drownMeter / 100
    let fillColor = 0x44bb44
    if (drownPct > 0.5) fillColor = 0xffaa00
    if (drownPct > 0.75) fillColor = 0xff4400

    this.drownFill.clear()
    this.drownFill.fillStyle(fillColor)
    this.drownFill.fillRoundedRect(8, 48, 120 * drownPct, 16, 6)

    // Plain text — no emoji
    this.scoreTxt.setText(`SCORE: ${this.score}`)
    this.gpTxt.setText(`GP: ${this.geraldPoints}`)

    const progressPct = Math.min(this.campaignProgress / 100, 1)
    this.progressFill.clear()
    this.progressFill.fillStyle(0x00ccff)
    this.progressFill.fillRoundedRect(GAME_WIDTH / 2 - 60, 44, 120 * progressPct, 8, 3)

    if (this.sectionFill) {
      const sectionPct = Math.min(this.levelProgress / this.levelDef.levelLength, 1)
      this.sectionFill.clear()
      this.sectionFill.fillStyle(0x6688cc)
      this.sectionFill.fillRoundedRect(GAME_WIDTH / 2 - 50, 63, 100 * sectionPct, 5, 2)
    }
  }

  // --- MOBILE CONTROLS ---
  _createMobileControls() {
    const btnY = GAME_HEIGHT - 44

    this.btnLeft = this.add.text(50, btnY, 'LEFT', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#0044aa',
      padding: { x: 14, y: 10 },
      fontFamily: 'Impact, Arial Black, sans-serif',
    }).setOrigin(0.5).setDepth(40).setAlpha(0.75).setInteractive()

    this.btnRight = this.add.text(GAME_WIDTH - 50, btnY, 'RIGHT', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#0044aa',
      padding: { x: 14, y: 10 },
      fontFamily: 'Impact, Arial Black, sans-serif',
    }).setOrigin(0.5).setDepth(40).setAlpha(0.75).setInteractive()

    this.btnLeftDown = false
    this.btnRightDown = false

    this.btnLeft.on('pointerdown', () => { this.btnLeftDown = true })
    this.btnLeft.on('pointerup',   () => { this.btnLeftDown = false })
    this.btnLeft.on('pointerout',  () => { this.btnLeftDown = false })
    this.btnRight.on('pointerdown', () => { this.btnRightDown = true })
    this.btnRight.on('pointerup',   () => { this.btnRightDown = false })
    this.btnRight.on('pointerout',  () => { this.btnRightDown = false })
  }

  // --- SPAWN TIMERS ---
  _startSpawnTimers() {
    if (this.isBossLevel) {
      this._startBossTimers()
      return
    }

    const graceMs = this.levelDef.graceperiod || 3000

    this.time.delayedCall(graceMs, () => {
      this.hazardTimer = this.time.addEvent({
        delay: this.levelDef.hazardInterval,
        callback: this._spawnNextHazard,
        callbackScope: this,
        loop: true,
      })
    })

    this.time.addEvent({
      delay: this.levelDef.bubbleInterval,
      callback: () => this._spawnCollectible('bubble'),
      callbackScope: this,
      loop: true,
    })

    this.time.addEvent({
      delay: this.levelDef.coinInterval,
      callback: () => this._spawnCollectible('coin'),
      callbackScope: this,
      loop: true,
    })

    this.time.delayedCall(800,  () => this._spawnCollectible('bubble'))
    if ((this.levelDef.order || 1) <= 4) {
      this.time.delayedCall(1600, () => this._spawnCollectible('bubble'))
    }

    this.time.delayedCall(1200, () => this._spawnEarlyFloatingObstacle())
    if ((this.levelDef.order || 1) >= 3) {
      this.time.delayedCall(2400, () => this._spawnEarlyFloatingObstacle())
    }
    if (this.levelDef.surfaceObstacleInterval) {
      this.time.addEvent({
        delay: this.levelDef.surfaceObstacleInterval,
        callback: this._spawnSurfaceObstacle,
        callbackScope: this,
        loop: true,
      })
      this.time.delayedCall(Math.max(900, Math.floor(this.levelDef.surfaceObstacleInterval * 0.45)), () => this._spawnSurfaceObstacle())
    }
  }

  _startBossTimers() {
    this.time.delayedCall(700, () => this._spawnCollectible('bubble'))
    this.time.delayedCall(1700, () => this._spawnCollectible('power_bubble'))

    this.time.addEvent({
      delay: this.levelDef.bubbleInterval || 5200,
      callback: () => this._spawnCollectible('bubble'),
      callbackScope: this,
      loop: true,
    })

    this.time.addEvent({
      delay: this.levelDef.powerBubbleInterval || 4300,
      callback: () => this._spawnCollectible('power_bubble'),
      callbackScope: this,
      loop: true,
    })

    this.hazardTimer = this.time.addEvent({
      delay: this.levelDef.hazardInterval || 2600,
      callback: this._bossAttack,
      callbackScope: this,
      loop: true,
    })

    this.time.addEvent({
      delay: this.levelDef.surfaceObstacleInterval || 3600,
      callback: this._spawnSurfaceObstacle,
      callbackScope: this,
      loop: true,
    })
  }

  _spawnEarlyFloatingObstacle() {
    if (this.isGameOver || this.isWon || this.isBossLevel) return
    const order = this.levelDef.order || 1
    const types = order <= 1
      ? ['floating_leaf', 'beach_ball']
      : order <= 2
        ? ['floating_leaf', 'beach_ball', 'kickboard']
        : ['floating_leaf', 'beach_ball', 'kickboard', 'floating_ring']
    this._spawnHazard(Phaser.Utils.Array.GetRandom(types), {
      y: Phaser.Math.Between(WATER_TOP + 35, WATER_TOP + 135),
    })
  }

  _spawnSurfaceObstacle() {
    if (this.isGameOver || this.isWon) return
    const order = this.levelDef.order || 1
    const types = order <= 2
      ? ['floating_leaf', 'beach_ball']
      : order <= 4
        ? ['floating_leaf', 'beach_ball', 'kickboard']
        : ['floating_leaf', 'beach_ball', 'kickboard', 'floating_ring']
    const type = types[this._surfacePressureIdx % types.length]
    this._surfacePressureIdx += 1
    this._spawnHazard(type, {
      y: Phaser.Math.Between(WATER_TOP + 28, WATER_TOP + (order >= 6 ? 150 : 120)),
      surface: true,
    })
  }

  _createBoss() {
    this.bossHealth = this.bossMaxHealth
    this.bossPhase = 1

    this.bossObj = this.add.container(GAME_WIDTH - 100, WATER_TOP + 190).setDepth(14)
    const body = this.add.graphics()
    body.fillStyle(0xffaa22, 1)
    body.fillRoundedRect(-54, -34, 108, 68, 12)
    body.lineStyle(4, 0x552200, 1)
    body.strokeRoundedRect(-54, -34, 108, 68, 12)
    body.fillStyle(0x00ddff, 0.9)
    body.fillCircle(-24, -8, 15)
    body.fillCircle(22, -8, 15)
    body.fillStyle(0x001a33, 0.9)
    body.fillCircle(-24, -8, 7)
    body.fillCircle(22, -8, 7)
    body.fillStyle(0x222222, 1)
    body.fillCircle(-35, 34, 13)
    body.fillCircle(35, 34, 13)
    body.fillStyle(0x8844ff, 0.85)
    body.fillRoundedRect(-16, 24, 32, 18, 8)
    body.lineStyle(7, 0x8844ff, 0.8)
    body.beginPath()
    body.moveTo(45, -12)
    body.lineTo(76, -34)
    body.lineTo(92, -18)
    body.strokePath()
    body.lineStyle(4, 0x33ddff, 0.75)
    body.lineBetween(-42, 8, 42, 8)
    this.bossObj.add(body)

    const label = this.add.text(0, -54, 'SUCK-O-MATIC 3000', {
      fontSize: '12px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00',
      stroke: '#331100',
      strokeThickness: 3,
    }).setOrigin(0.5)
    this.bossObj.add(label)

    this.bossHealthBg = this.add.graphics().setDepth(31)
    this.bossHealthFill = this.add.graphics().setDepth(32)
    this.bossHealthLabel = this.add.text(GAME_WIDTH / 2, 78, 'Suck-O-Matic 3000', {
      fontSize: '10px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00',
      stroke: '#331100',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(33)
    this._updateBossUI()

    this.bossObj.setData('homeX', GAME_WIDTH - 100)
    this.bossObj.setData('homeY', WATER_TOP + 190)
  }

  _updateBossUI() {
    if (!this.isBossLevel || !this.bossHealthBg || !this.bossHealthFill) return
    const pct = Phaser.Math.Clamp(this.bossHealth / this.bossMaxHealth, 0, 1)
    this.bossHealthBg.clear()
    this.bossHealthBg.fillStyle(0x000000, 0.55)
    this.bossHealthBg.fillRoundedRect(GAME_WIDTH / 2 - 96, 88, 192, 12, 4)
    this.bossHealthBg.lineStyle(2, 0xffcc33, 0.9)
    this.bossHealthBg.strokeRoundedRect(GAME_WIDTH / 2 - 96, 88, 192, 12, 4)

    this.bossHealthFill.clear()
    this.bossHealthFill.fillStyle(pct > 0.55 ? 0xffcc33 : pct > 0.25 ? 0xff7733 : 0xff3333)
    this.bossHealthFill.fillRoundedRect(GAME_WIDTH / 2 - 94, 90, 188 * pct, 8, 3)
  }

  _getActivePowerBubble() {
    if (!this.collectibles) return null
    const guarded = this.bossGuardTarget
    if (guarded && guarded.active && guarded.collectibleType === 'power_bubble') return guarded
    return this.collectibles.getChildren().find(c => c && c.active && c.collectibleType === 'power_bubble') || null
  }

  _getBossGuardPosition(bubble) {
    const gx = this.gerald ? this.gerald.x : 80
    const gy = this.gerald ? this.gerald.y : POOL_BOTTOM - 90
    const t = this.bossPhase === 3 ? 0.42 : 0.34
    return {
      x: Phaser.Math.Clamp(bubble.x + (gx - bubble.x) * t + 30, GAME_WIDTH * 0.35, GAME_WIDTH - 78),
      y: Phaser.Math.Clamp(bubble.y + (gy - bubble.y) * t, WATER_TOP + 90, POOL_BOTTOM - 105),
    }
  }

  _bossAttack() {
    if (!this.isBossLevel || this.isGameOver || this.isWon) return
    const phase = this.bossPhase
    const guardedBubble = this._getActivePowerBubble()
    if (guardedBubble && this.time.now < this.bossGuardUntil) {
      const guardChoices = phase >= 3
        ? ['vacuum_suction', 'splash_zone', 'cannonball_wave', 'floating_ring']
        : ['splash_zone', 'cannonball_wave', 'kickboard']
      const guardType = Phaser.Utils.Array.GetRandom(guardChoices)
      const x = Phaser.Math.Clamp(guardedBubble.x + Phaser.Math.Between(-40, 55), 80, GAME_WIDTH - 85)
      const y = Phaser.Math.Clamp(guardedBubble.y + Phaser.Math.Between(-45, 45), WATER_TOP + 65, POOL_BOTTOM - 95)
      this._spawnHazard(guardType, { x, y })
      this.cameras.main.shake(130, 0.0045)
      return
    }

    const choices = phase === 1
      ? ['cannonball_wave', 'splash_zone', 'kickboard']
      : phase === 2
        ? ['vacuum_suction', 'cannonball_wave', 'splash_zone', 'floating_ring']
        : ['vacuum_suction', 'cannonball_wave', 'splash_zone', 'splash_cluster', 'beach_ball']
    const type = Phaser.Utils.Array.GetRandom(choices)
    if (type === 'splash_cluster') {
      this._spawnHazard('splash_zone')
      this.time.delayedCall(500, () => this._spawnHazard('splash_zone'))
    } else {
      this._spawnHazard(type)
    }
    this.cameras.main.shake(120, 0.004)
  }

  _updateBoss(time, delta) {
    if (!this.isBossLevel || !this.bossObj) return { x: 0, y: 0 }

    if (this.bossHealth <= this.bossMaxHealth * 0.35) this.bossPhase = 3
    else if (this.bossHealth <= this.bossMaxHealth * 0.68) this.bossPhase = 2
    else this.bossPhase = 1

    const dt = Math.min(delta / 1000, 0.05)
    const guardedBubble = this._getActivePowerBubble()
    const guardingBubble = !!guardedBubble && this.time.now < this.bossGuardUntil
    const chaseSpeed = (this.bossPhase === 3 ? 82 : this.bossPhase === 2 ? 62 : 42) + (guardingBubble ? 24 : 0)
    const desired = guardingBubble
      ? this._getBossGuardPosition(guardedBubble)
      : {
          x: Phaser.Math.Clamp(this.gerald.x + 150, GAME_WIDTH * 0.48, GAME_WIDTH - 78),
          y: Phaser.Math.Clamp(this.gerald.y - 10, WATER_TOP + 95, POOL_BOTTOM - 110),
        }
    const desiredX = desired.x
    const desiredY = desired.y
    const dx = desiredX - this.bossObj.x
    const dy = desiredY - this.bossObj.y
    const distToTarget = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    const step = Math.min(chaseSpeed * dt, distToTarget)
    this.bossObj.x += (dx / distToTarget) * step
    this.bossObj.y += (dy / distToTarget) * step + Math.sin(time / 360) * 0.28

    const dist = Phaser.Math.Distance.Between(this.gerald.x, this.gerald.y, this.bossObj.x, this.bossObj.y)
    const radius = this.bossPhase === 3 ? 180 : this.bossPhase === 2 ? 150 : guardingBubble ? 115 : 90
    if (dist >= radius || dist <= 4) return { x: 0, y: 0 }

    const angle = Phaser.Math.Angle.Between(this.gerald.x, this.gerald.y, this.bossObj.x, this.bossObj.y)
    const proximity = 1 - dist / radius
    const strength = (this.bossPhase === 3 ? 275 : this.bossPhase === 2 ? 200 : guardingBubble ? 120 : 80) * (0.7 + proximity)
    const dmg = (this.bossPhase === 3 ? 4.3 : this.bossPhase === 2 ? 2.6 : guardingBubble ? 1.2 : 0.8) * (delta / 1000) * this.gerald.hazardDamageMultiplier
    this.drownMeter = Math.min(100, this.drownMeter + dmg)
    return {
      x: Math.cos(angle) * strength,
      y: Math.sin(angle) * strength,
    }
  }

  _damageBoss(amount) {
    if (!this.isBossLevel || this.isWon) return
    this.bossHealth = Math.max(0, this.bossHealth - amount)
    this._updateBossUI()
    this._showFloatingText(this.bossObj.x, this.bossObj.y - 70, `-${amount} BOSS`, '#ffee00')
    this.cameras.main.shake(160, 0.006)
    if (this.bossHealth <= 0) {
      this.bossDefeated = true
      this._win()
    }
  }

  _spawnNextHazard() {
    if (this.isGameOver || this.isWon) return
    this._enforceHazardCap('beforeSpawnNext')
    let type
    if (this.levelDef.hazardSequence && this.levelDef.hazardSequence.length > 0) {
      type = this.levelDef.hazardSequence[this._hazardSequenceIdx % this.levelDef.hazardSequence.length]
      this._hazardSequenceIdx++
    } else {
      const types = this.levelDef.hazardTypes || ['cannonball_wave']
      type = types[Math.floor(Math.random() * types.length)]
    }

    debugLog('LevelScene.spawnNextHazard', getSceneDebugSnapshot(this, { type }))

    // Splash cluster: spawn 2-3 splash zones with slight stagger
    if (type === 'splash_cluster') {
      const count = Phaser.Math.Between(2, 3)
      for (let i = 0; i < count; i++) {
        this.time.delayedCall(i * 650, () => {
          if (!this.isGameOver && !this.isWon) this._spawnHazard('splash_zone')
        })
      }
      return
    }

    this._spawnHazard(type)
  }

  _spawnHazard(type, spawnOpts = {}) {
    if (this.isGameOver || this.isWon) return
    const def = HAZARD_TYPES[type]
    if (!def) {
      debugLog('LevelScene.unknownHazardType', { levelId: this.levelId, type })
      return
    }

    let x, y
    const opts = {}

    if (type === 'floating_leaf') {
      x = spawnOpts.x ?? GAME_WIDTH + 50
      y = spawnOpts.y ?? Phaser.Math.Between(WATER_TOP + 15, WATER_TOP + 100)
    } else if (type === 'kickboard' || type === 'floating_ring') {
      x = spawnOpts.x ?? GAME_WIDTH + 50
      y = spawnOpts.y ?? Phaser.Math.Between(WATER_TOP + 45, POOL_BOTTOM - 100)
    } else if (type === 'splash_zone') {
      x = spawnOpts.x ?? Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.45), GAME_WIDTH - 130)
      y = spawnOpts.y ?? Phaser.Math.Between(WATER_TOP + 80, POOL_BOTTOM - 130)
      opts.splashScale = this.levelDef.splashScale || 1.0
    } else if (type === 'pool_jet') {
      const targetX = this.gerald ? this.gerald.x + Phaser.Math.Between(55, 145) : Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.45), GAME_WIDTH - 90)
      x = spawnOpts.x ?? Phaser.Math.Clamp(targetX, Math.floor(GAME_WIDTH * 0.28), GAME_WIDTH - 85)
      const targetY = this.gerald ? this.gerald.y + Phaser.Math.Between(-70, 70) : Phaser.Math.Between(WATER_TOP + 100, POOL_BOTTOM - 150)
      y = spawnOpts.y ?? Phaser.Math.Clamp(targetY, WATER_TOP + 100, POOL_BOTTOM - 120)
      const jetDirs = this.levelId === 'pool_jet_panic'
        ? ['down', 'down_left', 'down_right', 'right', 'left']
        : ['down', 'down_right', 'right', 'left']
      opts.jetDir = spawnOpts.jetDir || jetDirs[Math.floor(Math.random() * jetDirs.length)]
      opts.jetStrength = this.levelDef.jetStrength || (340 * (this.levelDef.waveStrength || 1.0))
    } else if (type === 'vacuum_suction') {
      const targetX = this.gerald ? this.gerald.x + Phaser.Math.Between(70, 170) : Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.3), GAME_WIDTH - 120)
      const targetY = this.gerald ? this.gerald.y + Phaser.Math.Between(-80, 80) : Phaser.Math.Between(WATER_TOP + 120, POOL_BOTTOM - 150)
      x = spawnOpts.x ?? Phaser.Math.Clamp(targetX, Math.floor(GAME_WIDTH * 0.35), GAME_WIDTH - 95)
      y = spawnOpts.y ?? Phaser.Math.Clamp(targetY, WATER_TOP + 120, POOL_BOTTOM - 100)
      opts.vacuumStrength = this.levelDef.vacuumStrength || 1.0
    } else {
      x = spawnOpts.x ?? GAME_WIDTH + 50
      y = spawnOpts.y ?? Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 80)
    }

    const hazard = new Hazard(this, x, y, type, opts)
    this.hazardList.push(hazard)

    const physObj = this._getHazardPhysicsBody(hazard)
    if (!physObj) {
      debugLog('LevelScene.hazardMissingBody', getSceneDebugSnapshot(this, { type }))
      hazard.destroy()
      this.hazardList = this.hazardList.filter(h => h !== hazard)
      return
    }
    this.hazardPhysicsGroup.add(physObj)
    physObj._hazardRef = hazard

    if (type === 'splash_zone') {
      this.splashZones.push(hazard)
    } else if (type === 'pool_jet') {
      this.jetZones.push(hazard)
    } else if (type === 'vacuum_suction') {
      this.vacuumZones.push(hazard)
    }

    debugLog('LevelScene.spawnHazard', getSceneDebugSnapshot(this, { type, x, y }))
    this._enforceHazardCap('afterSpawn')
  }

  _spawnCollectible(type) {
    if (this.isGameOver || this.isWon) return
    if (type === 'power_bubble' && this._getActivePowerBubble()) return
    const y = this._getCollectibleSpawnY(type)
    const x = this._getCollectibleSpawnX(type)
    const item = new Collectible(this, x, y, type)
    this.collectibles.add(item)
    if (type === 'power_bubble') this._guardPowerBubble(item)
  }

  _getCollectibleSpawnX(type) {
    if (type !== 'power_bubble') return Phaser.Math.Between(GAME_WIDTH - 60, GAME_WIDTH - 20)
    if (!this.isBossLevel || !this.bossObj) return Phaser.Math.Between(75, GAME_WIDTH - 145)
    const phase = this.bossPhase || 1
    const nearBoss = Phaser.Math.Clamp(this.bossObj.x - Phaser.Math.Between(45, phase === 3 ? 95 : 130), 82, GAME_WIDTH - 115)
    return phase >= 2 ? nearBoss : Phaser.Math.Between(90, GAME_WIDTH - 135)
  }

  _getCollectibleSpawnY(type) {
    if (type === 'power_bubble') {
      if (this.isBossLevel && this.bossObj) {
        const phase = this.bossPhase || 1
        return Phaser.Math.Clamp(this.bossObj.y + Phaser.Math.Between(phase === 3 ? -85 : -65, phase === 3 ? 55 : 75), WATER_TOP + 90, POOL_BOTTOM - 150)
      }
      return Phaser.Math.Between(WATER_TOP + 90, POOL_BOTTOM - 150)
    }
    if (type !== 'bubble') return Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 80)
    if (this.levelId === 'splash_zone') return Phaser.Math.Between(WATER_TOP + 120, POOL_BOTTOM - 115)
    if (this.levelId === 'pool_jet_panic') return Phaser.Math.Between(WATER_TOP + 115, POOL_BOTTOM - 95)
    if (this.levelId === 'vacuum_trouble') return Phaser.Math.Between(WATER_TOP + 150, POOL_BOTTOM - 80)
    return Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 80)
  }

  _guardPowerBubble(item) {
    if (!this.isBossLevel || !item || !item.active) return
    this.bossGuardTarget = item
    this.bossGuardUntil = this.time.now + (this.bossPhase === 3 ? 6200 : 4800)
    debugLog('LevelScene.bossGuardPowerBubble', getSceneDebugSnapshot(this, {
      bubble: { x: Math.round(item.x), y: Math.round(item.y) },
    }))

    const guardX = Phaser.Math.Clamp(item.x + Phaser.Math.Between(-25, 35), 95, GAME_WIDTH - 90)
    const guardY = Phaser.Math.Clamp(item.y + Phaser.Math.Between(-20, 35), WATER_TOP + 95, POOL_BOTTOM - 115)
    this.time.delayedCall(450, () => {
      if (!this.isGameOver && !this.isWon && item.active) this._spawnHazard('splash_zone', { x: guardX, y: guardY })
    })
    this.time.delayedCall(1050, () => {
      if (!this.isGameOver && !this.isWon && item.active) this._spawnHazard('vacuum_suction', {
        x: Phaser.Math.Clamp(item.x + 42, 130, GAME_WIDTH - 90),
        y: Phaser.Math.Clamp(item.y, WATER_TOP + 120, POOL_BOTTOM - 105),
      })
    })
  }

  // --- COLLISION HANDLERS ---
  _onCollect(gerald, item) {
    const def = item.definition
    if (item.collectibleType === 'power_bubble') {
      this._damageBoss(20)
      this._showFloatingText(item.x, item.y - 24, 'POWER BUBBLE!', '#ffee00')
    }
    if (def.drownReduction) {
      const recovery = (item.collectibleType === 'bubble')
        ? (this.levelDef.bubbleRecovery || def.drownReduction || 10)
        : def.drownReduction
      this.drownMeter = Math.max(0, this.drownMeter - recovery)
    }
    if (def.scoreBonus) {
      this._addScore(def.scoreBonus)
      this._showFloatingText(item.x, item.y - 20, `+${def.scoreBonus}`, '#ffffff')
    }
    if (def.geraldPoints) {
      this.geraldPoints += def.geraldPoints
      this.registry.set('geraldPoints', this.geraldPoints)
      // Plain text — no emoji
      this._showFloatingText(item.x, item.y - 20, `+${def.geraldPoints} GP`, '#ffdd00')
    }
    item.destroy()
  }

  _onPhysicsHazardHit(gerald, physObj) {
    const hazard = physObj._hazardRef
    if (!hazard || hazard.dodged || hazard.hitGerald) return
    hazard.hitGerald = true
    debugLog('LevelScene.hazardHit', getSceneDebugSnapshot(this, { hazardType: hazard.hazardType }))

    const damage = hazard.definition.drownIncrease * this.gerald.hazardDamageMultiplier
    if (damage > 0) {
      this.drownMeter = Math.min(100, this.drownMeter + damage)
    }

    if (hazard.definition.slowsGerald) {
      // Leaf: tangle Gerald — slow movement and nudge down
      const origSpeed = this.gerald.moveSpeed
      const slowMult = hazard.hazardType === 'floating_ring' ? 0.45 : 0.35
      this.gerald.moveSpeed = origSpeed * slowMult
      this.gerald.setVelocityY(Math.min(this.gerald.body.velocity.y + 85, this.gerald.maxDownVelocity + 30))
      this.time.delayedCall(1500, () => { if (this.gerald && this.gerald.active) this.gerald.moveSpeed = origSpeed })
      this._showFloatingText(gerald.x, gerald.y - 30, hazard.hazardType === 'floating_ring' ? 'RING SNAG!' : 'TANGLED!', '#33aa33')
    } else if (hazard.definition.nudgesGerald) {
      const dir = (gerald.x <= hazard.x) ? -1 : 1
      this.gerald.setVelocityX(dir * 170)
      this.gerald.setVelocityY(Math.min(this.gerald.body.velocity.y + 95, this.gerald.maxDownVelocity + 35))
      this._showFloatingText(gerald.x, gerald.y - 30, 'BUMP!', '#ff8844')
    } else if (hazard.definition.bouncesGerald) {
      // Ball: bounce Gerald upward and sideways
      const ballDir = (gerald.x <= hazard.x) ? -1 : 1
      this.gerald.setVelocityY(-200)
      this.gerald.setVelocityX(ballDir * 200)
      if (damage > 0) this.drownMeter = Math.min(100, this.drownMeter + damage)
      this._showFloatingText(gerald.x, gerald.y - 30, 'BALL BOUNCE!', '#ff6600')
    } else if (hazard.hazardType === 'cannonball_wave') {
      // Wave: sustained downward push + camera shake, scaled by level waveStrength
      const waveStr = this.levelDef.waveStrength || 1.0
      const pushDir = (this.gerald.x > hazard.x) ? 1 : -1
      this.gerald._waveHitMs = 1500
      this.gerald.setVelocityX(pushDir * 260 * waveStr)
      this.gerald.setVelocityY(this.gerald.maxDownVelocity + 80 * waveStr)
      this._showFloatingText(gerald.x, gerald.y - 30, 'WAVE HIT!', '#4499ff')
      this.cameras.main.shake(200, Math.min(0.006 * waveStr, 0.018))
    } else if (hazard.hazardType === 'pool_jet') {
      // First-contact flash only — ongoing push is handled in update loop
      this._showFloatingText(gerald.x, gerald.y - 30, 'JET PUSH!', '#00AAFF')
    } else if (hazard.hazardType === 'vacuum_suction') {
      // First-contact flash only — ongoing pull is handled in update loop
      this._showFloatingText(gerald.x, gerald.y - 30, 'SUCTION!', '#9966FF')
    }

    this.tweens.add({
      targets: gerald, alpha: 0.3,
      duration: 80, yoyo: true, repeat: 3,
      onComplete: () => { if (gerald.active) gerald.setAlpha(1) },
    })

    // Zone-based hazards persist — don't destroy on first overlap
    const zoneTypes = ['splash_zone', 'pool_jet', 'vacuum_suction']
    if (!zoneTypes.includes(hazard.hazardType)) {
      hazard.destroy()
      this.hazardList = this.hazardList.filter(h => h !== hazard)
    }
  }

  // --- SCORING ---
  _addScore(pts) {
    this.score += pts
    this.registry.set('score', this.score)
  }

  _addSurviveScore() {
    if (!this.isGameOver && !this.isWon) this._addScore(1)
  }

  _showFloatingText(x, y, msg, color) {
    const txt = this.add.text(x, y, msg, {
      fontSize: '16px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 900, onComplete: () => txt.destroy() })
  }

  _getHazardPhysicsBody(hazard) {
    if (!hazard) return null
    if (typeof hazard.getPhysicsBody === 'function') return hazard.getPhysicsBody()
    return hazard._body || null
  }

  _getHazardBounds(hazard) {
    if (!hazard || !hazard.active) return null
    if (typeof hazard.getBounds === 'function') return hazard.getBounds()
    const bodyObj = this._getHazardPhysicsBody(hazard)
    return bodyObj && typeof bodyObj.getBounds === 'function' ? bodyObj.getBounds() : null
  }

  _enforceHazardCap(reason) {
    const activeHazards = this.hazardList.filter(h => h && h.active)
    if (activeHazards.length <= MAX_ACTIVE_HAZARDS) return

    debugLog('LevelScene.hazardCapExceeded', getSceneDebugSnapshot(this, {
      reason,
      max: MAX_ACTIVE_HAZARDS,
    }))

    const overflow = activeHazards.length - MAX_ACTIVE_HAZARDS
    activeHazards.slice(0, overflow).forEach(h => {
      try { h.destroy() } catch {}
    })
    this.hazardList = this.hazardList.filter(h => h && h.active)
  }

  _cleanupLevelScene(reason) {
    debugLog('LevelScene.cleanup', getSceneDebugSnapshot(this, { reason }))
    if (this.hazardTimer) {
      this.hazardTimer.remove(false)
      this.hazardTimer = null
    }
    this.hazardList.forEach(h => {
      try { if (h && h.active) h.destroy() } catch {}
    })
    this.hazardList = []
    this.splashZones = []
    this.jetZones = []
    this.vacuumZones = []
    if (this.forceDebugGfx) {
      try { this.forceDebugGfx.destroy() } catch {}
      this.forceDebugGfx = null
    }
    if (this.forceDebugText) {
      try { this.forceDebugText.destroy() } catch {}
      this.forceDebugText = null
    }
    ;[this.bossObj, this.bossHealthBg, this.bossHealthFill, this.bossHealthLabel].forEach(obj => {
      try { if (obj) obj.destroy() } catch {}
    })
    this.bossObj = null
    this.bossHealthBg = null
    this.bossHealthFill = null
    this.bossHealthLabel = null
  }

  _getJetVector(dir) {
    if (dir === 'right') return { x: 1, y: 0.18 }
    if (dir === 'left') return { x: -1, y: 0.18 }
    if (dir === 'down_left') return { x: -0.62, y: 0.95 }
    if (dir === 'down_right') return { x: 0.62, y: 0.95 }
    return { x: 0, y: 1 }
  }

  _getSurfaceFatigueStep() {
    const order = this.levelDef.order || 1
    if (order <= 1) return 0.025
    if (order <= 2) return 0.04
    if (order <= 3) return 0.06
    if (order <= 4) return 0.075
    if (order <= 6) return 0.095
    return 0.12
  }

  _getSurfaceRecoveryMultiplier() {
    const step = this._getSurfaceFatigueStep()
    return Phaser.Math.Clamp(1 - this.surfaceBreathCount * step, 0.38, 1)
  }

  _getSurfaceSwimMultiplier() {
    const step = this._getSurfaceFatigueStep()
    return Phaser.Math.Clamp(1 - this.surfaceBreathCount * step * 0.45, 0.72, 1)
  }

  _trackSurfaceRecovery(recovered) {
    if (recovered <= 0) return
    this._surfaceVisitRecovery += recovered
    if (!this._surfaceVisitCounted && this._surfaceVisitRecovery >= 0.6) {
      this._surfaceVisitCounted = true
      this.surfaceBreathCount += 1
      if (this.surfaceBreathCount >= 3) {
        this._showFloatingText(this.gerald.x, SURFACE_ZONE_Y - 18, 'TIRED!', '#cceeff')
      }
    }
  }

  _resetSurfaceVisitIfNeeded(inSurfaceZone) {
    if (inSurfaceZone === this._wasInSurfaceZone) return
    this._wasInSurfaceZone = inSurfaceZone
    if (inSurfaceZone) {
      this._surfaceVisitRecovery = 0
      this._surfaceVisitCounted = false
    }
  }

  _getSurfaceTurbulenceForce(delta) {
    const order = this.levelDef.order || 1
    if (order < 5 || this._surfaceHoldMs < 950) return 0
    const secondsHeld = Math.min((this._surfaceHoldMs - 950) / 1000, 3)
    const base = order >= 8 ? 118 : order >= 7 ? 96 : order >= 6 ? 76 : 56
    const fatigueBoost = Math.min(this.surfaceBreathCount, 5) * (order >= 7 ? 9 : 6)
    const wave = Math.sin((this.time.now || 0) / 220) * 14
    const force = base + fatigueBoost + secondsHeld * 18 + wave
    if (order >= 7 && this._surfaceHoldMs > 1500) {
      const dmg = (0.45 + this.surfaceBreathCount * 0.08) * (delta / 1000)
      this.drownMeter = Math.min(100, this.drownMeter + dmg)
    }
    return force
  }

  _checkFinishLineCrossing() {
    if (this.isBossLevel || this.isWon || this.isGameOver || !this._finishBar || !this._finishBar.active) return false
    const gBounds = this.gerald.getBounds()
    const finishX = this._finishBar.x
    const geraldFront = gBounds.right
    const overlapsX = finishX <= geraldFront
    const overlapsY = gBounds.bottom >= WATER_TOP && gBounds.top <= POOL_BOTTOM
    if (overlapsX && overlapsY) {
      this.levelProgress = this.levelDef.levelLength
      this._win()
      return true
    }
    return false
  }

  _createForceDebugOverlay() {
    const forceDebugOn = DEBUG_GERALD && typeof window !== 'undefined' && window.location.search.includes('debugForce=1')
    if (!forceDebugOn) return
    this.forceDebugGfx = this.add.graphics().setDepth(27)
    this.forceDebugText = this.add.text(10, 76, '', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.45)',
      padding: { x: 4, y: 3 },
    }).setDepth(60)
  }

  _applyEnvironmentalForce(forceX, forceY, delta, sources) {
    if (!this.gerald || !this.gerald.body) return

    const dt = Math.min(delta / 1000, 0.05)
    const hasForceX = Math.abs(forceX) > 0.1
    const hasForceY = Math.abs(forceY) > 0.1

    if (hasForceX) {
      this._envVelocityX = Phaser.Math.Clamp(this._envVelocityX + forceX * dt, -300, 300)
    } else {
      this._envVelocityX *= Math.pow(0.08, dt)
      if (Math.abs(this._envVelocityX) < 2) this._envVelocityX = 0
    }

    if (hasForceY) {
      this._envVelocityY = Phaser.Math.Clamp(this._envVelocityY + forceY * dt, -155, 245)
    } else {
      this._envVelocityY *= Math.pow(0.10, dt)
      if (Math.abs(this._envVelocityY) < 2) this._envVelocityY = 0
    }

    const currentVX = this.gerald.body.velocity.x
    const currentVY = this.gerald.body.velocity.y
    const nextVX = Phaser.Math.Clamp(currentVX + this._envVelocityX, -430, 430)
    const nextVY = Phaser.Math.Clamp(currentVY + this._envVelocityY, -440, this.gerald.maxDownVelocity + 155)

    this.gerald.setVelocityX(nextVX)
    this.gerald.setVelocityY(nextVY)

    this._lastAppliedForce = {
      x: Math.round(forceX),
      y: Math.round(forceY),
      envVX: Math.round(this._envVelocityX),
      envVY: Math.round(this._envVelocityY),
      finalVX: Math.round(nextVX),
      finalVY: Math.round(nextVY),
      sources: sources || [],
    }
  }

  _updateForceDebugOverlay() {
    if (!DEBUG_GERALD || !this.forceDebugGfx || !this.forceDebugText || !this.gerald || !this.gerald.body) return

    const g = this.forceDebugGfx
    g.clear()

    this._forceDebugZones.forEach(zone => {
      g.lineStyle(zone.overlap ? 3 : 1, zone.overlap ? 0xffff33 : 0x00ccff, zone.overlap ? 0.9 : 0.55)
      g.strokeRect(zone.x, zone.y, zone.width, zone.height)
    })

    this._forceDebugCircles.forEach(circle => {
      g.lineStyle(circle.overlap ? 3 : 1, circle.overlap ? 0xffff33 : 0xbb66ff, circle.overlap ? 0.9 : 0.55)
      g.strokeCircle(circle.x, circle.y, circle.r)
      g.lineStyle(1, 0xdd99ff, 0.4)
      g.strokeCircle(circle.x, circle.y, circle.middleR)
      g.strokeCircle(circle.x, circle.y, circle.innerR)
    })

    const f = this._lastAppliedForce || { x: 0, y: 0, envVX: 0, envVY: 0, sources: [] }
    const sourceText = f.sources && f.sources.length ? f.sources.join('+') : 'none'
    this.forceDebugText.setText([
      `vel ${Math.round(this.gerald.body.velocity.x)},${Math.round(this.gerald.body.velocity.y)}`,
      `force ${f.x},${f.y}`,
      `env ${f.envVX},${f.envVY}`,
      `active ${sourceText}`,
    ])
  }

  // --- MAIN UPDATE LOOP ---
  update(time, delta) {
    if (this.isGameOver || this.isWon) return

    if (time - this._lastDebugAt >= 2000) {
      this._lastDebugAt = time
      debugLog('LevelScene.update', getSceneDebugSnapshot(this))
    }

    this.gerald.surfaceSwimMultiplier = this._getSurfaceSwimMultiplier()

    const leftHeld  = this.cursors.left.isDown  || this.wasd.left.isDown  || this.btnLeftDown
    const rightHeld = this.cursors.right.isDown || this.wasd.right.isDown || this.btnRightDown
    const bobPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                       Phaser.Input.Keyboard.JustDown(this.wasd.bob)

    if (leftHeld)       this.gerald.moveLeft()
    else if (rightHeld) this.gerald.moveRight()
    else                this.gerald.stopHorizontal()

    if (bobPressed) this.gerald.bob()

    this.gerald.update(delta)

    // Push Gerald back into pool if he floated above water surface
    if (this.gerald.y < WATER_TOP) {
      const pushVel = (WATER_TOP - this.gerald.y) * 3
      this.gerald.setVelocityY(Math.max(this.gerald.body.velocity.y, pushVel))
    }

    const scrollSpeed = this.isBossLevel ? 0 : (this.levelDef.worldScrollSpeed || 80) * (delta / 1000)
    if (!this.isBossLevel) {
      this.levelProgress += scrollSpeed
      this.levelProgress = Math.min(this.levelProgress, this.levelDef.levelLength + 1)
    }

    // Checkpoints — plain text
    if (!this.isBossLevel && this.levelDef.checkpoints) {
      this.levelDef.checkpoints.forEach(cp => {
        if (!this.checkpointsPassed.has(cp) && this.levelProgress >= cp) {
          this.checkpointsPassed.add(cp)
          this._addScore(5)
          this._showFloatingText(GAME_WIDTH / 2, WATER_TOP + 50, 'CHECKPOINT! +5', '#00ff88')
        }
      })
    }

    // Finish line appears near end
    if (!this.isBossLevel && !this.finishLineSpawned && this.levelProgress >= this.levelDef.levelLength * 0.78) {
      this.finishLineSpawned = true
      this._spawnFinishLine()
    }

    // Win condition
    if (!this.isBossLevel && this.levelProgress >= this.levelDef.levelLength && !this.finishLineSpawned) {
      this._win()
      return
    }

    if (this.finishLineObj && this.finishLineObj.active) {
      this.finishLineObj.x -= scrollSpeed
    }
    if (this._finishBar && this._finishBar.active) {
      this._finishBar.x -= scrollSpeed
    }
    if (this._checkFinishLineCrossing()) return

    // Zone-based drown meter
    const geraldY = this.gerald.y
    const baseDrownRate = this.levelDef.drownFillRate * this.gerald.drownFillRateMultiplier
    const inSurfaceZone = geraldY <= SURFACE_ZONE_Y
    this._resetSurfaceVisitIfNeeded(inSurfaceZone)
    this._surfaceHoldMs = inSurfaceZone ? this._surfaceHoldMs + delta : 0

    if (inSurfaceZone) {
      // Surface zone: rapid DROWN recovery
      const recoveryRate = (this.levelDef.surfaceRecoveryRate || 20) * this._getSurfaceRecoveryMultiplier()
      const before = this.drownMeter
      this.drownMeter = Math.max(0, this.drownMeter - recoveryRate * (delta / 1000))
      this._trackSurfaceRecovery(before - this.drownMeter)
    } else if (geraldY >= DANGER_ZONE_Y) {
      // Deep danger zone: DROWN fills fast
      this.drownMeter = Math.min(100, this.drownMeter + baseDrownRate * 2.5 * (delta / 1000))
    } else {
      // Mid-water: DROWN fills slowly
      this.drownMeter = Math.min(100, this.drownMeter + baseDrownRate * 0.5 * (delta / 1000))
    }

    let environmentalForceX = 0
    let environmentalForceY = this._getSurfaceTurbulenceForce(delta)
    const environmentalSources = []
    if (environmentalForceY > 0) environmentalSources.push('surface')
    this._forceDebugZones = []
    this._forceDebugCircles = []

    // Splash zone continuous damage — only during the active phase
    this.splashZones = this.splashZones.filter(zone => {
      if (!zone.active) return false
      if (zone._splashPhase === 'active') {
        const zBounds = this._getHazardBounds(zone)
        const gBounds = this.gerald.getBounds()
        if (zBounds && Phaser.Geom.Rectangle.Overlaps(zBounds, gBounds)) {
          const splashDmg = zone.definition.drownRate * (delta / 1000) * this.gerald.hazardDamageMultiplier
          this.drownMeter = Math.min(100, this.drownMeter + splashDmg)
        }
      }
      return true
    })

    // Pool jet continuous push — only during active phase
    this.jetZones = this.jetZones.filter(zone => {
      if (!zone.active) return false
      if (zone._jetPhase === 'active') {
        const zBounds = this._getHazardBounds(zone)
        const gBounds = this.gerald.getBounds()
        const overlaps = zBounds && Phaser.Geom.Rectangle.Overlaps(zBounds, gBounds)
        if (zBounds) {
          this._forceDebugZones.push({
            x: zBounds.x,
            y: zBounds.y,
            width: zBounds.width,
            height: zBounds.height,
            overlap: !!overlaps,
          })
        }
        if (overlaps) {
          const resist = this.gerald.jetResistMultiplier || 1.0
          const str = zone._jetStrength * resist
          const dir = zone._jetDir || 'down'
          const vec = this._getJetVector(dir)
          environmentalForceX += vec.x * str
          environmentalForceY += vec.y * str
          if (!environmentalSources.includes('jet')) environmentalSources.push('jet')
          const dmgRate = this.levelDef.jetDrownRate || zone.definition.drownRate
          const dmg = dmgRate * (delta / 1000) * this.gerald.hazardDamageMultiplier
          this.drownMeter = Math.min(100, this.drownMeter + dmg)
          // Debounced floating text
          if (!zone._txtShown) {
            zone._txtShown = true
            debugLog('LevelScene.jetForce', getSceneDebugSnapshot(this, {
              dir,
              strength: Math.round(str),
              resist,
            }))
            this._showFloatingText(this.gerald.x, this.gerald.y - 30, 'JET PUSH!', '#00AAFF')
            this.time.delayedCall(1800, () => { if (zone.active) zone._txtShown = false })
          }
        }
      }
      return true
    })

    // Vacuum suction continuous pull — only during active phase
    this.vacuumZones = this.vacuumZones.filter(zone => {
      if (!zone.active) return false
      if (zone._vacPhase === 'active') {
        const dist = Phaser.Math.Distance.Between(this.gerald.x, this.gerald.y, zone.x, zone.y)
        const outerR = zone.definition.outerRadius || 80
        const middleR = zone.definition.middleRadius || 55
        const innerR = zone.definition.innerRadius || 38
        this._forceDebugCircles.push({
          x: zone.x,
          y: zone.y,
          r: outerR,
          middleR,
          innerR,
          overlap: dist < outerR,
        })
        if (dist < outerR && dist > 2) {
          const angle = Phaser.Math.Angle.Between(this.gerald.x, this.gerald.y, zone.x, zone.y)
          const escape = this.gerald.vacuumEscapeMultiplier || 1.0
          const isInner = dist < innerR
          const isMiddle = dist < middleR
          const proximity = 1 - Math.min(dist / outerR, 1)
          const tierPull = isInner ? 470 : isMiddle ? 300 : 125
          const pullStr = tierPull * (zone._vacStrength || 1.0) * (0.78 + proximity * 0.6) * escape
          const drownRate = isInner
            ? (zone.definition.drownRateInner || 12)
            : isMiddle
              ? (zone.definition.drownRateMiddle || 3.5)
              : (zone.definition.drownRateOuter || 0.5)
          environmentalForceX += Math.cos(angle) * pullStr
          environmentalForceY += Math.sin(angle) * pullStr
          if (!environmentalSources.includes('vacuum')) environmentalSources.push('vacuum')
          const dmgResist = Math.max(escape, 0.55)
          const dmg = drownRate * (delta / 1000) * this.gerald.hazardDamageMultiplier * dmgResist
          this.drownMeter = Math.min(100, this.drownMeter + dmg)
          if (!zone._txtShown) {
            zone._txtShown = true
            debugLog('LevelScene.vacuumPull', getSceneDebugSnapshot(this, {
              tier: isInner ? 'inner' : isMiddle ? 'middle' : 'outer',
              strength: Math.round(pullStr),
              escape,
            }))
            this._showFloatingText(this.gerald.x, this.gerald.y - 30, isInner ? 'CAUGHT!' : isMiddle ? 'PULL!' : 'TUG!', '#9966FF')
            this.time.delayedCall(1500, () => { if (zone.active) zone._txtShown = false })
          }
        }
      }
      return true
    })

    if (this.isBossLevel) {
      const bossForce = this._updateBoss(time, delta)
      if (bossForce.x || bossForce.y) {
        environmentalForceX += bossForce.x
        environmentalForceY += bossForce.y
        if (!environmentalSources.includes('boss')) environmentalSources.push('boss')
      }
    }

    this._applyEnvironmentalForce(environmentalForceX, environmentalForceY, delta, environmentalSources)
    this._updateForceDebugOverlay()

    // Drown warning blink
    if (this.drownMeter > 75 && !this.drownBlinkEvent) {
      this.drownBlinkEvent = this.time.addEvent({
        delay: 300,
        callback: () => { this.cameras.main.flash(80, 255, 0, 0, true) },
        loop: true,
      })
    } else if (this.drownMeter <= 75 && this.drownBlinkEvent) {
      this.drownBlinkEvent.remove()
      this.drownBlinkEvent = null
    }

    if (this.drownMeter >= 100) {
      this._gameOver()
      return
    }

    // Update hazards
    this.hazardList.forEach(h => {
      if (!h || !h.active) return
      if (typeof h.update !== 'function') {
        debugLog('LevelScene.hazardMissingUpdate', getSceneDebugSnapshot(this, { hazardType: h.hazardType }))
        try { h.destroy() } catch {}
        return
      }
      h.update(delta)
    })

    // Clean up off-screen hazards + dodged scoring
    this.hazardList = this.hazardList.filter(h => {
      if (!h.active) return false
      if (h.x < -150) {
        if (!h.dodged && !h.hitGerald) {
          if (typeof h.markDodged === 'function') h.markDodged()
          else h.dodged = true
          this._addScore(h.definition.scoreOnDodge || 10)
          this._showFloatingText(
            Phaser.Math.Between(60, GAME_WIDTH - 60),
            Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 60),
            `+${h.definition.scoreOnDodge || 10} DODGED!`, '#88ff88'
          )
        }
        if (typeof h.checkCloseCall === 'function' && h.checkCloseCall(this.gerald)) {
          const ccScore = h.definition.closeCallScore || 50
          this._addScore(ccScore)
          this._showFloatingText(this.gerald.x, this.gerald.y - 40, `CLOSE CALL! +${ccScore}`, '#ffff00')
        }
        h.destroy()
        return false
      }
      return true
    })

    // Scroll collectibles leftward
    this.collectibles.getChildren().forEach(c => {
      c.x -= scrollSpeed
      if (c.x < -50) c.destroy()
    })

    this._updateUI()
  }

  // --- FINISH LINE ---
  _spawnFinishLine() {
    const x = GAME_WIDTH + 40
    const midY = WATER_TOP + (POOL_BOTTOM - WATER_TOP) / 2

    const finishTxt = this.add.text(x, midY, 'FINISH!\nYOU MADE IT!', {
      fontSize: '26px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffdd00',
      stroke: '#003300',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5).setDepth(20)

    const bar = this.add.rectangle(x + 60, midY, 8, POOL_BOTTOM - WATER_TOP, 0xffdd00, 1).setDepth(15)
    this._finishBar = bar
    this.finishLineObj = finishTxt

    this.tweens.add({
      targets: finishTxt, scaleX: 1.1, scaleY: 1.1,
      duration: 400, yoyo: true, repeat: -1,
    })
  }

  // --- WIN / GAME OVER ---
  _win() {
    if (this.isWon || this._transitioning) return
    if (this.isBossLevel && !this.bossDefeated && this.bossHealth > 0) {
      debugLog('LevelScene.bossWinBlocked', getSceneDebugSnapshot(this, { bossHealth: this.bossHealth }))
      return
    }
    this.isWon = true
    this._transitioning = true
    debugLog('LevelScene.win', getSceneDebugSnapshot(this))

    this._addScore(100)

    const bonusGP = Math.floor(this.score / 10)
    this.geraldPoints += bonusGP

    const save = loadSave()
    save.geraldPoints = this.geraldPoints
    if (!save.completedLevels) save.completedLevels = []
    if (!save.completedLevels.includes(this.levelId)) {
      save.completedLevels.push(this.levelId)
    }
    if (!save.highScores) save.highScores = {}
    if (!save.highScores[this.levelId] || this.score > save.highScores[this.levelId]) {
      save.highScores[this.levelId] = this.score
    }

    const currentIdx = LEVEL_ORDER.indexOf(this.levelId)
    const nextLevelId = LEVEL_ORDER[currentIdx + 1] || null

    save.lastCompletedLevelId = this.levelId
    save.pendingNextLevelId = nextLevelId
    if (!save.unlockedLevels) save.unlockedLevels = ['shallow_end']
    if (nextLevelId && !save.unlockedLevels.includes(nextLevelId)) {
      save.unlockedLevels.push(nextLevelId)
    }

    save.campaignProgress = (save.completedLevels.length / 8) * 100
    saveSave(save)

    this.registry.set('geraldPoints', this.geraldPoints)
    this.registry.set('score', this.score)

    this._showFloatingText(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'YOU MADE IT!', '#ffdd00')

    this.time.delayedCall(1200, () => {
      if (this.isBossLevel) {
        this.scene.start('FinalVictoryScene', {
          score: this.score,
          geraldPoints: this.geraldPoints,
          bonusGP,
        })
        return
      }
      this.scene.start('WinScene', {
        score: this.score,
        geraldPoints: this.geraldPoints,
        bonusGP,
        levelId: this.levelId,
        nextLevelId,
      })
    })
  }

  _gameOver() {
    if (this.isGameOver || this._transitioning) return
    this.isGameOver = true
    this._transitioning = true
    debugLog('LevelScene.gameOver', getSceneDebugSnapshot(this))

    this.drownMeter = 100
    this._updateUI()

    this.gerald.setVelocityY(200)
    this.gerald.setVelocityX(0)
    this.tweens.add({
      targets: this.gerald, y: POOL_BOTTOM + 60, alpha: 0, duration: 1000,
    })

    const save = loadSave()
    save.geraldPoints = this.geraldPoints
    saveSave(save)

    this.registry.set('score', this.score)
    this.registry.set('geraldPoints', this.geraldPoints)

    this.time.delayedCall(1200, () => {
      this.scene.start('GameOverScene', {
        score: this.score,
        geraldPoints: this.geraldPoints,
        levelId: this.levelId,
      })
    })
  }
}
