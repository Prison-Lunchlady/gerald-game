import Phaser from 'phaser'

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' })
  }

  preload() {
    // Real Gerald sprites
    this.load.image('gerald', 'assets/gerald/gerald_front.png')
    this.load.image('gerald_side_l', 'assets/gerald/gerald_side.png')
    this.load.image('gerald_side_r', 'assets/gerald/gerald_side_r.png')
    this.load.image('gerald_top', 'assets/gerald/gerald_top.png')
    this.load.image('gerald_back', 'assets/gerald/gerald_back.png')
  }

  create() {
    // Still generate placeholder textures for non-Gerald game objects
    this._createGeraldWithFloatiesTexture()
    this._createBubbleTexture()
    this._createCoinTexture()
    this._createWaveTexture()
    this._createPoolTileTexture()
    this._createCheckpointTexture()

    this.scene.start('MenuScene')
  }

  // Gerald with pink arm floaties overlaid on real sprite
  // We composite pink floatie circles on either side
  _createGeraldWithFloatiesTexture() {
    // We'll handle floaties as a visual overlay in Gerald.js instead
    // For now just alias the main texture - floaties drawn separately
    // This texture key is kept for compatibility
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xff69b4, 0)  // transparent placeholder
    g.fillRect(0, 0, 1, 1)
    g.generateTexture('gerald_floaties', 1, 1)
    g.destroy()
  }

  // Bubble: translucent circle
  _createBubbleTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xaaddff, 0.5)
    g.fillCircle(16, 16, 14)
    g.lineStyle(2, 0xffffff, 0.8)
    g.strokeCircle(16, 16, 14)
    g.fillStyle(0xffffff, 0.6)
    g.fillCircle(10, 10, 4)
    g.generateTexture('bubble', 32, 32)
    g.destroy()
  }

  // Pool coin: gold coin with G
  _createCoinTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffd700)
    g.fillCircle(16, 16, 14)
    g.lineStyle(2, 0xffaa00)
    g.strokeCircle(16, 16, 14)
    g.fillStyle(0xffaa00)
    g.fillRect(12, 10, 8, 2)
    g.fillRect(10, 12, 2, 8)
    g.fillRect(12, 18, 8, 2)
    g.fillRect(18, 15, 2, 5)
    g.generateTexture('coin', 32, 32)
    g.destroy()
  }

  // Cannonball wave
  _createWaveTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0x0044aa)
    g.fillEllipse(40, 24, 80, 30)
    g.fillStyle(0xffffff, 0.85)
    g.fillEllipse(40, 14, 76, 18)
    g.fillStyle(0xaaddff, 0.6)
    g.fillEllipse(40, 10, 60, 12)
    g.generateTexture('wave', 80, 40)
    g.destroy()
  }

  // Pool tile background
  _createPoolTileTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0x5bc8f5)
    g.fillRect(0, 0, 64, 64)
    g.lineStyle(1, 0x4aa8d0, 0.4)
    g.strokeRect(2, 2, 60, 60)
    g.generateTexture('pool_tile', 64, 64)
    g.destroy()
  }

  // Checkpoint: pool lane marker
  _createCheckpointTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffdd00)
    g.fillRect(0, 0, 16, 80)
    g.fillStyle(0xff4400)
    g.fillRect(0, 20, 16, 20)
    g.fillRect(0, 60, 16, 20)
    g.generateTexture('checkpoint', 16, 80)
    g.destroy()
  }
}
