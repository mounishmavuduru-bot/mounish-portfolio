/**
 * Spring-physics particle simulation for the specimen point cloud.
 *
 * Every particle springs toward its target position; the pointer pushes
 * nearby particles away with a force that carries the pointer's velocity,
 * so swipes send particles flowing before they spring back.
 *
 * Hot path is allocation-free: all per-frame state lives in preallocated
 * typed arrays and scalar locals.
 */

export interface PointerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
}

/**
 * Tunable physics parameters. Every field is optional; omitted fields fall back
 * to the ORGAN_WORLD=9 defaults below so existing callers behave unchanged.
 */
export interface SimOpts {
  /** Spring stiffness toward target. */
  springK?: number;
  /** Velocity damping rate (per second, applied exponentially). */
  damping?: number;
  /** Pointer influence radius in world units. */
  pointerRadius?: number;
  /** Radial push strength inside the pointer radius. */
  pointerStrength?: number;
  /** Fraction of the pointer's velocity injected into nearby particles. */
  pointerVel?: number;
}

/** Defaults tuned for ORGAN_WORLD = 9 (large, immersive specimen). */
const DEFAULT_SPRING_K = 24;
const DEFAULT_DAMPING = 6.5;
const DEFAULT_POINTER_RADIUS = 2.2;
const DEFAULT_POINTER_STRENGTH = 34;
const DEFAULT_POINTER_VEL = 0.6;
/** Maximum integration step; larger frames are clamped, not subdivided. */
const MAX_DT = 0.033;

export class ParticleSim {
  /** Particle positions, length count * 3. Render this buffer directly. */
  readonly positions: Float32Array;

  private readonly count: number;
  private readonly velocities: Float32Array;
  private readonly targets: Float32Array;

  private readonly springK: number;
  private readonly damping: number;
  private readonly pointerRadius: number;
  private readonly pointerStrength: number;
  private readonly pointerVel: number;

  constructor(count: number, opts?: SimOpts) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.targets = new Float32Array(count * 3);

    this.springK = opts?.springK ?? DEFAULT_SPRING_K;
    this.damping = opts?.damping ?? DEFAULT_DAMPING;
    this.pointerRadius = opts?.pointerRadius ?? DEFAULT_POINTER_RADIUS;
    this.pointerStrength = opts?.pointerStrength ?? DEFAULT_POINTER_STRENGTH;
    this.pointerVel = opts?.pointerVel ?? DEFAULT_POINTER_VEL;
  }

  /**
   * Swap spring targets (drives the heart/brain morph).
   * Copies into the internal buffer; the caller keeps ownership of `targets`.
   */
  setTargets(targets: Float32Array): void {
    if (targets.length !== this.count * 3) {
      throw new RangeError(
        `setTargets expected length ${this.count * 3}, got ${targets.length}`,
      );
    }
    this.targets.set(targets);
  }

  /**
   * Advance the simulation. Per particle:
   * 1. spring acceleration springK * (target - pos)
   * 2. exponential damping: vel *= exp(-damping * dt)
   * 3. pointer force within pointerRadius: radial push (pointerStrength * smooth
   *    falloff) plus pointerVel * pointer velocity scaled by the same falloff
   * 4. integrate velocity, then position
   */
  update(dt: number, pointer: PointerState): void {
    if (!(dt > 0)) return;
    if (dt > MAX_DT) dt = MAX_DT;

    const pos = this.positions;
    const vel = this.velocities;
    const tgt = this.targets;
    const n = this.count * 3;

    const springK = this.springK;
    const damp = Math.exp(-this.damping * dt);
    const pushDt = this.pointerStrength * dt;
    const carryDt = this.pointerVel * dt;

    const pointerActive = pointer.active;
    const px = pointer.x;
    const py = pointer.y;
    const pz = pointer.z;
    const pvx = pointer.vx;
    const pvy = pointer.vy;
    const pvz = pointer.vz;
    const r = this.pointerRadius;
    const r2 = r * r;

    for (let i = 0; i < n; i += 3) {
      let x = pos[i];
      let y = pos[i + 1];
      let z = pos[i + 2];

      // 1. spring toward target
      let vx = vel[i] + springK * (tgt[i] - x) * dt;
      let vy = vel[i + 1] + springK * (tgt[i + 1] - y) * dt;
      let vz = vel[i + 2] + springK * (tgt[i + 2] - z) * dt;

      // 2. exponential damping
      vx *= damp;
      vy *= damp;
      vz *= damp;

      // 3. pointer force
      if (pointerActive) {
        const dx = x - px;
        const dy = y - py;
        const dz = z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2) {
          const d = Math.sqrt(d2);
          // smoothstep falloff: 1 at the pointer, 0 at the radius edge
          const q = 1 - d / r;
          const falloff = q * q * (3 - 2 * q);
          if (d > 1e-6) {
            // radial push away from the pointer
            const radial = (falloff * pushDt) / d;
            vx += dx * radial;
            vy += dy * radial;
            vz += dz * radial;
          }
          // carry the pointer's velocity into the particle
          vx += pvx * falloff * carryDt;
          vy += pvy * falloff * carryDt;
          vz += pvz * falloff * carryDt;
        }
      }

      // 4. integrate velocity, then position
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      vel[i] = vx;
      vel[i + 1] = vy;
      vel[i + 2] = vz;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
    }
  }
}
