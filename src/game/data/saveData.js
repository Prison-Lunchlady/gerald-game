import { LEVELS } from './levels'

const SAVE_KEY = 'gerald_save_v1'

export function loadSave() {
  try {
    const data = localStorage.getItem(SAVE_KEY)
    if (data) {
      // Spread defaults first so old saves pick up new fields
      return normalizeSave({ ...getDefaultSave(), ...JSON.parse(data) })
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

function normalizeSave(save) {
  const defaults = getDefaultSave()
  const validLevelIds = new Set(Object.keys(LEVELS))

  const completedLevels = Array.isArray(save.completedLevels)
    ? save.completedLevels.filter(id => validLevelIds.has(id))
    : defaults.completedLevels

  let unlockedLevels = Array.isArray(save.unlockedLevels)
    ? save.unlockedLevels.filter(id => validLevelIds.has(id) && !LEVELS[id].locked)
    : defaults.unlockedLevels
  if (!unlockedLevels.length) unlockedLevels = defaults.unlockedLevels

  return {
    ...defaults,
    ...save,
    geraldPoints: Number.isFinite(save.geraldPoints) ? save.geraldPoints : defaults.geraldPoints,
    totalScore: Number.isFinite(save.totalScore) ? save.totalScore : defaults.totalScore,
    purchasedUpgrades: Array.isArray(save.purchasedUpgrades) ? save.purchasedUpgrades : defaults.purchasedUpgrades,
    completedLevels,
    unlockedLevels,
    highScores: save.highScores && typeof save.highScores === 'object' ? save.highScores : defaults.highScores,
    pendingNextLevelId: validLevelIds.has(save.pendingNextLevelId) && !LEVELS[save.pendingNextLevelId].locked
      ? save.pendingNextLevelId
      : null,
    lastCompletedLevelId: validLevelIds.has(save.lastCompletedLevelId) ? save.lastCompletedLevelId : null,
  }
}

export function resetSave() {
  localStorage.removeItem(SAVE_KEY)
}
