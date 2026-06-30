
import Phaser from 'phaser'

// Hazard type definitions
export const HAZARD_TYPES = {
  cannonball_wave: {
    drownIncrease: 12,
    speed: 200,
    scoreOnDodge: 10,
    closeCallDistance: 70,
    closeCallScore: 50,
    width: 42,
    height: 84,
  },
  floating_leaf: {
    drownIncrease: 1,
    speed: 68,
    scoreOnDodge: 5,
    closeCallDistance: 40,
    closeCallScore: 25,
    slowsGerald: true,
    width: 44,
    height: 20,
  },
  beach_ball: {
    drownIncrease: 3,
    speed: 90,
    scoreOnDodge: 10,
    closeCallDistance: 50,
    closeCallScore: 30,
    bouncesGerald: true,
    width: 36,
    height: 36,
  },
  kickboard: {
    drownIncrease: 3,
    speed: 92,
    scoreOnDodge: 10,
    closeCallDistance: 48,
    closeCallScore: 30,
    nudgesGerald: true,
    width: 58,
    height: 24,
  },
  floating_ring: {
    drownIncrease: 3,
    speed: 84,
    scoreOnDodge: 12,
    closeCallDistance: 54,
    closeCallScore: 35,
    slowsGerald: true,
    width: 52,
    height: 52,
  },
  splash_zone: {
    drownIncrease: 0,
    drownRate: 12,       // per-second damage during active phase only
    speed: 0,
    scoreOnDodge: 15,
    duration: 3500,      // total lifespan ms (1000 warning + 2000 active + 500 fade)
    width: 110,
    height: 110,
  },
  pool_jet: {
    drownIncrease: 0,
    drownRate: 5,        // per-second while inside strong current
    speed: 0,
    scoreOnDodge: 15,
    closeCallDistance: 70,
    closeCallScore: 40,
    width: 100,          // overridden per direction in constructor
    height: 125,
    duration: 4200,
  },
  vacuum_suction: {
    drownIncrease: 0,
    drownRateOuter: 0.8, // per-second in outer zone
    drownRateMiddle: 5.0,
    drownRateInner: 16,  // per-second in inner zone
    speed: 0,
    scoreOnDodge: 20,
    closeCallDistance: 100,
    closeCallScore: 55,
    width: 292,
    height: 292,
    outerRadius: 146,
    middleRadius: 88,
    innerRadius: 40,
    duration: 5600,
  },
}

// Plain JS class — NOT a Phaser.GameObjects.GameObject subclass.
// Each hazard owns an invisible physics rectangle for collision,
// plus a companion graphics object for the visible shape.
export default class Hazard {
  constructor(scene, x, y, type, opts = {}) {
    this.scene = scene
    this.hazardType = type
    this.definition = HAZARD_TYPES[type]
    const def = this.definition

    this.dodged = false
    this.hitGerald = false
    this.closeCallChecked = false
    this._dead = false
    this._leafOffsetY = 0
    this._warnTxt = null
    this._warningTween = null
    this._splashPhase = null
    this._splashScale = 1.0
    this._jetDir = 'down'
    this._jetStrength = 250
    this._jetPhase = null
    this._vacPhase = null
    this._vacStrength = 1.0
    this._txtShown = false  // debounce for per-frame floating text
    this._tweens = []

    // --- Type-specific pre-init (must happen before physics body + drawVisual) ---
    if (type === 'splash_zone') {
      this._splashPhase = 'warning'
      this._splashScale = opts.splashScale || 1.0
    } else if (type === 'pool_jet') {
      this._jetDir = opts.jetDir || 'down'
      this._jetStrength = opts.jetStrength || 250
      this._jetPhase = 'warning'
    } else if (type === 'vacuum_suction') {
      this._vacPhase = 'warning'
      this._vacStrength = opts.vacuumStrength || 1.0
    }

    // --- Physics body: size depends on type/direction ---
    let bodyW = def.width
    let bodyH = def.height
    if (type === 'pool_jet') {
      if (this._jetDir === 'down_left' || this._jetDir === 'down_right') {
        bodyW = 155
        bodyH = 155
      } else {
        bodyW = (this._jetDir === 'down') ? 100 : 170
        bodyH = (this._jetDir === 'down') ? 160 : 100
      }
    } else if (type === 'splash_zone' && this._splashScale !== 1.0) {
      bodyW = Math.round(def.width * this._splashScale)
      bodyH = Math.round(def.height * this._splashScale)
    }

    this._body = scene.add.rectangle(x, y, bodyW, bodyH, 0x000000, 0)
    scene.physics.add.existing(this._body)
    this._body.body.allowGravity = false
    this._body.setDepth(9)
    this._body.body.setVelocityX(0)
    this._body._hazardRef = this

    // --- Visual graphics ---
    this._gfx = scene.add.graphics().setDepth(10)
    this._gfx.setPosition(x, y)

    // Start pool_jet at low alpha during warning phase
    if (type === 'pool_jet') this._gfx.setAlpha(0.25)

    this._drawVisual()

    // ================================================================
    // PER-TYPE ANIMATIONS
    // ================================================================

    // WAVE: oscillating scale
    if (type === 'cannonball_wave') {
      this._addTween({
        targets: this._gfx,
        scaleX: 1.25, scaleY: 1.08,
        duration: 160, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }

    // LEAF: y-bobbing + slight rotation
    if (type === 'floating_leaf' || type === 'kickboard' || type === 'floating_ring') {
      this._addTween({
        targets: this, _leafOffsetY: 10,
        duration: 700, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.floor(Math.random() * 500),
      })
      this._addTween({
        targets: this._gfx, rotation: 0.18,
        duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }

    // BEACH BALL: continuous spin
    if (type === 'beach_ball' || type === 'floating_ring') {
      this._addTween({
        targets: this._gfx,
        rotation: Math.PI * 2,
        duration: 1000, repeat: -1, ease: 'Linear',
      })
    }

    // ================================================================
    // SPLASH ZONE: 2-phase (warning ripples -> active burst -> grow -> fade)
    // ================================================================
    if (type === 'splash_zone') {
      const sc = this._splashScale

      // Warning text
      this._warnTxt = scene.add.text(x, y - 68 * sc, 'SPLASH\nZONE!', {
        fontSize: '13px',
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00DDFF',
        stroke: '#003366',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5).setDepth(12)
      this._addTween({
        targets: this._warnTxt, alpha: 0.15,
        duration: 350, yoyo: true, repeat: -1,
      })

      // Warning phase pulsing ring
      this._warningTween = this._addTween({
        targets: this._gfx,
        scaleX: 1.2, scaleY: 1.2,
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })

      // Transition to active at 1000ms
      scene.time.delayedCall(1000, () => {
        if (this._dead) return
        this._splashPhase = 'active'
        if (this._warningTween) { this._warningTween.stop(); this._warningTween = null }
        // Fade out warning text
        if (this._warnTxt) {
          this._addTween({
            targets: this._warnTxt, alpha: 0, duration: 250,
            onComplete: () => {
              if (this._warnTxt) { try { this._warnTxt.destroy() } catch(e){} this._warnTxt = null }
            },
          })
        }
        // Redraw as active
        this._drawVisual()
        // Grow then fade out
        this._addTween({
          targets: this._gfx,
          scaleX: 1.55, scaleY: 1.55,
          duration: 1800, ease: 'Quad.easeIn',
          onComplete: () => {
            if (this._dead) return
            this._addTween({
              targets: this._gfx,
              scaleX: 0.8, scaleY: 0.8, alpha: 0,
              duration: 500, ease: 'Quad.easeOut',
            })
          },
        })
      })

      // Auto-destroy after total duration
      scene.time.delayedCall(def.duration || 3500, () => { this.destroy() })
    }

    // ================================================================
    // POOL JET: warning flash -> active stream
    // ================================================================
    if (type === 'pool_jet') {
      // Warning text
      const warnOffY = this._jetDir.startsWith('down') ? -80 : -50
      this._warnTxt = scene.add.text(x, y + warnOffY, 'JET!', {
        fontSize: '14px',
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00DDFF',
        stroke: '#001144',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5).setDepth(12)
      this._addTween({ targets: this._warnTxt, alpha: 0.15, duration: 300, yoyo: true, repeat: -1 })

      // Warning flash pulses, then goes active
      this._warningTween = this._addTween({
        targets: this._gfx, alpha: 0.45,
        duration: 280, yoyo: true, repeat: 2,
        onComplete: () => {
          if (this._dead) return
          this._warningTween = null
          this._jetPhase = 'active'
          // Fade out warning text
          if (this._warnTxt) {
            this._addTween({
              targets: this._warnTxt, alpha: 0, duration: 200,
              onComplete: () => {
                if (this._warnTxt) { try { this._warnTxt.destroy() } catch(e){} this._warnTxt = null }
              },
            })
          }
          // Ramp up to full visibility
          this._addTween({ targets: this._gfx, alpha: 0.9, duration: 150 })
          // Pulsing stream animation
          this._addTween({
            targets: this._gfx,
            scaleX: this._jetDir.startsWith('down') ? 1.05 : 1.0,
            scaleY: this._jetDir.startsWith('down') ? 1.0 : 1.05,
            duration: 280, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          })
        },
      })

      scene.time.delayedCall(def.duration || 4200, () => { this.destroy() })
    }

    // ================================================================
    // VACUUM SUCTION: warning spin -> active pull
    // ================================================================
    if (type === 'vacuum_suction') {
      // Warning text
      this._warnTxt = scene.add.text(x, y - 100, 'SUCTION!', {
        fontSize: '13px',
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#9966ff',
        stroke: '#110033',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5).setDepth(12)
      this._addTween({ targets: this._warnTxt, alpha: 0.15, duration: 350, yoyo: true, repeat: -1 })

      // Slow rotation during warning
      this._addTween({
        targets: this._gfx, rotation: Math.PI * 2,
        duration: 2200, repeat: -1, ease: 'Linear',
      })

      // Pulse warning gfx
      this._warningTween = this._addTween({
        targets: this._gfx, scaleX: 1.08, scaleY: 1.08,
        duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })

      // Transition to active at 800ms
      scene.time.delayedCall(800, () => {
        if (this._dead) return
        this._vacPhase = 'active'
        if (this._warnTxt) {
          this._addTween({
            targets: this._warnTxt, alpha: 0, duration: 200,
            onComplete: () => {
              if (this._warnTxt) { try { this._warnTxt.destroy() } catch(e){} this._warnTxt = null }
            },
          })
        }
      })

      scene.time.delayedCall(def.duration || 5000, () => { this.destroy() })
    }
  }

  _addTween(config) {
    const tween = this.scene.tweens.add(config)
    this._tweens.push(tween)
    return tween
  }

  // ================================================================
  // DRAW VISUAL — draws at local (0,0) = center of physics body
  // ================================================================
  _drawVisual() {
    const g = this._gfx
    g.clear()
    const type = this.hazardType

    // ---- POOL TORPEDO WAVE ----
    if (type === 'cannonball_wave') {
      const y = -8
      g.fillStyle(0xffe14a, 0.96)
      g.fillRoundedRect(-24, y - 9, 44, 18, 9)
      g.fillStyle(0xff6f3d, 0.96)
      g.fillCircle(20, y, 9)
      g.fillStyle(0x1bd1ff, 0.95)
      g.fillTriangle(-23, y - 9, -34, y - 18, -27, y)
      g.fillTriangle(-23, y + 9, -34, y + 18, -27, y)
      g.fillStyle(0x26d96c, 0.95)
      g.fillTriangle(-24, y - 6, -36, y, -24, y + 6)
      g.lineStyle(2, 0xf04c2f, 0.95)
      g.lineBetween(-9, y - 8, -9, y + 8)
      g.lineBetween(4, y - 8, 4, y + 8)
      g.fillStyle(0xffffff, 0.45)
      g.fillEllipse(10, y - 4, 14, 5)
      g.lineStyle(2, 0x1788bb, 0.72)
      for (let i = 0; i < 3; i++) {
        const yOff = 18 + i * 9
        g.lineBetween(-24 + i * 5, yOff, 24 - i * 4, yOff)
      }
      return
    }

    // ---- FLOATING LEAF ----
    if (type === 'floating_leaf') {
      g.fillStyle(0x33aa22, 0.9)
      g.fillEllipse(0, this._leafOffsetY, 44, 18)
      g.fillStyle(0x55cc33, 0.6)
      g.fillEllipse(-5, this._leafOffsetY - 2, 24, 10)
      g.lineStyle(1, 0x228800, 0.8)
      g.lineBetween(-18, this._leafOffsetY, 18, this._leafOffsetY)
      return
    }

    // ---- BEACH BALL ----
    if (type === 'beach_ball') {
      const colors = [0xff2222, 0xffee00, 0x2255ff, 0x22cc44]
      const r = 18
      for (let i = 0; i < 4; i++) {
        const startA = (i / 4) * Math.PI * 2
        const endA = ((i + 1) / 4) * Math.PI * 2
        g.fillStyle(colors[i], 1)
        g.slice(0, 0, r, startA, endA, false)
        g.fillPath()
      }
      g.lineStyle(1, 0xffffff, 0.5)
      g.strokeCircle(0, 0, r)
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(-5, -5, 5)
      return
    }

    // ---- KICKBOARD ----
    if (type === 'kickboard') {
      const y = this._leafOffsetY
      g.fillStyle(0x21d0c4, 0.97)
      g.fillRoundedRect(-32, -14 + y, 64, 28, 9)
      g.fillStyle(0x78f06d, 0.92)
      g.fillRoundedRect(-25, -10 + y, 50, 8, 4)
      g.fillStyle(0x006f80, 0.82)
      g.fillRoundedRect(-21, 3 + y, 14, 6, 3)
      g.fillRoundedRect(7, 3 + y, 14, 6, 3)
      g.lineStyle(2, 0x006f80, 0.78)
      g.strokeRoundedRect(-32, -14 + y, 64, 28, 9)
      g.lineStyle(2, 0xffffff, 0.55)
      g.lineBetween(-21, -9 + y, 21, -9 + y)
      return
    }

    // ---- FLOATING RING ----
    if (type === 'floating_ring') {
      const y = this._leafOffsetY
      g.lineStyle(9, 0xff55aa, 0.95)
      g.strokeCircle(0, y, 22)
      g.lineStyle(5, 0xffffff, 0.95)
      g.beginPath()
      g.arc(0, y, 22, -0.3, 0.55)
      g.strokePath()
      g.beginPath()
      g.arc(0, y, 22, Math.PI - 0.3, Math.PI + 0.55)
      g.strokePath()
      g.lineStyle(2, 0x991155, 0.75)
      g.strokeCircle(0, y, 22)
      return
    }

    // ---- SPLASH ZONE ----
    if (type === 'splash_zone') {
      const sc = this._splashScale
      const phase = this._splashPhase

      if (phase === 'warning') {
        // Outer warning ring
        g.lineStyle(3, 0x00ccff, 0.6)
        g.strokeCircle(0, 0, 52 * sc)
        // Dashed inner
        g.lineStyle(2, 0x0088cc, 0.4)
        g.strokeCircle(0, 0, 32 * sc)
        // Center dot
        g.fillStyle(0x00aaff, 0.5)
        g.fillCircle(0, 0, 8 * sc)
        // 4 outward arrows
        for (let a = 0; a < 4; a++) {
          const angle = (a / 4) * Math.PI * 2
          const x1 = Math.cos(angle) * 16 * sc
          const y1 = Math.sin(angle) * 16 * sc
          const x2 = Math.cos(angle) * 42 * sc
          const y2 = Math.sin(angle) * 42 * sc
          g.lineStyle(2, 0x00ccff, 0.7)
          g.lineBetween(x1, y1, x2, y2)
        }
      } else {
        // Active: bright burst fill
        g.fillStyle(0x00aaff, 0.25)
        g.fillCircle(0, 0, 55 * sc)
        g.fillStyle(0x00ddff, 0.4)
        g.fillCircle(0, 0, 30 * sc)
        g.fillStyle(0xffffff, 0.55)
        g.fillCircle(0, 0, 12 * sc)
        // Outer ring
        g.lineStyle(4, 0x00ffff, 0.85)
        g.strokeCircle(0, 0, 55 * sc)
        // 4 splash arms
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2
          const len = (a % 2 === 0) ? 38 * sc : 28 * sc
          const x2 = Math.cos(angle) * len
          const y2 = Math.sin(angle) * len
          g.lineStyle(2, 0x44ddff, 0.7)
          g.lineBetween(0, 0, x2, y2)
        }
      }
      return
    }

    // ---- POOL JET ----
    if (type === 'pool_jet') {
      const dir = this._jetDir

      if (dir === 'down' || dir === 'down_left' || dir === 'down_right') {
        // Nozzle housing (dark blue rectangle at top)
        g.fillStyle(0x002244, 0.95)
        g.fillRect(-35, -62, 70, 28)
        g.fillStyle(0x0044aa, 0.9)
        g.fillRect(-28, -55, 56, 20)
        // Nozzle tip
        g.fillStyle(0x0066cc, 1)
        g.fillRect(-22, -35, 44, 10)
        // Stream body (semi-transparent blue)
        g.fillStyle(0x00aaff, 0.32)
        g.fillRect(-22, -25, 44, 88)
        // 3 flow lines
        for (let i = 0; i < 3; i++) {
          const lx = -14 + i * 14
          g.lineStyle(2, 0x00ddff, 0.6)
          g.lineBetween(lx, -20, lx, 58)
        }
        // Chevrons pointing down (V shapes)
        for (let row = 0; row < 3; row++) {
          const cy = -5 + row * 25
          g.lineStyle(2, 0x00ffff, 0.7)
          g.lineBetween(-12, cy - 5, 0, cy + 5)
          g.lineBetween(0, cy + 5, 12, cy - 5)
        }
      } else if (dir === 'right') {
        // Nozzle housing on left side
        g.fillStyle(0x002244, 0.95)
        g.fillRect(-62, -35, 28, 70)
        g.fillStyle(0x0044aa, 0.9)
        g.fillRect(-55, -28, 20, 56)
        // Nozzle tip
        g.fillStyle(0x0066cc, 1)
        g.fillRect(-35, -22, 10, 44)
        // Stream body
        g.fillStyle(0x00aaff, 0.32)
        g.fillRect(-25, -22, 88, 44)
        // 3 flow lines
        for (let i = 0; i < 3; i++) {
          const ly = -14 + i * 14
          g.lineStyle(2, 0x00ddff, 0.6)
          g.lineBetween(-20, ly, 58, ly)
        }
        // > chevrons pointing right
        for (let col = 0; col < 3; col++) {
          const cx = -10 + col * 25
          g.lineStyle(2, 0x00ffff, 0.7)
          g.lineBetween(cx - 5, -12, cx + 5, 0)
          g.lineBetween(cx + 5, 0, cx - 5, 12)
        }
      } else {
        // dir === 'left'
        // Nozzle housing on right side
        g.fillStyle(0x002244, 0.95)
        g.fillRect(34, -35, 28, 70)
        g.fillStyle(0x0044aa, 0.9)
        g.fillRect(35, -28, 20, 56)
        // Nozzle tip
        g.fillStyle(0x0066cc, 1)
        g.fillRect(25, -22, 10, 44)
        // Stream body
        g.fillStyle(0x00aaff, 0.32)
        g.fillRect(-63, -22, 88, 44)
        // 3 flow lines
        for (let i = 0; i < 3; i++) {
          const ly = -14 + i * 14
          g.lineStyle(2, 0x00ddff, 0.6)
          g.lineBetween(-58, ly, 20, ly)
        }
        // < chevrons pointing left
        for (let col = 0; col < 3; col++) {
          const cx = 10 - col * 25
          g.lineStyle(2, 0x00ffff, 0.7)
          g.lineBetween(cx + 5, -12, cx - 5, 0)
          g.lineBetween(cx - 5, 0, cx + 5, 12)
        }
      }
      return
    }

    // ---- VACUUM SUCTION ----
    if (type === 'vacuum_suction') {
      const outer = this.definition.outerRadius || 130
      const middle = this.definition.middleRadius || 78
      const inner = this.definition.innerRadius || 34
      // 3 concentric circles
      g.fillStyle(0x330066, 0.2)
      g.fillCircle(0, 0, outer)
      g.lineStyle(3, 0x9933ff, 0.7)
      g.strokeCircle(0, 0, outer)

      g.fillStyle(0x550088, 0.3)
      g.fillCircle(0, 0, middle)
      g.lineStyle(2, 0xbb44ff, 0.8)
      g.strokeCircle(0, 0, middle)

      g.fillStyle(0x7700aa, 0.45)
      g.fillCircle(0, 0, inner)
      g.lineStyle(2, 0xdd66ff, 0.9)
      g.strokeCircle(0, 0, inner)

      // Center dot
      g.fillStyle(0xffffff, 0.8)
      g.fillCircle(0, 0, 11)

      // 4 inward arrows (axial)
      const arrowDirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      arrowDirs.forEach(([dx, dy]) => {
        const outerX = dx * (outer - 18)
        const outerY = dy * (outer - 18)
        const innerX = dx * (middle - 12)
        const innerY = dy * (middle - 12)
        g.lineStyle(3, 0xcc44ff, 0.9)
        g.lineBetween(outerX, outerY, innerX, innerY)
        // Arrow head
        const perpX = -dy * 7
        const perpY = dx * 7
        g.lineBetween(innerX, innerY, innerX + perpX + dx * 10, innerY + perpY + dy * 10)
        g.lineBetween(innerX, innerY, innerX - perpX + dx * 10, innerY - perpY + dy * 10)
      })

      // 4 diagonal hint lines (lighter)
      const diagDirs = [[1, -1], [1, 1], [-1, 1], [-1, -1]]
      diagDirs.forEach(([dx, dy]) => {
        const norm = Math.SQRT2
        const ox = dx * (outer - 28) / norm
        const oy = dy * (outer - 28) / norm
        const ix = dx * (middle - 18) / norm
        const iy = dy * (middle - 18) / norm
        g.lineStyle(1, 0xaa44ff, 0.4)
        g.lineBetween(ox, oy, ix, iy)
      })
      return
    }
  }

  // ================================================================
  // UPDATE — called from LevelScene.update() for moving hazards
  // ================================================================
  update(delta) {
    if (this._dead) return
    if (!this._body || !this._body.active) return

    if (this.definition.speed > 0) {
      this._body.setPosition(this._body.x - this.definition.speed * (delta / 1000), this._body.y)
    }

    const bx = this._body.x
    const by = this._body.y

    // Sync graphics position with physics body
    this._gfx.setPosition(bx, by)

    // Leaf vertical bobbing
    if ((this.hazardType === 'floating_leaf' || this.hazardType === 'kickboard' || this.hazardType === 'floating_ring') && this._leafOffsetY !== undefined) {
      this._gfx.setPosition(bx, by + this._leafOffsetY)
    }

    // Sync warning text
    if (this._warnTxt && this._warnTxt.active) {
      const def = this.definition
      let txtOffY = -68
      if (this.hazardType === 'splash_zone') txtOffY = -68 * this._splashScale
      if (this.hazardType === 'pool_jet') txtOffY = this._jetDir.startsWith('down') ? -80 : -50
      if (this.hazardType === 'vacuum_suction') txtOffY = -100
      this._warnTxt.setPosition(bx, by + txtOffY)
    }
  }

  // Convenience getters matching Phaser object interface
  get x() { return this._body ? this._body.x : 0 }
  get y() { return this._body ? this._body.y : 0 }
  get body() { return this._body ? this._body.body : null }
  get active() { return !this._dead && this._body && this._body.active }

  getPhysicsBody() {
    return this._body
  }

  getBounds() {
    if (!this._body || !this._body.active) return new Phaser.Geom.Rectangle(0, 0, 0, 0)
    return this._body.getBounds()
  }

  markDodged() {
    this.dodged = true
  }

  checkCloseCall(gerald) {
    if (this.closeCallChecked || !gerald || !this.definition.closeCallDistance) return false
    this.closeCallChecked = true
    const distance = Phaser.Math.Distance.Between(this.x, this.y, gerald.x, gerald.y)
    return distance <= this.definition.closeCallDistance
  }

  destroy() {
    if (this._dead) return
    this._dead = true
    this._tweens.forEach(tween => { try { tween.stop() } catch(e){} })
    this._tweens = []
    if (this._warningTween) { try { this._warningTween.stop() } catch(e){} this._warningTween = null }
    if (this._warnTxt) { try { this._warnTxt.destroy() } catch(e){} this._warnTxt = null }
    if (this._gfx) { try { this._gfx.destroy() } catch(e){} this._gfx = null }
    if (this._body) { try { this._body.destroy() } catch(e){} this._body = null }
  }
}
