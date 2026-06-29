const SAVE_KEY = 'gerald_save_v1'

export function loadSave() {
  try {
    const data = localStorage.getItem(SAVE_KEY)
    if (data) {
      // Spread defaults first so old saves pick up new fields
      return { ...getDefaultSave(), ...JSON.parse(data) }
    }
    return getDefaultSave()
  } catch { return getDefaultSave() }
}

export function saveSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch {}
}

export function getDefaultSave() {
  return {
    geraldPoints: 0,
    totalScore: 0,
    purchasedUpgrades: [],
    completedLevels: [],
    unlockedLevels: ['shallow_end'],
    highScores: {},
    campaignProgress: 0,
    pendingNextLevelId: null,
    lastCompletedLevelId: null,
  }
}

export function resetSave() {
  localStorage.removeItem(SAVE_KEY)
}
