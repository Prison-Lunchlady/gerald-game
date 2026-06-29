import Phaser from 'phaser'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  create() {
    // Initialize global game registry values
    this.registry.set('score', 0)
    this.registry.set('geraldPoints', 0)
    this.registry.set('purchasedUpgrades', [])
    this.registry.set('totalGeraldPointsEarned', 0)

    this.scene.start('PreloadScene')
  }
}
