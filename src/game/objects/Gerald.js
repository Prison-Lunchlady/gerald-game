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
    this.surfaceRecoveryBonus = 1.0
    this.surfaceFatigueResistance = 0
    this.surfaceTurbulenceResistance = 0
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
    this.surfaceRecoveryBonus = 1.0
    this.surfaceFatigueResistance = 0
    this.surfaceTurbulenceResistance = 0

    this._destroyUpgradeGfx()

    if (!purchasedUpgrades || purchasedUpgrades.length === 0) {
      this.sinkSpeed = this.baseSinkSpeed
      this.drownRateMultiplier = 1.0
      return
    }

    let flotationItemCount = 0

    purchasedUpgrades.forEach(id => {
      switch(id) {
        case 'tiny_arm_floaties':
          this.sinkSpeedMultiplier *= 0.87
          this.drownFillRateMultiplier *= 0.70
          this.floatiesVisible = true
          flotationItemCount += 1
          this.surfaceRecoveryBonus += 0.04
          this.surfaceFatigueResistance += 0.04
          this.surfaceTurbulenceResistance += 0.03
          break
        case 'better_bob':
          this.swimBoostMultiplier = Math.min(this.swimBoostMultiplier * 1.12, 1.25)
          this.bobberVisible = true
          flotationItemCount += 1
          this.surfaceRecoveryBonus += 0.03
          this.surfaceFatigueResistance += 0.03
          break
        case 'pool_noodle_belt':
          this.sinkSpeedMultiplier *= 0.78
          this.passiveFloatForce = 7
          this.noodleVisible = true
          flotationItemCount += 1
          this.surfaceRecoveryBonus += 0.06
          this.surfaceFatigueResistance += 0.06
          this.surfaceTurbulenceResistance += 0.05
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

    if (flotationItemCount >= 2) {
      this.surfaceRecoveryBonus += 0.06
      this.surfaceFatigueResistance += 0.06
      this.surfaceTurbulenceResistance += 0.04
    }
    if (flotationItemCount >= 3) {
      this.surfaceRecoveryBonus += 0.03
      this.surfaceFatigueResistance += 0.03
      this.surfaceTurbulenceResistance += 0.02
    }
    this.surfaceRecoveryBonus = Math.min(this.surfaceRecoveryBonus, 1.22)
    this.surfaceFatigueResistance = Math.min(this.surfaceFatigueResistance, 0.28)
    this.surfaceTurbulenceResistance = Math.min(this.surfaceTurbulenceResistance, 0.20)

    this.sinkSpeedMultiplier = Math.max(0.65, Math.min(this.sinkSpeedMultiplier, 1.0))
    this.sinkSpeed = this.baseSinkSpeed * this.sinkSpeedMultiplier
    this.drownRateMultiplier = this.drownFillRateMultiplier

    if (this.floatiesVisible && this.scene) {
      this.floatiesGfx = this.scene.add.graphics()
      this.floatiesGfx.fillStyle(0xff6fb4, 0.92)
      this.floatiesGfx.fillRoundedRect(-31, -3, 14, 18, 7)
      this.floatiesGfx.fillRoundedRect(17, -3, 14, 18, 7)
      this.floatiesGfx.fillStyle(0xff9bd0, 0.82)
      this.floatiesGfx.fillEllipse(-24, 1, 10, 8)
      this.floatiesGfx.fillEllipse(24, 1, 10, 8)
      this.floatiesGfx.lineStyle(2, 0xd63a86, 0.78)
      this.floatiesGfx.strokeRoundedRect(-31, -3, 14, 18, 7)
      this.floatiesGfx.strokeRoundedRect(17, -3, 14, 18, 7)
      this.floatiesGfx.setDepth(this.depth + 1)
    }

    if (this.bobberVisible && this.scene) {
      this.bobberGfx = this.scene.add.graphics()
      this.bobberGfx.lineStyle(1, 0x333333, 0.85)
      this.bobberGfx.lineBetween(-12, 6, 1, -2)
      this.bobberGfx.fillStyle(0xFF0000, 1)
      this.bobberGfx.fillCircle(7, -8, 6)
      this.bobberGfx.fillStyle(0xFFFFFF, 1)
      this.bobberGfx.fillCircle(7, -2, 6)
      this.bobberGfx.fillStyle(0xff3333, 1)
      this.bobberGfx.fillRect(1, -8, 12, 5)
      this.bobberGfx.lineStyle(1, 0x333333, 0.85)
      this.bobberGfx.strokeCircle(7, -5, 6)
      this.bobberGfx.lineBetween(7, -12, 7, -15)
      this.bobberGfx.setDepth(this.depth + 1)
    }

    if (this.noodleVisible && this.scene) {
      this.noodleGfx = this.scene.add.graphics()
      this.noodleGfx.lineStyle(8, 0xffdd00, 0.96)
      this.noodleGfx.strokeEllipse(0, 11, 56, 20)
      this.noodleGfx.lineStyle(3, 0xff8f00, 0.85)
      this.noodleGfx.strokeEllipse(0, 11, 62, 25)
      this.noodleGfx.lineStyle(2, 0xffffff, 0.55)
      this.noodleGfx.beginPath()
      this.noodleGfx.arc(0, 11, 25, Math.PI + 0.25, Math.PI * 1.78)
      this.noodleGfx.strokePath()
      this.noodleGfx.setDepth(this.depth + 1)
    }

    if (this.flippersVisible && this.scene) {
      this.flippersGfx = this.scene.add.graphics()
      this.flippersGfx.fillStyle(0x1f7cff, 0.94)
      this.flippersGfx.fillTriangle(-19, 23, -7, 25, -30, 50)
      this.flippersGfx.fillTriangle(7, 25, 19, 23, 30, 50)
      this.flippersGfx.lineStyle(2, 0x003c99, 0.9)
      this.flippersGfx.strokeTriangle(-19, 23, -7, 25, -30, 50)
      this.flippersGfx.strokeTriangle(7, 25, 19, 23, 30, 50)
      this.flippersGfx.lineBetween(-15, 27, -27, 45)
      this.flippersGfx.lineBetween(15, 27, 27, 45)
      this.flippersGfx.lineStyle(1, 0x8fd6ff, 0.8)
      this.flippersGfx.lineBetween(-11, 27, -23, 43)
      this.flippersGfx.lineBetween(11, 27, 23, 43)
      this.flippersGfx.lineStyle(3, 0x001f66, 0.82)
      this.flippersGfx.lineBetween(-18, 24, -7, 25)
      this.flippersGfx.lineBetween(7, 25, 18, 24)
      this.flippersGfx.setDepth(this.depth + 1)
    }

    if (this.gogglesVisible && this.scene) {
      this.gogglesGfx = this.scene.add.graphics()
      this.gogglesGfx.lineStyle(3, 0x203040, 0.85)
      this.gogglesGfx.lineBetween(-28, -11, -17, -11)
      this.gogglesGfx.lineBetween(17, -11, 28, -11)
      this.gogglesGfx.fillStyle(0x9ff5ff, 0.82)
      this.gogglesGfx.fillRoundedRect(-18, -18, 15, 11, 5)
      this.gogglesGfx.fillRoundedRect(3, -18, 15, 11, 5)
      this.gogglesGfx.lineStyle(3, 0x00a6d6, 0.96)
      this.gogglesGfx.strokeRoundedRect(-18, -18, 15, 11, 5)
      this.gogglesGfx.strokeRoundedRect(3, -18, 15, 11, 5)
      this.gogglesGfx.lineStyle(2, 0x203040, 0.95)
      this.gogglesGfx.lineBetween(-3, -12, 3, -12)
      this.gogglesGfx.fillStyle(0xffffff, 0.55)
      this.gogglesGfx.fillCircle(-13, -15, 2)
      this.gogglesGfx.fillCircle(8, -15, 2)
      this.gogglesGfx.setDepth(this.depth + 2)
    }

    if (this.snorkelVisible && this.scene) {
      this.snorkelGfx = this.scene.add.graphics()
      this.snorkelGfx.lineStyle(5, 0xff8a2a, 0.96)
      this.snorkelGfx.lineBetween(18, -2, 27, -14)
      this.snorkelGfx.lineBetween(27, -14, 27, -36)
      this.snorkelGfx.lineBetween(27, -36, 39, -36)
      this.snorkelGfx.fillStyle(0xffd84d, 1)
      this.snorkelGfx.fillRoundedRect(36, -42, 10, 12, 3)
      this.snorkelGfx.fillStyle(0x3366cc, 0.95)
      this.snorkelGfx.fillRoundedRect(12, -4, 14, 5, 3)
      this.snorkelGfx.lineStyle(2, 0x9a3d00, 0.9)
      this.snorkelGfx.lineBetween(27, -34, 39, -34)
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
