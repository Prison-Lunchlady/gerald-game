import Phaser from 'phaser'
import { UPGRADES } from '../data/upgrades'
import { LEVELS } from '../data/levels'
import { loadSave, saveSave } from '../data/saveData'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { debugLog } from '../debug'

export default class UpgradeShopScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UpgradeShopScene' })
  }

  init(data) {
    this.returnTo = data.returnTo || 'NextRun'
  }

  create() {
    this.saveData = loadSave()
    debugLog('UpgradeShopScene.create', { returnTo: this.returnTo, save: this.saveData })
    this._syncFromSave()
    this._drawBackground()
    this._drawHeader()
    this._drawUpgradeCards()
    this._drawFooter()
  }

  _syncFromSave() {
    this.registry.set('geraldPoints', this.saveData.geraldPoints)
    this.registry.set('purchasedUpgrades', this.saveData.purchasedUpgrades || [])
  }

  _drawBackground() {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x1a3a5c, 0x1a3a5c, 0x0a2040, 0x0a2040, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  }

  _drawHeader() {
    this.add.text(GAME_WIDTH / 2, 36, "GERALD'S POOL BAG", {
      fontSize: '24px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffee00', stroke: '#664400', strokeThickness: 5,
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 62, 'Spend your hard-earned Gerald Points here.', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#99ccff',
    }).setOrigin(0.5)

    this.gpDisplay = this.add.text(GAME_WIDTH / 2, 86, '', {
      fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif', color: '#ffdd00',
    }).setOrigin(0.5)
    this._refreshGPDisplay()
  }

  _refreshGPDisplay() {
    this.gpDisplay.setText(`GP: ${this.saveData.geraldPoints} Gerald Points`)
  }

  _drawUpgradeCards() {
    const mainUpgrades = ['tiny_arm_floaties', 'better_bob', 'pool_noodle_belt', 'wave_resistance', 'jet_resistance', 'vacuum_escape']
    const completed = this.saveData.completedLevels || []
    const purchased = this.saveData.purchasedUpgrades || []

    if (this._cardContainer) this._cardContainer.destroy(true)
    if (this._shopMaskShape) this._shopMaskShape.destroy()
    if (this._scrollButtons) {
      this._scrollButtons.forEach(btn => { try { btn.destroy() } catch {} })
    }
    this._scrollButtons = []
    this._shopScrollY = this._shopScrollY || 0

    const listTop = 106
    const listBottom = GAME_HEIGHT - 106
    const listH = listBottom - listTop
    const cardH = 72
    const cardGap = 8
    const totalH = mainUpgrades.length * (cardH + cardGap) - cardGap
    const minScroll = Math.min(0, listH - totalH)

    this._cardContainer = this.add.container(0, listTop)
    this._shopMaskShape = this.add.graphics()
    this._shopMaskShape.fillStyle(0xffffff)
    this._shopMaskShape.fillRect(0, listTop, GAME_WIDTH, listH)
    this._shopMaskShape.setVisible(false)
    this._cardContainer.setMask(this._shopMaskShape.createGeometryMask())

    const startY = 0
    const cardW = GAME_WIDTH - 40
    const cardX = 20

    mainUpgrades.forEach((id, i) => {
      const upgrade = UPGRADES[id]
      if (!upgrade) return
      const y = startY + i * (cardH + cardGap)
      const isPurchased = purchased.includes(id)
      const isUnlocked = !upgrade.unlockAfterLevel || completed.includes(upgrade.unlockAfterLevel)
      const canAfford = this.saveData.geraldPoints >= upgrade.cost

      const cardBg = this.add.graphics()
      if (isPurchased) cardBg.fillStyle(0x004422, 0.9)
      else if (!isUnlocked) cardBg.fillStyle(0x111122, 0.8)
      else if (canAfford) cardBg.fillStyle(0x003366, 0.9)
      else cardBg.fillStyle(0x1a1a2e, 0.8)
      cardBg.fillRoundedRect(cardX, y, cardW, cardH, 8)
      cardBg.lineStyle(2, isPurchased ? 0x44cc88 : isUnlocked ? 0x2277dd : 0x223355)
      cardBg.strokeRoundedRect(cardX, y, cardW, cardH, 8)
      this._cardContainer.add(cardBg)

      const swatch = this.add.graphics()
      swatch.fillStyle(upgrade.color || 0xff69b4)
      swatch.fillCircle(cardX + 26, y + cardH / 2, 14)
      this._cardContainer.add(swatch)

      const icon = this.add.text(cardX + 26, y + cardH / 2, upgrade.icon || '?', {
        fontSize: '16px',
      }).setOrigin(0.5)
      this._cardContainer.add(icon)

      const title = this.add.text(cardX + 48, y + 8, upgrade.name, {
        fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: isPurchased ? '#44ff88' : isUnlocked ? '#ffffff' : '#445566',
      })
      this._cardContainer.add(title)

      const desc = this.add.text(cardX + 48, y + 26, upgrade.description, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif',
        color: isUnlocked ? '#aabbcc' : '#334455',
        wordWrap: { width: cardW - 130 },
      })
      this._cardContainer.add(desc)

      if (isPurchased) {
        const owned = this.add.text(cardX + cardW - 14, y + cardH / 2, 'OWNED', {
          fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif', color: '#44ff88',
        }).setOrigin(1, 0.5)
        this._cardContainer.add(owned)
      } else if (!isUnlocked) {
        const lockLevel = LEVELS[upgrade.unlockAfterLevel]
        const lockName = lockLevel ? lockLevel.name : upgrade.unlockAfterLevel
        const locked = this.add.text(cardX + cardW - 14, y + cardH / 2, `Beat: ${lockName}`, {
          fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#445566',
        }).setOrigin(1, 0.5)
        this._cardContainer.add(locked)
      } else {
        const cost = this.add.text(cardX + cardW - 14, y + 16, `${upgrade.cost} GP`, {
          fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
          color: canAfford ? '#ffdd00' : '#886655',
        }).setOrigin(1, 0.5)
        this._cardContainer.add(cost)

        if (canAfford) {
          const buyBtn = this.add.text(cardX + cardW - 14, y + 48, '[ BUY ]', {
            fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
            color: '#ffffff', backgroundColor: '#0055cc', padding: { x: 7, y: 4 },
          }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
          this._cardContainer.add(buyBtn)
          buyBtn.on('pointerover', () => buyBtn.setStyle({ color: '#ffdd00' }))
          buyBtn.on('pointerout', () => buyBtn.setStyle({ color: '#ffffff' }))
          buyBtn.on('pointerdown', () => {
            debugLog('UpgradeShopScene.buy', { upgradeId: id })
            this.saveData.geraldPoints -= upgrade.cost
            this.saveData.purchasedUpgrades.push(id)
            saveSave(this.saveData)
            this._syncFromSave()
            this._refreshGPDisplay()
            this._drawUpgradeCards()
          })
        } else {
          const notEnough = this.add.text(cardX + cardW - 14, y + 48, 'NOT ENOUGH GP', {
            fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#664444',
          }).setOrigin(1, 0.5)
          this._cardContainer.add(notEnough)
        }
      }
    })

    const applyScroll = () => {
      this._shopScrollY = Phaser.Math.Clamp(this._shopScrollY, minScroll, 0)
      this._cardContainer.y = listTop + this._shopScrollY
    }
    applyScroll()

    this.input.off('wheel')
    this.input.on('wheel', (_pointer, _objects, _dx, dy) => {
      this._shopScrollY -= dy * 0.35
      applyScroll()
    })

    if (totalH > listH) {
      const upBtn = this.add.text(GAME_WIDTH - 22, listTop + 8, '^', {
        fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#88ccff', backgroundColor: '#001a33', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setDepth(70).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this._shopScrollY += 72; applyScroll() })

      const downBtn = this.add.text(GAME_WIDTH - 22, listBottom - 8, 'v', {
        fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#88ccff', backgroundColor: '#001a33', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setDepth(70).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this._shopScrollY -= 72; applyScroll() })
      this._scrollButtons.push(upBtn, downBtn)
    }
  }

  _drawFooter() {
    const footerBand = this.add.graphics().setDepth(75)
    footerBand.fillStyle(0x071933, 0.95)
    footerBand.fillRect(0, GAME_HEIGHT - 102, GAME_WIDTH, 102)
    footerBand.lineStyle(1, 0x225588, 0.8)
    footerBand.lineBetween(0, GAME_HEIGHT - 102, GAME_WIDTH, GAME_HEIGHT - 102)

    const footerY = GAME_HEIGHT - 66

    const continueBtn = this.add.text(GAME_WIDTH / 2, footerY, 'KEEP SWIMMING', {
      fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff', backgroundColor: '#0055cc',
      padding: { x: 20, y: 10 }, stroke: '#002266', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(80).setInteractive({ useHandCursor: true })
    continueBtn.on('pointerover', () => continueBtn.setStyle({ color: '#ffdd00' }))
    continueBtn.on('pointerout', () => continueBtn.setStyle({ color: '#ffffff' }))
    continueBtn.on('pointerdown', () => {
      const save = loadSave()
      const unlockedLevels = save.unlockedLevels || ['shallow_end']
      const nextLevel = save.pendingNextLevelId
        || unlockedLevels[unlockedLevels.length - 1]
        || 'shallow_end'
      debugLog('UpgradeShopScene.continue', { returnTo: this.returnTo, nextLevel })
      this.registry.set('score', 0)
      this.registry.set('purchasedUpgrades', save.purchasedUpgrades || [])
      this.scene.start('LevelScene', { levelId: nextLevel })
    })

    this.add.text(GAME_WIDTH / 2, footerY + 34, 'Main Menu', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#6699cc',
    }).setOrigin(0.5).setDepth(80).setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      debugLog('UpgradeShopScene.menu')
      this.scene.start('MenuScene')
    })
  }
}
