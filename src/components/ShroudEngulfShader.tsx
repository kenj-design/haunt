/**
 * The fog that swallows the screen when a haunt is released.
 *
 * A companion to `HoldToRelease`: it gathers in the orb as the press begins,
 * floods outward as the hold goes on, and once released it stays — a full,
 * living cover the drop screen's confirmation is read against. Separate from
 * `HauntShader` because it is driven by a progress value rather than by time
 * alone: the flood has to arrive exactly when the interaction does.
 *
 * It covers its own box rather than the window, which on a phone is the same
 * thing and inside the desktop phone frame is not.
 */
import { useEffect, useRef } from 'react'

interface ShroudEngulfShaderProps {
  holding: boolean
  released: boolean
  duration?: number
  onComplete?: () => void
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_origin;
  uniform float u_time;
  uniform float u_progress;
  uniform float u_dpr;

  float hash(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(point);
      point = turn * point * 2.03 + 13.7;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 coord = gl_FragCoord.xy;
    vec2 diff = coord - u_origin;
    float dist = length(diff);

    if (u_progress <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float orbRadius = 66.0 * u_dpr;
    float maxRadius = length(u_resolution) * 1.35;
    float currentRadius;
    if (u_progress < 0.35) {
      float subP = u_progress / 0.35;
      currentRadius = (6.0 * u_dpr) + pow(subP, 1.4) * (orbRadius - 6.0 * u_dpr);
    } else {
      float subP = (u_progress - 0.35) / 0.65;
      currentRadius = orbRadius + pow(subP, 1.8) * (maxRadius - orbRadius);
    }

    // Live accelerating motion as the fog builds energy
    float speedMultiplier = 1.2 + u_progress * 2.4;
    float time = u_time * speedMultiplier;

    // Coordinate scaling in physical pixels
    vec2 point = diff / (90.0 * u_dpr);

    // Swirling active fluid wind & vortex
    float angle = atan(diff.y, diff.x);
    float vortex = sin(angle * 2.0 - time * 1.4) * (0.2 + u_progress * 0.25);
    
    vec2 wind = vec2(
      time * 0.18 + vortex,
      -time * 0.14 - vortex * 0.8
    );

    float broad = fbm(point * 1.6 + wind);
    vec2 warp = vec2(
      fbm(point * 2.4 + vec2(broad * 1.6, time * 0.22)),
      fbm(point * 2.4 + vec2(-time * 0.18, broad * 1.5))
    );
    warp = (warp - 0.5) * 2.2;

    float cloud = fbm(point * 3.0 + warp * 1.4 + wind * 0.9);
    float veil = fbm(point * 5.5 - warp * 0.8 - wind * 1.2);
    float vapor = fbm(point * 8.5 + warp * 0.6 + wind * 1.6);

    // Wandering organic fog lobes
    vec2 lobeA = vec2(sin(time * 0.8), cos(time * 0.6)) * 0.25;
    vec2 lobeB = vec2(cos(time * 0.7), sin(time * 0.9)) * 0.22;
    vec2 lobeC = vec2(-sin(time * 0.6), -cos(time * 0.8)) * 0.26;

    float organic = max(
      max(
        1.0 - smoothstep(0.2, 0.75, length(point + warp * 0.15 - lobeA)),
        1.0 - smoothstep(0.2, 0.75, length(point + warp * 0.15 - lobeB))
      ),
      1.0 - smoothstep(0.2, 0.75, length(point + warp * 0.15 - lobeC))
    );

    float density = clamp(
      0.15 + organic * 0.45 + cloud * 0.4 + veil * 0.25 + vapor * 0.15,
      0.0,
      1.0
    );

    // Organic boundary edge: smoke dissolves with fractal noise
    float edgeNoise = (density - 0.5) * (26.0 * u_dpr + u_progress * 42.0 * u_dpr);
    float distWithNoise = dist + edgeNoise;

    float feather = (20.0 * u_dpr) + currentRadius * 0.18;
    float alpha = 1.0 - smoothstep(currentRadius - feather, currentRadius + feather, distWithNoise);

    // Full screen darkening at the climax
    if (u_progress > 0.72) {
      float darkP = (u_progress - 0.72) / 0.28;
      alpha = mix(alpha, 1.0, darkP * 0.98);
    }

    if (alpha <= 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Haunt's signature silver-blue luminous smoke tint with grain
    float luminance = 0.08 + density * 0.55;
    float grain = hash(gl_FragCoord.xy + floor(u_time * 24.0)) - 0.5;
    luminance += grain * 0.045;

    vec3 smokeTint = vec3(0.68, 0.79, 0.92); // App signature smoke color
    vec3 smoke = smokeTint * luminance;

    // Dark obsidian backdrop blending
    vec3 darkBackdrop = vec3(0.03, 0.035, 0.045);
    vec3 finalColor = mix(smoke, darkBackdrop, clamp(dist / max(currentRadius, 1.0), 0.0, 1.0));

    gl_FragColor = vec4(finalColor * alpha, alpha);
  }
`

export function ShroudEngulfShader({
  holding,
  released,
  duration = 2200,
  onComplete,
}: ShroudEngulfShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const holdStartRef = useRef<number | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    if (holding) {
      if (!holdStartRef.current) {
        holdStartRef.current = performance.now()
        completedRef.current = false
      }
    } else {
      holdStartRef.current = null
    }
  }, [holding])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
    if (!gl) return

    const vertShader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vertShader, VERTEX_SHADER)
    gl.compileShader(vertShader)

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fragShader, FRAGMENT_SHADER)
    gl.compileShader(fragShader)

    const program = gl.createProgram()!
    gl.attachShader(program, vertShader)
    gl.attachShader(program, fragShader)
    gl.linkProgram(program)
    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const originLocation = gl.getUniformLocation(program, 'u_origin')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const progressLocation = gl.getUniformLocation(program, 'u_progress')
    const dprLocation = gl.getUniformLocation(program, 'u_dpr')

    let lastTime = performance.now()
    const startTime = performance.now()

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // Measured every frame from the canvas itself: a window-sized buffer would
      // stretch the fog across a narrower frame and put its origin somewhere the
      // orb isn't. Re-measuring also means a resize needs no listener.
      const box = canvas.getBoundingClientRect()
      const renderWidth = Math.round(box.width * dpr)
      const renderHeight = Math.round(box.height * dpr)
      if (renderWidth === 0 || renderHeight === 0) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth
        canvas.height = renderHeight
        gl.viewport(0, 0, renderWidth, renderHeight)
      }

      // Calculate hold progress
      if (holding && holdStartRef.current) {
        const elapsed = now - holdStartRef.current
        const rawP = Math.min(elapsed / duration, 1.0)
        progressRef.current = Math.min(1.0, progressRef.current + (rawP - progressRef.current) * 0.28)
        if (rawP >= 1.0 && !completedRef.current) {
          completedRef.current = true
          if (onComplete) onComplete()
        }
      } else if (released) {
        progressRef.current = 1.0
      } else {
        progressRef.current = Math.max(0, progressRef.current - dt * 3.4)
      }

      const p = progressRef.current

      // The fog comes out of the orb, so the origin is the orb's centre in this
      // canvas's own coordinates — and GL counts y upward from the bottom.
      let originX = renderWidth / 2
      let originY = renderHeight * 0.22
      const orb = canvas.closest('.mystic-ritual-talisman')
      if (orb) {
        const rect = orb.getBoundingClientRect()
        originX = (rect.left + rect.width / 2 - box.left) * dpr
        originY = (box.bottom - (rect.top + rect.height / 2)) * dpr
      }

      gl.useProgram(program)
      gl.uniform2f(resolutionLocation, renderWidth, renderHeight)
      gl.uniform2f(originLocation, originX, originY)
      gl.uniform1f(timeLocation, (now - startTime) * 0.001)
      gl.uniform1f(progressLocation, p)
      gl.uniform1f(dprLocation, dpr)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      gl.deleteProgram(program)
      gl.deleteShader(vertShader)
      gl.deleteShader(fragShader)
      gl.deleteBuffer(positionBuffer)
    }
  }, [holding, released, duration, onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      aria-hidden="true"
    />
  )
}
