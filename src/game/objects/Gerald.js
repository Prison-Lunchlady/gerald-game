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
    this.noodleVisible = false
    this.flippersVisible = false
    this.gogglesVisible = false
    this.snorkelVisible = false

    this.floatiesGfx = null
    this.bobberGfx = null
    this.noodleGfx = null
    this.flippersGfx = null
    this.gogglesGfx = null
    this.snorkelGfx = null

    this._direction = 'front'

    this.maxDownVelocity = 190
    this._waveHitMs = 0
    this.jetResistMultiplier = 1.0
    this.vacuumEscapeMultiplier = 1.0
    this.surfaceSwimMultiplier = 1.0
  }

  applyUpgrades(purchasedUpgrades) {
    this.sinkSpeedMultiplier = 1.0
    this.swimBoostMultiplier = 1.0
    this.drownFillRateMultiplier = 1.0
    this.hazardDamageMultiplier = 1.0
    this.passiveFloatForce = 0
    this.floatiesVisible = false
    this.bobberVisible = false
    this.noodleVisible = false
    this.flippersVisible = false
    this.gogglesVisible = false
    this.snorkelVisible = false
    this.jetResistMultiplier = 1.0
    this.vacuumEscapeMultiplier = 1.0

    this._destroyUpgradeGfx()

    if (!purchasedUpgrades || purchasedUpgrades.length === 0) {
      this.sinkSpeed = this.baseSinkSpeed
      this.drownRateMultiplier = 1.0
      return
    }

    purchasedUpgrades.forEach(id => {
      switch(id) {
        case 'tiny_arm_floaties':
          this.sinkSpeedMultiplier *= 0.87
          this.drownFillRateMultiplier *= 0.70
          this.floatiesVisible = true
          break
        case 'better_bob':
          this.swimBoostMultiplier = Math.min(this.swimBoostMultiplier * 1.12, 1.25)
          this.bobberVisible = true
          break
        case 'pool_noodle_belt':
          this.sinkSpeedMultiplier *= 0.78
          this.passiveFloatForce = 7
          this.noodleVisible = true
          break
        case 'wave_resistance':
          this.hazardDamageMultiplier *= 0.60
          this.flippersVisible = true
          break
        case 'jet_resistance':
          this.jetResistMultiplier *= 0.58
          this.gogglesVisible = true
          break
        case 'vacuum_escape':
          this.vacuumEscapeMultiplier *= 0.60
          this.snorkelVisible = true
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

    if (this.noodleVisible && this.scene) {
      this.noodleGfx = this.scene.add.graphics()
      this.noodleGfx.lineStyle(6, 0xffdd00, 0.95)
      this.noodleGfx.strokeEllipse(0, 10, 52, 18)
      this.noodleGfx.lineStyle(2, 0xff9900, 0.9)
      this.noodleGfx.strokeEllipse(0, 10, 58, 22)
      this.noodleGfx.setDepth(this.depth + 1)
    }

    if (this.flippersVisible && this.scene) {
      this.flippersGfx = this.scene.add.graphics()
      this.flippersGfx.fillStyle(0x2266ff, 0.9)
      this.flippersGfx.fillTriangle(-17, 22, -5, 22, -22, 40)
      this.flippersGfx.fillTriangle(5, 22, 17, 22, 22, 40)
      this.flippersGfx.lineStyle(2, 0x003399, 0.9)
      this.flippersGfx.strokeTriangle(-17, 22, -5, 22, -22, 40)
      this.flippersGfx.strokeTriangle(5, 22, 17, 22, 22, 40)
      this.flippersGfx.setDepth(this.depth + 1)
    }

    if (this.gogglesVisible && this.scene) {
      this.gogglesGfx = this.scene.add.graphics()
      this.gogglesGfx.lineStyle(3, 0x00ddff, 0.95)
      this.gogglesGfx.strokeCircle(-10, -8, 9)
      this.gogglesGfx.strokeCircle(10, -8, 9)
      this.gogglesGfx.lineStyle(2, 0x003355, 0.95)
      this.gogglesGfx.lineBetween(-1, -8, 1, -8)
      this.gogglesGfx.setDepth(this.depth + 2)
    }

    if (this.snorkelVisible && this.scene) {
      this.snorkelGfx = this.scene.add.graphics()
      this.snorkelGfx.lineStyle(5, 0xff8844, 0.95)
      this.snorkelGfx.lineBetween(22, -16, 30, -32)
      this.snorkelGfx.lineBetween(30, -32, 39, -32)
      this.snorkelGfx.fillStyle(0xffff66, 1)
      this.snorkelGfx.fillRoundedRect(36, -38, 9, 12, 3)
      this.snorkelGfx.setDepth(this.depth + 2)
    }

    console.log(`[applyUpgrades] sinkSpeed=${this.sinkSpeed.toFixed(1)} swimMult=${this.swimBoostMultiplier.toFixed(2)} passiveFloat=${this.passiveFloatForce}`)
  }

  bob() {
    if (this.isGameOver || this.isWon) return

    const nearSurface = this.y < 195
    const depthFactor = nearSurface ? 0.60 : 1.0

    const fatigueFactor = nearSurface ? (this.surfaceSwimMultiplier || 1.0) : 1.0
    const boostVel = this.bobPower * this.swimBoostMultiplier * depthFactor * fatigueFactor
    const maxUpwardSpeed = -400 * Math.min(this.swimBoostMultiplier, 1.1) * fatigueFactor
    const clamped = Math.max(boostVel, maxUpwardSpeed)

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
    if (this.noodleGfx) {
      this.noodleGfx.setPosition(this.x, this.y)
    }
    if (this.flippersGfx) {
      this.flippersGfx.setPosition(this.x, this.y)
    }
    if (this.gogglesGfx) {
      this.gogglesGfx.setPosition(this.x, this.y)
    }
    if (this.snorkelGfx) {
      this.snorkelGfx.setPosition(this.x, this.y)
    }
  }

  _destroyUpgradeGfx() {
    if (this.floatiesGfx) { try { this.floatiesGfx.destroy() } catch(e) {} this.floatiesGfx = null }
    if (this.bobberGfx) { try { this.bobberGfx.destroy() } catch(e) {} this.bobberGfx = null }
    if (this.noodleGfx) { try { this.noodleGfx.destroy() } catch(e) {} this.noodleGfx = null }
    if (this.flippersGfx) { try { this.flippersGfx.destroy() } catch(e) {} this.flippersGfx = null }
    if (this.gogglesGfx) { try { this.gogglesGfx.destroy() } catch(e) {} this.gogglesGfx = null }
    if (this.snorkelGfx) { try { this.snorkelGfx.destroy() } catch(e) {} this.snorkelGfx = null }
  }

  destroy(fromScene) {
    this._destroyUpgradeGfx()
    super.destroy(fromScene)
  }
}
