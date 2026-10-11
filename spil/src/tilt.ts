// Steering wheel from device tilt. The iPad is held upright like a wheel, so steering is the
// rotation of gravity within the screen plane (atan2 of its x/y components) relative to the
// pose at calibration. Being relative and using both axes, it doesn't care whether the iPad
// is in portrait or either landscape, how far it leans back, or which sign convention the
// browser uses for gravity (iOS and the spec differ by flipping both axes, which cancels out).

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> }

const FULL_LOCK = (30 * Math.PI) / 180 // turning the wheel 30° gives full steering
const DEADZONE = (3 * Math.PI) / 180
const MIN_IN_PLANE = 3 // m/s²; below this the iPad is too flat for the angle to mean anything
// v2: the old setting belonged to the previous (wrong-axis) steering, so it starts fresh.
const INVERT_KEY = 'spil.tilt.invert.v2'

export class Tilt {
  /** Wheel angle in radians, unwrapped relative to `neutral`. */
  angle = 0
  neutral = 0
  supported = false
  invert = readInvert()
  /** Outcome of `enable()`, shown in the debug readout. */
  status = 'ikke startet'
  private listening = false

  /**
   * Must be called synchronously from a `click` handler. iOS only grants the permission
   * prompt on a completed tap (touchend/click) — calling it from pointerdown or touchstart
   * is rejected silently.
   */
  async enable(): Promise<boolean> {
    if (this.listening) return true
    if (!('DeviceMotionEvent' in globalThis)) {
      this.status = 'ikke understøttet'
      return false
    }
    const api = globalThis.DeviceMotionEvent as unknown as PermissionApi
    if (typeof api.requestPermission === 'function') {
      try {
        const result = await api.requestPermission()
        if (result !== 'granted') {
          this.status = `afvist (${result})`
          return false
        }
      } catch (err) {
        this.status = `fejl: ${err instanceof Error ? err.message : String(err)}`
        return false
      }
    }
    window.addEventListener('devicemotion', this.onMotion)
    this.listening = true
    this.status = 'tilladt'
    return true
  }

  calibrate() {
    this.neutral = this.angle
  }

  toggleInvert() {
    this.invert = !this.invert
    try {
      localStorage.setItem(INVERT_KEY, this.invert ? '1' : '0')
    } catch {
      // Private mode or blocked storage: the setting just won't stick.
    }
  }

  /** Wheel turn from straight ahead, in degrees (positive = right). */
  get degrees(): number {
    return (this.turn() * 180) / Math.PI
  }

  /** Steering in −1 (left) … 1 (right). */
  get steer(): number {
    const t = this.turn()
    if (Math.abs(t) < DEADZONE) return 0
    const v = (t - Math.sign(t) * DEADZONE) / (FULL_LOCK - DEADZONE)
    return Math.max(-1, Math.min(1, v))
  }

  private turn(): number {
    // Turning the device clockwise rotates gravity counter-clockwise in device coordinates,
    // so the angle decreases when steering right.
    const t = -(this.angle - this.neutral)
    return this.invert ? -t : t
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity
    if (!g || g.x == null || g.y == null) return
    this.supported = true
    if (Math.hypot(g.x, g.y) < MIN_IN_PLANE) return
    const a = Math.atan2(g.x, g.y)
    // Unwrap so crossing ±180° doesn't make the angle jump, then smooth lightly.
    let d = a - this.angle
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI
    this.angle += d * 0.5
  }
}

function readInvert(): boolean {
  try {
    return localStorage.getItem(INVERT_KEY) === '1'
  } catch {
    return false
  }
}
