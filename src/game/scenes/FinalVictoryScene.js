import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { debugLog } from '../debug'

export default class FinalVictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FinalVictoryScene' })
  }

  init(data) {
    this.finalScore = data.score || 0
    this.finalGP = data.geraldPoints || 0
    this.bonusGP = data.bonusGP || 0
  }

  create() {
    debugLog('FinalVictoryScene.create', {
      score: this.finalScore,
      geraldPoints: this.finalGP,
      bonusGP: this.bonusGP,
    })

    const bg = this.add.graphics()
    bg.fillGradientStyle(0x49c7ff, 0x49c7ff, 0x002766, 0x002766, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    bg.fillStyle(0xdde8f0, 1)
    bg.fillRect(0, 138, GAME_WIDTH, 12)

    for (let i = 0; i < 36; i++) {
      const bit = this.add.rectangle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(-40, GAME_HEIGHT / 2),
        Phaser.Math.Between(6, 14),
        Phaser.Math.Between(4, 10),
        Phaser.Utils.Array.GetRandom([0xffdd00, 0xff55aa, 0x55ffcc, 0xffffff, 0xff8844])
      )
      this.tweens.add({
        targets: bit,
        y: GAME_HEIGHT + 40,
        angle: Phaser.Math.Between(-360, 360),
        duration: Phaser.Math.Between(1800, 3600),
        delay: Phaser.Math.Between(0, 1600),
        repeat: -1,
      })
    }

    this.add.text(GAME_WIDTH / 2, 66, 'Gerald graduated', {
      fontSize: '30px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#003399',
      strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 104, 'pool school!', {
      fontSize: '38px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffdd00',
      stroke: '#aa5500',
      strokeThickness: 7,
    }).setOrigin(0.5)

    const gerald = this.add.image(GAME_WIDTH / 2, 232, 'gerald').setScale(1.65)
    this.tweens.add({
      targets: gerald,
      y: 222,
      angle: 8,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.add.text(GAME_WIDTH / 2, 320, 'Thanks for helping Gerald swim.', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#cceeff',
      align: 'center',
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 358, `Final Score: ${this.finalScore}   GP: ${this.finalGP}`, {
      fontSize: '15px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00',
      stroke: '#003366',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this._button(GAME_WIDTH / 2, 430, 'Play Again', '#006600', () => {
      debugLog('FinalVictoryScene.playAgain')
      this.registry.set('score', 0)
      this.scene.start('LevelScene', { levelId: 'shallow_end' })
    })

    this._button(GAME_WIDTH / 2, 486, "Gerald's Pool Bag", '#0055cc', () => {
      debugLog('FinalVictoryScene.shop')
      this.scene.start('UpgradeShopScene', { returnTo: 'Menu' })
    })

    this._button(GAME_WIDTH / 2, 542, 'Main Menu', '#003388', () => {
      debugLog('FinalVictoryScene.menu')
      this.scene.start('MenuScene')
    })
  }

  _button(x, y, label, bg, onClick) {
    const btn = this.add.text(x, y, label, {
      fontSize: '18px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      backgroundColor: bg,
      padding: { x: 20, y: 10 },
      stroke: '#001a33',
      strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setStyle({ color: '#ffdd00' }))
    btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }))
    btn.on('pointerdown', onClick)
    return btn
  }
}
