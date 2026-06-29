import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { LEVELS, LEVEL_ORDER } from '../data/levels'
import { loadSave } from '../data/saveData'

// ISSUE 3: Level-specific completion messages
const COMPLETION_MESSAGES = {
  shallow_end: "Gerald survived the shallow end.",
  floatie_training: "Gerald learned what floaties are. Sorta.",
  bubble_basics: "Gerald has discovered bubbles.",
  splash_zone: "Gerald survived the splash zone.",
  pool_jet_panic: "Gerald escaped the pool jets.",
  vacuum_trouble: "Gerald avoided becoming pool debris.",
  deep_end_warning: "Gerald reached the deep end.",
  boss_suck_o_matic: "Gerald defeated the Suck-O-Matic 3000!",
}

export default class WinScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WinScene' })
  }

  init(data) {
    this.finalScore = data.score || 0
    this.finalGP = data.geraldPoints || 0
    this.bonusGP = data.bonusGP || 0
    this.levelId = data.levelId || 'shallow_end'
    this.nextLevelId = data.nextLevelId || null
  }

  create() {
    // Also read pendingNextLevelId from save in case it was updated
    const save = loadSave()
    const nextLevelId = this.nextLevelId || save.pendingNextLevelId || null

    const bg = this.add.graphics()
    bg.fillGradientStyle(0x00aaff, 0x00aaff, 0x0044cc, 0x0044cc, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Confetti
    const colors = [0xffdd00, 0xff4444, 0x44ff88, 0xff88ff, 0xffffff]
    for (let i = 0; i < 30; i++) {
      const conf = this.add.rectangle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(-20, GAME_HEIGHT / 2),
        Phaser.Math.Between(6, 14), Phaser.Math.Between(4, 10),
        Phaser.Utils.Array.GetRandom(colors)
      )
      this.tweens.add({
        targets: conf, y: GAME_HEIGHT + 40,
        angle: Phaser.Math.Between(-360, 360),
        duration: Phaser.Math.Between(1800, 3500),
        delay: Phaser.Math.Between(0, 2000),
        repeat: -1,
      })
    }

    const levelName = LEVELS[this.levelId] ? LEVELS[this.levelId].name : this.levelId
    // ISSUE 3: Get level-specific completion message
    const completionMsg = COMPLETION_MESSAGES[this.levelId] || 'Gerald made it!'

    // ISSUE 4: Title at top (y=40), ABOVE Gerald. Higher depth so it renders over Gerald.
    this.add.text(GAME_WIDTH / 2, 42, 'LEVEL COMPLETE!', {
      fontSize: '24px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00',
      stroke: '#004499',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20)

    this.add.text(GAME_WIDTH / 2, 74, levelName.toUpperCase(), {
      fontSize: '16px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ccffff',
      stroke: '#002255',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20)

    // ISSUE 3: Completion message
    this.add.text(GAME_WIDTH / 2, 98, completionMsg, {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaddff',
      fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(20)

    // ISSUE 4: Gerald image lower (y=258), below the title text
    const geraldImg = this.add.image(GAME_WIDTH / 2, 258, 'gerald').setScale(1.8).setDepth(5)
    this.tweens.add({
      targets: geraldImg, y: 245, angle: 10,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // Stats panel
    const panelBg = this.add.graphics().setDepth(8)
    panelBg.fillStyle(0x001a44, 0.75)
    panelBg.fillRoundedRect(GAME_WIDTH / 2 - 140, 330, 280, 130, 14)

    this.add.text(GAME_WIDTH / 2, 350, 'RESULTS', {
      fontSize: '12px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#99ccff', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(12)

    this.add.text(GAME_WIDTH / 2, 374, `Score: ${this.finalScore}`, {
      fontSize: '22px', fontFamily: 'Impact, Arial Black, sans-serif', color: '#ffee00',
    }).setOrigin(0.5).setDepth(12)

    this.add.text(GAME_WIDTH / 2, 400, `+ ${this.bonusGP} Bonus Gerald Points`, {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
    }).setOrigin(0.5).setDepth(12)

    this.add.text(GAME_WIDTH / 2, 422, `Total Gerald Points: ${this.finalGP}`, {
      fontSize: '15px', fontFamily: 'Impact, Arial Black, sans-serif', color: '#ffdd00',
    }).setOrigin(0.5).setDepth(12)

    // Determine next level availability
    const nextLevelDef = nextLevelId ? LEVELS[nextLevelId] : null
    const canPlayNext = nextLevelDef && !nextLevelDef.locked

    let nextBtnY = 472

    if (canPlayNext) {
      // ISSUE 5: Next level button uses the correct nextLevelId
      const nextBtn = this.add.text(GAME_WIDTH / 2, nextBtnY, `>> NEXT: ${nextLevelDef.name.toUpperCase()}`, {
        fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#ffffff', backgroundColor: '#006600',
        padding: { x: 20, y: 12 }, stroke: '#003300', strokeThickness: 4,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(12)
      nextBtn.on('pointerover', () => nextBtn.setStyle({ color: '#ffdd00' }))
      nextBtn.on('pointerout', () => nextBtn.setStyle({ color: '#ffffff' }))
      nextBtn.on('pointerdown', () => {
        this.registry.set('score', 0)
        this.scene.start('LevelScene', { levelId: nextLevelId })
      })
    } else if (nextLevelDef) {
      // ISSUE 6: Coming Soon button when next level is locked
      const comingSoonBtn = this.add.text(GAME_WIDTH / 2, nextBtnY,
        `COMING SOON: ${nextLevelDef.name.toUpperCase()}`, {
        fontSize: '15px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#888899', backgroundColor: '#001133',
        padding: { x: 16, y: 10 }, stroke: '#334455', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(12)

      comingSoonBtn.on('pointerdown', () => {
        // Show a small popup message
        const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setDepth(50)
        const popupBg = this.add.graphics().setDepth(51)
        popupBg.fillStyle(0x001a44, 1)
        popupBg.fillRoundedRect(30, GAME_HEIGHT / 2 - 70, GAME_WIDTH - 60, 140, 12)
        popupBg.lineStyle(2, 0x4488cc)
        popupBg.strokeRoundedRect(30, GAME_HEIGHT / 2 - 70, GAME_WIDTH - 60, 140, 12)
        const popupTxt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24,
          `${nextLevelDef.name} is coming soon!\nReplay earlier levels to\nearn more Gerald Points.`, {
          fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ccddff',
          align: 'center', wordWrap: { width: GAME_WIDTH - 80 },
        }).setOrigin(0.5).setDepth(52)
        const closeBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, '[ OK ]', {
          fontSize: '15px', color: '#ffffff', backgroundColor: '#003388',
          padding: { x: 16, y: 7 }, fontFamily: 'Impact, Arial Black, sans-serif',
        }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true })
        closeBtn.on('pointerdown', () => {
          overlay.destroy(); popupBg.destroy(); popupTxt.destroy(); closeBtn.destroy()
        })
      })
    }

    const shopBtnY = canPlayNext ? 528 : (nextLevelDef ? 526 : 480)
    const shopBtn = this.add.text(GAME_WIDTH / 2, shopBtnY, "GERALD'S POOL BAG", {
      fontSize: '17px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#0055cc',
      padding: { x: 18, y: 10 }, stroke: '#002266', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(12)
    shopBtn.on('pointerover', () => shopBtn.setStyle({ color: '#ffdd00' }))
    shopBtn.on('pointerout', () => shopBtn.setStyle({ color: '#ffffff' }))
    shopBtn.on('pointerdown', () => { this.scene.start('UpgradeShopScene', { returnTo: 'NextRun' }) })

    const replayBtnY = shopBtnY + 52
    const replayBtn = this.add.text(GAME_WIDTH / 2, replayBtnY, 'Replay Level', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#aaddff',
      backgroundColor: '#001133', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(12)
    replayBtn.on('pointerdown', () => {
      this.registry.set('score', 0)
      this.scene.start('LevelScene', { levelId: this.levelId })
    })

    this.add.text(GAME_WIDTH / 2, replayBtnY + 38, '< Main Menu', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#6699cc',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(12)
    .on('pointerdown', () => this.scene.start('MenuScene'))
  }
}
