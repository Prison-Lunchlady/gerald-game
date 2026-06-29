import Phaser from 'phaser'

export const COLLECTIBLE_TYPES = {
  bubble: {
    key: 'bubble',
    scoreBonus: 10,
    drownReduction: 12,  // was 8 — increased 50% so bubbles are more helpful
    geraldPoints: 0,
    floatAmplitude: 6,
    tint: null,
  },
  coin: {
    key: 'coin',
    scoreBonus: 0,
    drownReduction: 0,
    geraldPoints: 5,     // direct Gerald Points
    floatAmplitude: 4,
    tint: null,
  },
}

export default class Collectible extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type) {
    const def = COLLECTIBLE_TYPES[type]
    super(scene, x, y, def.key)
    this.collectibleType = type
    this.definition = def

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setImmovable(true)
    this.body.allowGravity = false
    this.setDepth(8)

    // Gentle float bob
    scene.tweens.add({
      targets: this,
      y: y - def.floatAmplitude,
      duration: Phaser.Math.Between(1100, 1500),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }
}
