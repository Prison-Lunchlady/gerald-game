import Phaser from 'phaser'
import Gerald from '../objects/Gerald'
import Collectible from '../objects/Collectible'
import Hazard, { HAZARD_TYPES } from '../objects/Hazard'
import { LEVELS, LEVEL_ORDER } from '../data/levels'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { loadSave, saveSave } from '../data/saveData'

const WATER_TOP = 150
const POOL_BOTTOM = GAME_HEIGHT - 50
// Zone thresholds for drown meter behavior
const SURFACE_ZONE_Y = WATER_TOP + 65  // y <= 215: broader surface recovery zone
const DANGER_ZONE_Y = 540              // y >= 540: rapid drown zone

export default class LevelScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelScene' })
  }

  init(data) {
    this.levelId = data.levelId || 'shallow_end'
    this.levelDef = LEVELS[this.levelId]
  }

  create() {
    const save = loadSave()
    this.saveData = save

    this.drownMeter = 0
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

    this.collectibles = this.physics.add.group()
    this.hazardPhysicsGroup = this.physics.add.group()

    this._createBackground()
    this._spawnGerald()
    this._createUI()
    this._createMobileControls()

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      bob: Phaser.Input.Keyboard.KeyCodes.SPACE,
    })

    this.physics.add.overlap(this.gerald, this.collectibles, this._onCollect, null, this)
    this.physics.add.overlap(this.gerald, this.hazardPhysicsGroup, this._onPhysicsHazardHit, null, this)

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
    this.time.delayedCall(1600, () => this._spawnCollectible('bubble'))
  }

  _spawnNextHazard() {
    if (this.isGameOver || this.isWon) return
    let type
    if (this.levelDef.hazardSequence && this.levelDef.hazardSequence.length > 0) {
      type = this.levelDef.hazardSequence[this._hazardSequenceIdx % this.levelDef.hazardSequence.length]
      this._hazardSequenceIdx++
    } else {
      const types = this.levelDef.hazardTypes || ['cannonball_wave']
      type = types[Math.floor(Math.random() * types.length)]
    }

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

  _spawnHazard(type) {
    if (this.isGameOver || this.isWon) return
    const def = HAZARD_TYPES[type]
    if (!def) return

    let x, y
    const opts = {}

    if (type === 'floating_leaf') {
      x = GAME_WIDTH + 50
      y = Phaser.Math.Between(WATER_TOP + 15, WATER_TOP + 100)
    } else if (type === 'splash_zone') {
      x = Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.45), GAME_WIDTH - 130)
      y = Phaser.Math.Between(WATER_TOP + 80, POOL_BOTTOM - 130)
      opts.splashScale = this.levelDef.splashScale || 1.0
    } else if (type === 'pool_jet') {
      x = Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.35), GAME_WIDTH - 100)
      y = Phaser.Math.Between(WATER_TOP + 100, POOL_BOTTOM - 150)
      const jetDirs = ['down', 'down', 'right', 'left']
      opts.jetDir = jetDirs[Math.floor(Math.random() * jetDirs.length)]
      opts.jetStrength = 280 * (this.levelDef.waveStrength || 1.0)
    } else if (type === 'vacuum_suction') {
      x = Phaser.Math.Between(Math.floor(GAME_WIDTH * 0.3), GAME_WIDTH - 120)
      y = Phaser.Math.Between(WATER_TOP + 120, POOL_BOTTOM - 150)
    } else {
      x = GAME_WIDTH + 50
      y = Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 80)
    }

    const hazard = new Hazard(this, x, y, type, opts)
    this.hazardList.push(hazard)

    const physObj = hazard.getPhysicsBody()
    if (physObj) {
      this.hazardPhysicsGroup.add(physObj)
      physObj._hazardRef = hazard
    }

    if (type === 'splash_zone') {
      this.splashZones.push(hazard)
    } else if (type === 'pool_jet') {
      this.jetZones.push(hazard)
    } else if (type === 'vacuum_suction') {
      this.vacuumZones.push(hazard)
    }
  }

  _spawnCollectible(type) {
    if (this.isGameOver || this.isWon) return
    const y = Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 80)
    const x = Phaser.Math.Between(GAME_WIDTH - 60, GAME_WIDTH - 20)
    const item = new Collectible(this, x, y, type)
    this.collectibles.add(item)
  }

  // --- COLLISION HANDLERS ---
  _onCollect(gerald, item) {
    const def = item.definition
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

    const damage = hazard.definition.drownIncrease * this.gerald.hazardDamageMultiplier
    if (damage > 0) {
      this.drownMeter = Math.min(100, this.drownMeter + damage)
    }

    if (hazard.definition.slowsGerald) {
      // Leaf: tangle Gerald — slow movement and nudge down
      const origSpeed = this.gerald.moveSpeed
      this.gerald.moveSpeed = origSpeed * 0.35
      this.gerald.setVelocityY(Math.min(this.gerald.body.velocity.y + 70, this.gerald.maxDownVelocity))
      this.time.delayedCall(1500, () => { if (this.gerald && this.gerald.active) this.gerald.moveSpeed = origSpeed })
      this._showFloatingText(gerald.x, gerald.y - 30, 'TANGLED!', '#33aa33')
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

  // --- MAIN UPDATE LOOP ---
  update(time, delta) {
    if (this.isGameOver || this.isWon) return

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

    const scrollSpeed = (this.levelDef.worldScrollSpeed || 80) * (delta / 1000)
    this.levelProgress += scrollSpeed
    this.levelProgress = Math.min(this.levelProgress, this.levelDef.levelLength + 1)

    // Checkpoints — plain text
    if (this.levelDef.checkpoints) {
      this.levelDef.checkpoints.forEach(cp => {
        if (!this.checkpointsPassed.has(cp) && this.levelProgress >= cp) {
          this.checkpointsPassed.add(cp)
          this._addScore(5)
          this._showFloatingText(GAME_WIDTH / 2, WATER_TOP + 50, 'CHECKPOINT! +5', '#00ff88')
        }
      })
    }

    // Finish line appears near end
    if (!this.finishLineSpawned && this.levelProgress >= this.levelDef.levelLength * 0.85) {
      this.finishLineSpawned = true
      this._spawnFinishLine()
    }

    // Win condition
    if (this.levelProgress >= this.levelDef.levelLength) {
      this._win()
      return
    }

    // Zone-based drown meter
    const geraldY = this.gerald.y
    const baseDrownRate = this.levelDef.drownFillRate * this.gerald.drownFillRateMultiplier

    if (geraldY <= SURFACE_ZONE_Y) {
      // Surface zone: rapid DROWN recovery
      const recoveryRate = this.levelDef.surfaceRecoveryRate || 20
      this.drownMeter = Math.max(0, this.drownMeter - recoveryRate * (delta / 1000))
    } else if (geraldY >= DANGER_ZONE_Y) {
      // Deep danger zone: DROWN fills fast
      this.drownMeter = Math.min(100, this.drownMeter + baseDrownRate * 2.5 * (delta / 1000))
    } else {
      // Mid-water: DROWN fills slowly
      this.drownMeter = Math.min(100, this.drownMeter + baseDrownRate * 0.5 * (delta / 1000))
    }

    // Splash zone continuous damage — only during the active phase
    this.splashZones = this.splashZones.filter(zone => {
      if (!zone.active) return false
      if (zone._splashPhase === 'active') {
        const zBounds = zone.getBounds()
        const gBounds = this.gerald.getBounds()
        if (Phaser.Geom.Rectangle.Overlaps(zBounds, gBounds)) {
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
        const zBounds = zone.getBounds()
        const gBounds = this.gerald.getBounds()
        if (Phaser.Geom.Rectangle.Overlaps(zBounds, gBounds)) {
          const resist = this.gerald.jetResistMultiplier || 1.0
          const str = zone._jetStrength * resist
          const dir = zone._jetDir || 'down'
          if (dir === 'down') {
            const newVY = Math.min(this.gerald.body.velocity.y + str * (delta / 1000), this.gerald.maxDownVelocity + 55)
            this.gerald.setVelocityY(newVY)
          } else if (dir === 'right') {
            this.gerald.setVelocityX(Math.min(this.gerald.body.velocity.x + str * (delta / 1000), 320))
          } else {
            this.gerald.setVelocityX(Math.max(this.gerald.body.velocity.x - str * (delta / 1000), -320))
          }
          const dmg = zone.definition.drownRate * (delta / 1000) * this.gerald.hazardDamageMultiplier
          this.drownMeter = Math.min(100, this.drownMeter + dmg)
          // Debounced floating text
          if (!zone._txtShown) {
            zone._txtShown = true
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
        const innerR = zone.definition.innerRadius || 38
        if (dist < outerR && dist > 2) {
          const angle = Phaser.Math.Angle.Between(this.gerald.x, this.gerald.y, zone.x, zone.y)
          const escape = this.gerald.vacuumEscapeMultiplier || 1.0
          const isInner = dist < innerR
          const pullStr = (isInner ? 230 : 95) * escape
          const drownRate = isInner
            ? (zone.definition.drownRateInner || 10)
            : (zone.definition.drownRateOuter || 3)
          const vx = Math.cos(angle) * pullStr * (delta / 1000)
          const vy = Math.sin(angle) * pullStr * (delta / 1000)
          this.gerald.setVelocityX(Phaser.Math.Clamp(this.gerald.body.velocity.x + vx, -340, 340))
          this.gerald.setVelocityY(Phaser.Math.Clamp(this.gerald.body.velocity.y + vy, -400, this.gerald.maxDownVelocity + 60))
          const dmg = drownRate * (delta / 1000) * this.gerald.hazardDamageMultiplier
          this.drownMeter = Math.min(100, this.drownMeter + dmg)
          if (!zone._txtShown) {
            zone._txtShown = true
            this._showFloatingText(this.gerald.x, this.gerald.y - 30, isInner ? 'CAUGHT!' : 'PULL!', '#9966FF')
            this.time.delayedCall(1500, () => { if (zone.active) zone._txtShown = false })
          }
        }
      }
      return true
    })

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
    this.hazardList.forEach(h => { if (h.active) h.update(delta) })

    // Clean up off-screen hazards + dodged scoring
    this.hazardList = this.hazardList.filter(h => {
      if (!h.active) return false
      if (h.x < -150) {
        if (!h.dodged && !h.hitGerald) {
          h.markDodged()
          this._addScore(h.definition.scoreOnDodge || 10)
          this._showFloatingText(
            Phaser.Math.Between(60, GAME_WIDTH - 60),
            Phaser.Math.Between(WATER_TOP + 40, POOL_BOTTOM - 60),
            `+${h.definition.scoreOnDodge || 10} DODGED!`, '#88ff88'
          )
        }
        if (h.checkCloseCall && h.checkCloseCall(this.gerald)) {
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

    // Scroll finish line
    if (this.finishLineObj && this.finishLineObj.active) {
      this.finishLineObj.x -= scrollSpeed
    }
    if (this._finishBar && this._finishBar.active) {
      this._finishBar.x -= scrollSpeed
    }

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
    if (this.isWon) return
    this.isWon = true

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
    if (this.isGameOver) return
    this.isGameOver = true

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
