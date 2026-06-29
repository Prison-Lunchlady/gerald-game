import Phaser from 'phaser'

export default class Gerald extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'gerald')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.setDepth(10)
    this.setScale(0.55)

    this.baseSinkSpeed = 16
    this.sinkSpeed = 16

    this.bobPower = -480
    this.moveSpeed = 160
    this.drownRateMultiplier = 1.0
    this.drownFillRateMultiplier = 1.0
    this.sinkSpeedMultiplier = 1.0
    this.swimBoostMultiplier = 1.0
    this.hazardDamageMultiplier = 1.0
    this.passiveFloatForce = 0
    this.floatiesVisible = false
    this.bobberVisible = false

    this.floatiesGfx = null
    this.bobberGfx = null

    this._direction = 'front'

    this.maxDownVelocity = 190
    this._waveHitMs = 0
    this.jetResistMultiplier = 1.0
    this.vacuumEscapeMultiplier = 1.0
  }

  applyUpgrades(purchasedUpgrades) {
    this.sinkSpeedMultiplier = 1.0
    this.swimBoostMultiplier = 1.0
    this.drownFillRateMultiplier = 1.0
    this.hazardDamageMultiplier = 1.0
    this.passiveFloatForce = 0
    this.floatiesVisible = false
    this.bobberVisible = false
    this.jetResistMultiplier = 1.0
    this.vacuumEscapeMultiplier = 1.0

    if (this.floatiesGfx) { this.floatiesGfx.destroy(); this.floatiesGfx = null }
    if (this.bobberGfx) { this.bobberGfx.destroy(); this.bobberGfx = null }

    if (!purchasedUpgrades || purchasedUpgrades.length === 0) {
      this.sinkSpeed = this.baseSinkSpeed
      this.drownRateMultiplier = 1.0
      return
    }

    purchasedUpgrades.forEach(id => {
      switch(id) {
        case 'tiny_arm_floaties':
          this.sinkSpeedMultiplier *= 0.90
          this.drownFillRateMultiplier *= 0.75
          this.floatiesVisible = true
          break
        case 'better_bob':
          this.swimBoostMultiplier = Math.min(this.swimBoostMultiplier * 1.12, 1.25)
          this.bobberVisible = true
          break
        case 'pool_noodle_belt':
          this.sinkSpeedMultiplier *= 0.83
          this.passiveFloatForce = 5
          break
        case 'wave_resistance':
          this.hazardDamageMultiplier *= 0.60
          break
        case 'jet_resistance':
          this.jetResistMultiplier *= 0.50
          break
        case 'vacuum_escape':
          this.vacuumEscapeMultiplier *= 0.50
          break
      }
    })

    this.sinkSpeedMultiplier = Math.max(0.65, Math.min(this.sinkSpeedMultiplier, 1.0))
    this.sinkSpeed = this.baseSinkSpeed * this.sinkSpeedMultiplier
    this.drownRateMultiplier = this.drownFillRateMultiplier

    if (this.floatiesVisible && this.scene) {
      this.floatiesGfx = this.scene.add.graphics()
      this.floatiesGfx.fillStyle(0xFF69B4, 0.85)
      this.floatiesGfx.fillEllipse(-22, 2, 14, 10)
      this.floatiesGfx.fillEllipse(22, 2, 14, 10)
      this.floatiesGfx.setDepth(this.depth + 1)
    }

    if (this.bobberVisible && this.scene) {
      this.bobberGfx = this.scene.add.graphics()
      this.bobberGfx.fillStyle(0xFF0000, 1)
      this.bobberGfx.fillCircle(0, -4, 5)
      this.bobberGfx.fillStyle(0xFFFFFF, 1)
      this.bobberGfx.fillCircle(0, 3, 5)
      this.bobberGfx.lineStyle(1, 0x444444, 0.8)
      this.bobberGfx.lineBetween(0, -8, 0, -10)
      this.bobberGfx.setDepth(this.depth + 1)
    }

    console.log(`[applyUpgrades] sinkSpeed=${this.sinkSpeed.toFixed(1)} swimMult=${this.swimBoostMultiplier.toFixed(2)} passiveFloat=${this.passiveFloatForce}`)
  }

  bob() {
    if (this.isGameOver || this.isWon) return

    const nearSurface = this.y < 195
    const depthFactor = nearSurface ? 0.60 : 1.0

    const boostVel = this.bobPower * this.swimBoostMultiplier * depthFactor
    const clamped = Math.max(boostVel, -400)

    this.setVelocityY(clamped)

    console.log(`[bob] y=${Math.round(this.y)} nearSurf=${nearSurface} boost=${Math.round(clamped)} sinkSpd=${this.sinkSpeed.toFixed(1)}`)

    this.scene.tweens.add({
      targets: this,
      angle: -10,
      duration: 100,
      yoyo: true,
    })
    this.setTexture('gerald_top')
    this.scene.time.delayedCall(180, () => {
      if (!this.active) return
      if (this._direction === 'left') this.setTexture('gerald_side_l')
      else if (this._direction === 'right') this.setTexture('gerald_side_r')
      else this.setTexture('gerald')
    })
  }

  moveLeft() {
    this.setVelocityX(-this.moveSpeed)
    if (this._direction !== 'left') {
      this._direction = 'left'
      this.setTexture('gerald_side_l')
    }
  }

  moveRight() {
    this.setVelocityX(this.moveSpeed)
    if (this._direction !== 'right') {
      this._direction = 'right'
      this.setTexture('gerald_side_r')
    }
  }

  stopHorizontal() {
    this.setVelocityX(0)
    if (this._direction !== 'front') {
      this._direction = 'front'
      this.setTexture('gerald')
    }
  }

  update(delta) {
    const dt = delta / 1000

    let velY = this.body.velocity.y

    velY += this.sinkSpeed * dt * 38

    if (this.passiveFloatForce > 0) {
      const capped = Math.min(this.passiveFloatForce, this.sinkSpeed * 0.20)
      velY -= capped * dt * 38
    }

    if (this._waveHitMs > 0) {
      this._waveHitMs = Math.max(0, this._waveHitMs - delta)
      velY = Math.min(velY, this.maxDownVelocity + 90)
    } else {
      velY = Math.min(velY, this.maxDownVelocity)
    }

    this.setVelocityY(velY)

    if (this.floatiesGfx) {
      this.floatiesGfx.setPosition(this.x, this.y)
    }
    if (this.bobberGfx) {
      this.bobberGfx.setPosition(this.x + 20, this.y - 12)
    }
  }

  destroy(fromScene) {
    if (this.floatiesGfx) { try { this.floatiesGfx.destroy() } catch(e) {} this.floatiesGfx = null }
    if (this.bobberGfx) { try { this.bobberGfx.destroy() } catch(e) {} this.bobberGfx = null }
    super.destroy(fromScene)
  }
}
