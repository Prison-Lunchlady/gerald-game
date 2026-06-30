export const BUILD_VERSION = 'force-fix-1'
export const DEBUG_GERALD = true

export function debugLog(event, data = {}) {
  if (!DEBUG_GERALD) return
  try {
    console.log(`[gerald-debug] ${event}`, data)
  } catch {}
}

export function getSceneDebugSnapshot(scene, extra = {}) {
  const world = scene.physics && scene.physics.world
  const bodies = world && world.bodies && world.bodies.entries
  const tweens = scene.tweens && scene.tweens.getTweens ? scene.tweens.getTweens() : []
  const timers = scene.time && scene.time.getAllEvents ? scene.time.getAllEvents() : []
  const gerald = scene.gerald || null

  return {
    scene: scene.scene && scene.scene.key,
    levelId: scene.levelId || null,
    hazards: scene.hazardList ? scene.hazardList.length : 0,
    activeHazards: scene.hazardList ? scene.hazardList.filter(h => h && h.active).length : 0,
    tweens: tweens.length || 0,
    timers: timers.length || 0,
    physicsBodies: bodies ? bodies.length : 0,
    drownMeter: scene.drownMeter ?? null,
    gerald: gerald ? {
      x: Math.round(gerald.x),
      y: Math.round(gerald.y),
      vx: gerald.body ? Math.round(gerald.body.velocity.x) : null,
      vy: gerald.body ? Math.round(gerald.body.velocity.y) : null,
    } : null,
    activeForce: scene._lastAppliedForce || null,
    ...extra,
  }
}
