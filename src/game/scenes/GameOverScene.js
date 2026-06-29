import Phaser from 'phaser'
import { getRandomGameOverMessage } from '../data/gameOverMessages'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' })
  }

  init(data) {
    this.finalScore = data.score || 0
    this.finalGP = data.geraldPoints || 0
    this.levelId = data.levelId || 'shallow_end'
  }

  create() {
    const overlay = this.add.graphics()
    overlay.fillStyle(0x000033, 0.85)
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Sinking bubbles
    for (let i = 0; i < 12; i++) {
      const b = this.add.circle(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(100, GAME_HEIGHT - 50),
        Phaser.Math.Between(3, 9), 0x4499ff, 0.4
      )
      this.tweens.add({
        targets: b, y: b.y - Phaser.Math.Between(80, 200), alpha: 0,
        duration: Phaser.Math.Between(2000, 4000),
        delay: Phaser.Math.Between(0, 2000), repeat: -1,
      })
    }

    this.add.text(GAME_WIDTH / 2, 70, '💧 DROWNED! 💧', {
      fontSize: '34px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#4499ff', stroke: '#000033', strokeThickness: 6,
    }).setOrigin(0.5)

    const geraldImg = this.add.image(GAME_WIDTH / 2, 170, 'gerald').setScale(1.7).setAlpha(0.7)
    this.tweens.add({
      targets: geraldImg, y: 195, angle: 18,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    const msg = getRandomGameOverMessage()
    this.add.text(GAME_WIDTH / 2, 270, `"${msg}"`, {
      fontSize: '14px', fontFamily: 'Arial, sans-serif',
      color: '#aaddff', wordWrap: { width: GAME_WIDTH - 60 },
      align: 'center', fontStyle: 'italic',
    }).setOrigin(0.5)

    // Stats panel
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x001133, 0.7)
    panelBg.fillRoundedRect(GAME_WIDTH / 2 - 120, 318, 240, 90, 10)

    this.add.text(GAME_WIDTH / 2, 338, `Final Score: ${this.finalScore}`, {
      fontSize: '22px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00', stroke: '#664400', strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 368, `Gerald Points Earned: ${this.finalGP} 💰`, {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#ffdd88',
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 390, `💰 Total GP: ${this.registry.get('geraldPoints') || this.finalGP}`, {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#aabbcc',
    }).setOrigin(0.5)

    // Replay button
    const restartBtn = this.add.text(GAME_WIDTH / 2, 450, '🔁 TRY AGAIN', {
      fontSize: '24px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#cc2200',
      padding: { x: 24, y: 12 }, stroke: '#660000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    restartBtn.on('pointerover', () => restartBtn.setStyle({ color: '#ffdd00' }))
    restartBtn.on('pointerout', () => restartBtn.setStyle({ color: '#ffffff' }))
    restartBtn.on('pointerdown', () => {
      this.registry.set('score', 0)
      this.scene.start('LevelScene', { levelId: this.levelId })
    })

    // Pool Bag button
    const shopBtn = this.add.text(GAME_WIDTH / 2, 518, "🎒 GERALD'S POOL BAG", {
      fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#0055bb',
      padding: { x: 18, y: 10 }, stroke: '#002277', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    shopBtn.on('pointerover', () => shopBtn.setStyle({ color: '#ffdd00' }))
    shopBtn.on('pointerout', () => shopBtn.setStyle({ color: '#ffffff' }))
    shopBtn.on('pointerdown', () => { this.scene.start('UpgradeShopScene', { returnTo: 'GameRetry' }) })

    this.add.text(GAME_WIDTH / 2, 578, '← Main Menu', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#aaaaff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    .on('pointerdown', () => this.scene.start('MenuScene'))
  }
}
