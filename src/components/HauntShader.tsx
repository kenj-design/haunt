/**
 * The shroud: the fog that hides a haunt on the map.
 *
 * A WebGL fragment shader rather than a sprite or an SVG, because the effect is
 * domain-warped noise over five octaves and no amount of layered PNGs looks like
 * it moves. Each haunt seeds it from its own id, so a place always fogs over the
 * same way.
 *
 * `temperament` picks one of four personalities — how densely it gathers, how
 * restlessly it drifts. `shape` replays a hand-drawn shroud, normalized to 0–1
 * so it renders at any size.
 *
 * Under `prefers-reduced-motion` the shader renders a single frame and stops.
 */
import { useEffect, useRef } from 'react'
import type { NormalizedPoint } from '../domain'

const SHAPE_POINT_COUNT = 8

const VERTEX_SHADER = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_seed;
  uniform float u_temperament;
  uniform vec2 u_shape[8];
  uniform float u_shape_count;

  float hash(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32 + u_seed);
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

  float segmentDistance(vec2 point, vec2 start, vec2 end) {
    vec2 segment = end - start;
    float lengthSquared = max(dot(segment, segment), 0.0001);
    float along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
    return length(point - (start + segment * along));
  }

  vec2 shroudPoint(vec2 point) {
    return vec2((point.x * 2.0 - 1.0) * 0.68, ((1.0 - point.y) * 2.0 - 1.0) * 0.68);
  }

  void main() {
    vec2 point = (2.0 * gl_FragCoord.xy - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    point *= 0.68;
    float radius = length(point);
    float motionRate = 1.0;
    float lobeMotion = 1.0;
    float fieldScale = 1.0;
    if (u_temperament > 2.5) {
      motionRate = 0.18;
      lobeMotion = 0.25;
    } else if (u_temperament > 1.5) {
      motionRate = 1.65;
      lobeMotion = 1.35;
    } else if (u_temperament > 0.5) {
      motionRate = 0.52;
      lobeMotion = 0.56;
      fieldScale = 1.16;
    }
    float time = u_time * motionRate;
    float phase = u_seed * 1.73;
    vec2 wind = vec2(
      time * (0.058 + hash(vec2(u_seed, 1.0)) * 0.022),
      -time * (0.036 + hash(vec2(u_seed, 2.0)) * 0.018)
    );

    float broad = fbm(point * 2.05 + wind + vec2(u_seed * 0.73, -u_seed * 0.41));
    vec2 warp = vec2(
      fbm(point * 2.8 + vec2(broad * 1.5, time * 0.052) + u_seed),
      fbm(point * 2.8 + vec2(-time * 0.044, broad * 1.35) - u_seed)
    );
    warp = (warp - 0.5) * 2.0;

    float cloud = fbm(point * 3.4 + warp * 1.35 + wind * 0.82);
    float veil = fbm(point * 6.2 - warp * 0.92 - wind * 1.18 + vec2(u_seed * 1.9));
    float vapor = fbm(point * 9.4 + warp * 0.52 + wind * 1.7 - u_seed);

    vec2 fluidPoint = point * fieldScale + warp * 0.12;
    vec2 lobeA = vec2(-0.20, -0.13) + vec2(
      sin(time * 0.31 + phase),
      cos(time * 0.23 + phase * 1.3)
    ) * 0.075 * lobeMotion;
    vec2 lobeB = vec2(0.19, -0.08) + vec2(
      cos(time * 0.27 + phase * 0.7),
      sin(time * 0.19 + phase * 1.8)
    ) * 0.068 * lobeMotion;
    vec2 lobeC = vec2(-0.08, 0.20) + vec2(
      sin(time * 0.21 + phase * 1.4),
      cos(time * 0.29 + phase * 0.6)
    ) * 0.082 * lobeMotion;
    vec2 lobeD = vec2(0.22, 0.19) + vec2(
      cos(time * 0.17 + phase * 1.9),
      sin(time * 0.25 + phase)
    ) * 0.06 * lobeMotion;

    float radiusA = 0.30 + hash(vec2(u_seed, 3.0)) * 0.10;
    float radiusB = 0.27 + hash(vec2(u_seed, 4.0)) * 0.11;
    float radiusC = 0.29 + hash(vec2(u_seed, 5.0)) * 0.10;
    float radiusD = 0.24 + hash(vec2(u_seed, 6.0)) * 0.10;
    float organicMist = max(
      max(
        1.0 - smoothstep(radiusA - 0.10, radiusA + 0.13, length(fluidPoint - lobeA)),
        1.0 - smoothstep(radiusB - 0.10, radiusB + 0.13, length(fluidPoint - lobeB))
      ),
      max(
        1.0 - smoothstep(radiusC - 0.10, radiusC + 0.13, length(fluidPoint - lobeC)),
        1.0 - smoothstep(radiusD - 0.10, radiusD + 0.13, length(fluidPoint - lobeD))
      )
    );
    organicMist *= 0.68 + smoothstep(0.22, 0.72, broad * 0.62 + cloud * 0.42) * 0.32;

    float hasDrawnShape = step(1.5, u_shape_count);
    float pathDistance = 4.0;
    for (int index = 0; index < 7; index++) {
      if (float(index) < u_shape_count - 1.0) {
        pathDistance = min(
          pathDistance,
          segmentDistance(point, shroudPoint(u_shape[index]), shroudPoint(u_shape[index + 1]))
        );
      }
    }
    float drawnMist = 1.0 - smoothstep(
      0.018,
      0.29 + (broad - 0.5) * 0.17,
      pathDistance
    );
    float shapeMist = mix(organicMist, drawnMist, hasDrawnShape);

    float lowFog = smoothstep(0.24, 0.72, broad * 0.58 + cloud * 0.58);
    float middleFog = smoothstep(0.28, 0.75, cloud * 0.67 + veil * 0.43);
    float thinFog = smoothstep(0.34, 0.73, veil * 0.64 + vapor * 0.38);
    float temperamentDensity = u_temperament > 0.5 && u_temperament < 1.5 ? 0.08 : 0.0;
    float restlessPulse = u_temperament > 1.5 && u_temperament < 2.5
      ? sin(u_time * 1.7 + phase) * 0.08
      : 0.0;
    float density = clamp(
      0.10 + temperamentDensity + restlessPulse + lowFog * 0.48 + middleFog * 0.42 + thinFog * 0.24,
      0.0,
      1.0
    );

    float luminance = 0.035 + density * 0.52;
    luminance += vapor * middleFog * 0.07;
    luminance += (veil - 0.5) * lowFog * 0.10;

    float grain = hash(gl_FragCoord.xy + floor(u_time * 22.0) + u_seed * 91.0) - 0.5;
    luminance += grain * (0.035 + density * 0.025);

    vec3 smokeTint = vec3(0.68, 0.79, 0.92);
    vec3 smoke = smokeTint * luminance;
    float pockets = smoothstep(0.18, 0.78, density + (veil - 0.5) * 0.36);
    float alpha = shapeMist * (0.12 + pockets * 0.82);
    alpha *= 0.82 + thinFog * 0.18;
    gl_FragColor = vec4(smoke * alpha, alpha);
  }
`

function sampleShape(points: NormalizedPoint[] | undefined) {
  const sampled = new Float32Array(SHAPE_POINT_COUNT * 2)
  if (!points || points.length < 2) return { points: sampled, count: 0 }
  const count = Math.min(SHAPE_POINT_COUNT, points.length)
  for (let index = 0; index < count; index++) {
    const sourceIndex = Math.round((index / (count - 1)) * (points.length - 1))
    const point = points[sourceIndex]
    sampled[index * 2] = point.x
    sampled[index * 2 + 1] = point.y
  }
  return { points: sampled, count }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export default function HauntShader({
  seed = 1,
  shape,
  temperament = 0,
  className = '',
}: {
  seed?: number
  shape?: NormalizedPoint[]
  temperament?: 0 | 1 | 2 | 3
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shapeRef = useRef(shape)
  const temperamentRef = useRef(temperament)
  shapeRef.current = shape
  temperamentRef.current = temperament

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
    })
    if (!gl) return

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const resolution = gl.getUniformLocation(program, 'u_resolution')
    const time = gl.getUniformLocation(program, 'u_time')
    const shaderSeed = gl.getUniformLocation(program, 'u_seed')
    const shaderTemperament = gl.getUniformLocation(program, 'u_temperament')
    const shapeUniform = gl.getUniformLocation(program, 'u_shape[0]')
    const shapeCount = gl.getUniformLocation(program, 'u_shape_count')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let visible = true

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const density = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(bounds.width * density))
      const height = Math.max(1, Math.round(bounds.height * density))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
    }

    const render = (now: number) => {
      resize()
      gl.uniform1f(time, reduceMotion ? 11.0 : now / 1000)
      gl.uniform1f(shaderSeed, seed)
      gl.uniform1f(shaderTemperament, temperamentRef.current)
      const sampledShape = sampleShape(shapeRef.current)
      gl.uniform2fv(shapeUniform, sampledShape.points)
      gl.uniform1f(shapeCount, sampledShape.count)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (!reduceMotion && visible) frame = window.requestAnimationFrame(render)
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !frame && !reduceMotion) frame = window.requestAnimationFrame(render)
      if (!visible && frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    })
    observer.observe(canvas)
    render(0)

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [seed])

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />
}
