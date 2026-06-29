import { UPGRADES } from '../data/upgrades'

// UpgradeManager: handles purchase logic and state
// Attach to a scene or use statically with registry

export default class UpgradeManager {
  constructor(scene) {
    this.scene = scene
  }

  getPurchased() {
    return this.scene.registry.get('purchasedUpgrades') || []
  }

  hasPurchased(id) {
    return this.getPurchased().includes(id)
  }

  canAfford(id) {
    const upgrade = UPGRADES[id]
    if (!upgrade) return false
    const gp = this.scene.registry.get('geraldPoints') || 0
    return gp >= upgrade.cost
  }

  purchase(id) {
    if (this.hasPurchased(id)) return { success: false, reason: 'already_owned' }
    if (!this.canAfford(id)) return { success: false, reason: 'not_enough_points' }

    const upgrade = UPGRADES[id]
    const gp = this.scene.registry.get('geraldPoints') || 0
    this.scene.registry.set('geraldPoints', gp - upgrade.cost)

    const purchased = [...this.getPurchased(), id]
    this.scene.registry.set('purchasedUpgrades', purchased)

    return { success: true }
  }

  getAllUpgrades() {
    return Object.values(UPGRADES)
  }
}
