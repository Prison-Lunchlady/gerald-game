import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { LEVELS, LEVEL_ORDER } from '../data/levels'
import { loadSave, saveSave, resetSave } from '../data/saveData'
import { BUILD_VERSION, debugLog } from '../debug'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    this.saveData = loadSave()
    debugLog('MenuScene.create', { build: BUILD_VERSION, save: this.saveData })

    // Determine Continue Game state
    const _s = this.saveData
    this._hasContinue = _s.completedLevels.length > 0 ||
                        _s.unlockedLevels.length > 1 ||
                        !!_s.pendingNextLevelId
    this._continueLevelId = _s.pendingNextLevelId ||
                            _s.unlockedLevels[_s.unlockedLevels.length - 1] ||
                            'shallow_end'

    this._drawPoolBackground()
    this._createWaterShimmer()

    this.add.text(GAME_WIDTH / 2, 90, 'WHAT SHOULD', {
      fontSize: '30px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', stroke: '#003399', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 128, 'GERALD DO?', {
      fontSize: '40px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffdd00', stroke: '#aa5500', strokeThickness: 7,
    }).setOrigin(0.5)

    const gerald = this.add.image(GAME_WIDTH / 2, 220, 'gerald').setScale(1.6)
    this.tweens.add({
      targets: gerald, y: 235, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    this.add.text(GAME_WIDTH / 2, 285, 'Gerald (he is a rock)', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#cceeff',
    }).setOrigin(0.5)

    // GP display
    const gp = this.saveData.geraldPoints || this.registry.get('geraldPoints') || 0
    if (gp > 0) {
      this.add.text(GAME_WIDTH / 2, 308, `Gerald Points: ${gp}`, {
        fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ffdd00',
      }).setOrigin(0.5)
    }

    // Continue Game button (shown if player has progress)
    if (this._hasContinue) {
      const contBtn = this.add.text(GAME_WIDTH / 2, 322, '> Continue Game', {
        fontSize: '17px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#ffdd00', backgroundColor: '#004400',
        padding: { x: 20, y: 9 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      contBtn.on('pointerover', () => contBtn.setStyle({ color: '#ffffff' }))
      contBtn.on('pointerout', () => contBtn.setStyle({ color: '#ffdd00' }))
      contBtn.on('pointerdown', () => {
        debugLog('MenuScene.continue', { levelId: this._continueLevelId })
        this.registry.set('score', 0)
        this.registry.set('geraldPoints', this.saveData.geraldPoints)
        this.registry.set('purchasedUpgrades', this.saveData.purchasedUpgrades || [])
        this.scene.start('LevelScene', { levelId: this._continueLevelId })
      })
    }

    // Level select panel
    this._drawLevelSelect()

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 84, 'SPACE / TAP = BOB UP   |   LEFT / RIGHT = MOVE', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#aaddff',
    }).setOrigin(0.5)

    // Pool bag button
    const shopBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 52, "Gerald's Pool Bag", {
      fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#003388',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    shopBtn.on('pointerover', () => shopBtn.setStyle({ color: '#ffdd00' }))
    shopBtn.on('pointerout', () => shopBtn.setStyle({ color: '#ffffff' }))
    shopBtn.on('pointerdown', () => {
      debugLog('MenuScene.shop', { returnTo: 'Menu' })
      this.scene.start('UpgradeShopScene', { returnTo: 'Menu' })
    })

    // ISSUE 12: New Game / Reset button (small, unobtrusive at very bottom)
    const newGameBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, 'New Game / Reset Progress', {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#445566',
      backgroundColor: '#000e1a', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    newGameBtn.on('pointerover', () => newGameBtn.setStyle({ color: '#8899aa' }))
    newGameBtn.on('pointerout', () => newGameBtn.setStyle({ color: '#445566' }))
    newGameBtn.on('pointerdown', () => this._showNewGameConfirm())

    this.add.text(GAME_WIDTH - 6, GAME_HEIGHT - 6, `Build: ${BUILD_VERSION}`, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#88aacc',
    }).setOrigin(1, 1).setDepth(80)
  }

  _drawLevelSelect() {
    const save = this.saveData
    const completed = save.completedLevels || []
    const playableLevels = LEVEL_ORDER.filter(id => LEVELS[id] && !LEVELS[id].comingSoon)

    let panelY = this._hasContinue ? 354 : 334
    const rowH = 20
    const panelH = rowH * playableLevels.length + 10
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x001a44, 0.7)
    panelBg.fillRoundedRect(16, panelY - 6, GAME_WIDTH - 32, panelH, 8)

    playableLevels.forEach((id, idx) => {
      const def = LEVELS[id]
      const isCompleted = completed.includes(id)
      const isUnlocked = def.unlockAfter === null || completed.includes(def.unlockAfter)
      const isNext = isUnlocked && !isCompleted

      const y = panelY + idx * rowH

      const icon = isCompleted ? '[OK]' : isUnlocked ? '>' : '[LOCK]'
      const color = isCompleted ? '#44ff88' : isUnlocked ? '#ffee00' : '#555577'
      const suffix = isCompleted && save.highScores[id] ? `  Best: ${save.highScores[id]}` : ''

      const txt = this.add.text(34, y + 2, `${icon} ${def.name}${suffix}`, {
        fontSize: '11px', fontFamily: 'Impact, Arial Black, sans-serif', color,
      }).setDepth(5)

      if (isUnlocked) {
        txt.setInteractive({ useHandCursor: true })
        txt.on('pointerover', () => txt.setStyle({ color: '#ffffff' }))
        txt.on('pointerout', () => txt.setStyle({ color }))
        txt.on('pointerdown', () => {
          debugLog('MenuScene.levelSelect', { levelId: id })
          this.registry.set('score', 0)
          this.registry.set('geraldPoints', this.saveData.geraldPoints)
          this.registry.set('purchasedUpgrades', this.saveData.purchasedUpgrades || [])
          this.scene.start('LevelScene', { levelId: id })
        })

        if (isNext) {
          const playLabel = this.add.text(GAME_WIDTH - 34, y + 1, 'PLAY', {
            fontSize: '10px', fontFamily: 'Impact, Arial Black, sans-serif',
            color: '#ffffff', backgroundColor: '#005500', padding: { x: 6, y: 3 },
          }).setOrigin(1, 0).setDepth(5).setInteractive({ useHandCursor: true })
          playLabel.on('pointerdown', () => {
            debugLog('MenuScene.playLabel', { levelId: id })
            this.registry.set('score', 0)
            this.registry.set('geraldPoints', this.saveData.geraldPoints)
            this.registry.set('purchasedUpgrades', this.saveData.purchasedUpgrades || [])
            this.scene.start('LevelScene', { levelId: id })
          })
        }
        if (isCompleted) {
          const replayLabel = this.add.text(GAME_WIDTH - 34, y + 1, 'REPLAY', {
            fontSize: '9px', fontFamily: 'Impact, Arial Black, sans-serif',
            color: '#aaffaa', backgroundColor: '#002200', padding: { x: 5, y: 3 },
          }).setOrigin(1, 0).setDepth(5).setInteractive({ useHandCursor: true })
          replayLabel.on('pointerover', () => replayLabel.setStyle({ color: '#ffffff' }))
          replayLabel.on('pointerout', () => replayLabel.setStyle({ color: '#aaffaa' }))
          replayLabel.on('pointerdown', () => {
            debugLog('MenuScene.replayLabel', { levelId: id })
            this.registry.set('score', 0)
            this.registry.set('geraldPoints', this.saveData.geraldPoints)
            this.registry.set('purchasedUpgrades', this.saveData.purchasedUpgrades || [])
            this.scene.start('LevelScene', { levelId: id })
          })
        }
      }
    })

  }

  // ISSUE 12: Confirmation dialog for New Game / Reset
  _showNewGameConfirm() {
    // Dark overlay
    const overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72
    ).setDepth(60).setInteractive()  // block clicks through

    const dBg = this.add.graphics().setDepth(61)
    dBg.fillStyle(0x001428, 1)
    dBg.fillRoundedRect(36, GAME_HEIGHT / 2 - 108, GAME_WIDTH - 72, 216, 14)
    dBg.lineStyle(2, 0x4488cc, 1)
    dBg.strokeRoundedRect(36, GAME_HEIGHT / 2 - 108, GAME_WIDTH - 72, 216, 14)

    const dTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 84, 'Start over from the shallow end?', {
      fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#cce0ff', align: 'center', wordWrap: { width: GAME_WIDTH - 90 },
    }).setOrigin(0.5).setDepth(62)

    const dSub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 56, 'Gerald Points and purchases are optional to keep.', {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#7799aa', align: 'center',
    }).setOrigin(0.5).setDepth(62)

    const btnResetLevels = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20,
      '[Restart Levels Only]', {
      fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#004400', padding: { x: 14, y: 9 },
    }).setOrigin(0.5).setDepth(62).setInteractive({ useHandCursor: true })

    const btnFull = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24,
      '[Full Reset - lose everything]', {
      fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffaaaa', backgroundColor: '#440000', padding: { x: 14, y: 9 },
    }).setOrigin(0.5).setDepth(62).setInteractive({ useHandCursor: true })

    const btnCancel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 72,
      '[Cancel]', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#aaddff',
      backgroundColor: '#001a33', padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setDepth(62).setInteractive({ useHandCursor: true })

    const destroyDialog = () => {
      overlay.destroy(); dBg.destroy(); dTitle.destroy(); dSub.destroy()
      btnResetLevels.destroy(); btnFull.destroy(); btnCancel.destroy()
    }

    btnResetLevels.on('pointerover', () => btnResetLevels.setStyle({ color: '#ffdd00' }))
    btnResetLevels.on('pointerout', () => btnResetLevels.setStyle({ color: '#ffffff' }))
    btnResetLevels.on('pointerdown', () => {
      debugLog('MenuScene.resetLevels')
      // Keep GP and upgrades, reset only level progress
      const save = loadSave()
      save.completedLevels = []
      save.unlockedLevels = ['shallow_end']
      save.pendingNextLevelId = null
      save.lastCompletedLevelId = null
      save.campaignProgress = 0
      saveSave(save)
      destroyDialog()
      this.scene.restart()
    })

    btnFull.on('pointerover', () => btnFull.setStyle({ color: '#ffffff' }))
    btnFull.on('pointerout', () => btnFull.setStyle({ color: '#ffaaaa' }))
    btnFull.on('pointerdown', () => {
      debugLog('MenuScene.fullReset')
      resetSave()
      destroyDialog()
      this.scene.restart()
    })

    btnCancel.on('pointerover', () => btnCancel.setStyle({ color: '#ffffff' }))
    btnCancel.on('pointerout', () => btnCancel.setStyle({ color: '#aaddff' }))
    btnCancel.on('pointerdown', () => destroyDialog())
  }

  _drawPoolBackground() {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x4fc3f7, 0x4fc3f7, 1)
    bg.fillRect(0, 0, GAME_WIDTH, 160)
    bg.fillGradientStyle(0x29b6f6, 0x29b6f6, 0x0277bd, 0x0277bd, 1)
    bg.fillRect(0, 160, GAME_WIDTH, GAME_HEIGHT - 160)
    bg.fillStyle(0x80cce0)
    bg.fillRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 40)
    bg.fillStyle(0xdde8f0)
    bg.fillRect(0, 155, GAME_WIDTH, 12)
  }

  _createWaterShimmer() {
    for (let i = 0; i < 8; i++) {
      const sparkle = this.add.text(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(200, GAME_HEIGHT - 80),
        '*', { fontSize: '16px', color: '#ffffff', alpha: 0.4 }
      )
      this.tweens.add({
        targets: sparkle, alpha: 0.1,
        duration: Phaser.Math.Between(800, 2000),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
      })
    }
  }
}
