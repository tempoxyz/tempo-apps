import * as React from 'react'

// =============================================================================
// AMBIENT GRADIENT SETTINGS
// =============================================================================

const AMBIENT_ROTATION_SPEED = 0.2
const AMBIENT_DRIFT_AMPLITUDE_X = 20
const AMBIENT_DRIFT_AMPLITUDE_Y = 15
const AMBIENT_DRIFT_SPEED_X = 0.005
const AMBIENT_DRIFT_SPEED_Y = 0.004
const AMBIENT_BASE_POS_X = 30
const AMBIENT_BASE_POS_Y = 70
const AMBIENT_PULSE_BASE_DARK = 0.18
const AMBIENT_PULSE_BASE_LIGHT = 0.07
const AMBIENT_PULSE_AMPLITUDE = 0.08
const AMBIENT_PULSE_SPEED = 0.02

// =============================================================================
// WORDMARK SETTINGS
// =============================================================================

const WORDMARK_ANIMATION_DURATION = 20000
const WORDMARK_ROW_HEIGHT = 48
const WORDMARK_ROW_GAP = 30
const WORDMARK_PATTERN_LENGTH = 15
const WORDMARK_STRETCH_MIN = 1.0
const WORDMARK_STRETCH_MAX = 4.0
const WORDMARK_OPACITY = 0.1
const WORDMARK_STROKE_WIDTH = 0.6
const WORDMARK_TEXTURE_SCALE = 4
const WORDMARK_FLOW_DIRECTION = -1

// =============================================================================
// GENERAL SETTINGS
// =============================================================================

const FADE_IN_DURATION = 150

const DEFAULT_AMBIENT_COLORS: Array<[number, number, number]> = [
	[0.231, 0.510, 0.965], // blue (#3b82f6)
	[0.133, 0.773, 0.369], // green (#22c55e)
	[0.545, 0.361, 0.965], // purple (#8b5cf6)
]
const DEFAULT_AMBIENT_INTENSITY = 0.7

// =============================================================================
// LIQUIDGLASS SETTINGS
// =============================================================================

const LIQUIDGLASS_POWER = 12.0
const LIQUIDGLASS_BORDER_WIDTH = 0.15
const LIQUIDGLASS_REFRACT_A = 0.992
const LIQUIDGLASS_REFRACT_B = 2.332
const LIQUIDGLASS_REFRACT_C = 4.544
const LIQUIDGLASS_REFRACT_D = 8.923
const LIQUIDGLASS_REFRACT_POWER = 1.779
const LIQUIDGLASS_GLOW_WEIGHT = 0.1
const LIQUIDGLASS_GLOW_SPEED = 0.5
const LIQUIDGLASS_NOISE = 0.02
const LIQUIDGLASS_CANVAS_EXTEND = 0 // px to extend canvas beyond container

// =============================================================================
// TEMPO PATH DATA
// =============================================================================

const TEMPO_PATH = `
M20.22 18.25H15.23L19.88 4.01H0L1.27 0H45.69L44.42 4.01H24.84L20.22 18.25Z
M81.94 18.25H41.53L47.47 0H87.83L86.66 3.7H51.26L50.05 7.27H85.32L84.15 10.97H48.93L47.71 14.55H83.18L81.94 18.25Z
M88.38 18.25H83.9L89.84 0H95.53L108.13 13.67L130.08 0H136.99L131.05 18.25H126.09L130.42 4.72L108.82 18.25H105.63L92.9 4.38L88.38 18.25Z
M142.99 3.7L141.24 9H169.46C170.79 9 171.9 8.78 172.79 8.35C173.7 7.91 174.26 7.18 174.47 6.16C174.63 5.35 174.49 4.74 174.06 4.33C173.63 3.91 172.94 3.7 171.97 3.7H142.99ZM138.27 18.25H133.31L139.24 0H173.57C174.93 0 176.09 0.25 177.05 0.75C178.02 1.26 178.72 1.95 179.14 2.85C179.58 3.72 179.72 4.71 179.56 5.82C179.35 7.26 178.83 8.5 178 9.54C177.17 10.56 176.08 11.35 174.71 11.9C173.37 12.43 171.79 12.7 170 12.7H140.07L138.27 18.25Z
M220.23 16.86C218.59 17.78 216.84 18.25 214.98 18.25H186.58C184.91 18.25 183.52 17.9 182.4 17.22C181.3 16.53 180.51 15.57 180.04 14.35C179.59 13.14 179.48 11.77 179.73 10.27C180.02 8.47 180.71 6.78 181.79 5.21C182.9 3.63 184.27 2.38 185.9 1.44C187.56 0.48 189.33 0 191.21 0H219.62C221.34 0 222.76 0.35 223.88 1.05C225 1.73 225.78 2.68 226.22 3.89C226.65 5.11 226.74 6.49 226.48 8.03C226.18 9.85 225.47 11.54 224.37 13.11C223.26 14.67 221.89 15.92 220.23 16.86ZM185.22 13.62C185.81 14.24 186.73 14.55 188 14.55H214.44C215.41 14.55 216.4 14.26 217.41 13.67C218.41 13.09 219.29 12.27 220.04 11.22C220.78 10.15 221.28 8.93 221.52 7.57C221.75 6.24 221.6 5.26 221.08 4.65C220.56 4.01 219.73 3.7 218.58 3.7H191.55C190.53 3.7 189.54 3.99 188.58 4.57C187.62 5.16 186.8 5.98 186.1 7.05C185.42 8.11 184.95 9.32 184.69 10.68C184.46 12.01 184.64 12.99 185.22 13.62Z
`

const TEMPO_WIDTH = 227
const TEMPO_HEIGHT = 18.25

// =============================================================================
// SHADERS
// =============================================================================

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
	v_uv = a_position * 0.5 + 0.5;
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Generate gradient shader with colors embedded as constants
function createGradientShaderSource(colors: Array<[number, number, number]>): string {
	const n = colors.length

	const colorDecls = colors
		.map((c, i) => `vec3 c${i} = vec3(${c[0].toFixed(3)}, ${c[1].toFixed(3)}, ${c[2].toFixed(3)});`)
		.join('\n\t')

	let colorSelect = ''
	for (let i = 0; i < n - 1; i++) {
		colorSelect += `if (idx == ${i}) return c${i};\n\t`
	}
	colorSelect += `return c${n - 1};`

	return `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_rotationSpeed;
uniform vec2 u_driftAmplitude;
uniform vec2 u_driftSpeed;
uniform vec2 u_basePos;
uniform float u_pulseBase;
uniform float u_pulseAmplitude;
uniform float u_pulseSpeed;
uniform vec3 u_baseColor;

const float PI = 3.14159265359;

vec3 getGradientColor(float angle) {
	float normalizedAngle = angle / (2.0 * PI);

	${colorDecls}

	int idx = int(floor(normalizedAngle * ${n}.0));
	idx = idx - (idx / ${n}) * ${n};
	if (idx < 0) idx += ${n};

	${colorSelect}
}

void main() {
	vec2 uv = v_uv;
	float intensity = u_intensity;

	float posX = u_basePos.x + sin(u_time * u_driftSpeed.x) * u_driftAmplitude.x * intensity;
	float posY = u_basePos.y + cos(u_time * u_driftSpeed.y) * u_driftAmplitude.y * intensity;
	vec2 center = vec2(posX, 100.0 - posY) / 100.0;

	vec2 delta = uv - center;
	float angle = atan(delta.y, delta.x);

	float rotationDeg = u_time * u_rotationSpeed * (0.5 + intensity * 0.5);
	float rotationRad = rotationDeg * PI / 180.0;
	angle = angle - rotationRad;
	angle = mod(angle + 2.0 * PI, 2.0 * PI);

	vec3 color = getGradientColor(angle);

	float pulse = u_pulseBase + sin(u_time * u_pulseSpeed) * u_pulseAmplitude * intensity;
	float blend = pulse + intensity * 0.1;

	vec3 finalColor = mix(u_baseColor, color, blend);
	fragColor = vec4(finalColor, 1.0);
}
`
}

// Blur shader - Gaussian weighted blur with 21 samples
const BLUR_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_direction;
uniform float u_radius;

vec4 sampleClamped(vec2 uv) {
	return texture(u_texture, clamp(uv, 0.0, 1.0));
}

void main() {
	vec2 texelSize = 1.0 / u_resolution;
	vec2 off = u_direction * u_radius * texelSize;

	// 21 samples with Gaussian weights
	vec4 sum = sampleClamped(v_uv) * 0.0954;
	sum += sampleClamped(v_uv + off * 0.1) * 0.0915;
	sum += sampleClamped(v_uv - off * 0.1) * 0.0915;
	sum += sampleClamped(v_uv + off * 0.2) * 0.0837;
	sum += sampleClamped(v_uv - off * 0.2) * 0.0837;
	sum += sampleClamped(v_uv + off * 0.3) * 0.0728;
	sum += sampleClamped(v_uv - off * 0.3) * 0.0728;
	sum += sampleClamped(v_uv + off * 0.4) * 0.0604;
	sum += sampleClamped(v_uv - off * 0.4) * 0.0604;
	sum += sampleClamped(v_uv + off * 0.5) * 0.0476;
	sum += sampleClamped(v_uv - off * 0.5) * 0.0476;
	sum += sampleClamped(v_uv + off * 0.6) * 0.0358;
	sum += sampleClamped(v_uv - off * 0.6) * 0.0358;
	sum += sampleClamped(v_uv + off * 0.7) * 0.0256;
	sum += sampleClamped(v_uv - off * 0.7) * 0.0256;
	sum += sampleClamped(v_uv + off * 0.8) * 0.0174;
	sum += sampleClamped(v_uv - off * 0.8) * 0.0174;
	sum += sampleClamped(v_uv + off * 0.9) * 0.0113;
	sum += sampleClamped(v_uv - off * 0.9) * 0.0113;
	sum += sampleClamped(v_uv + off) * 0.0070;
	sum += sampleClamped(v_uv - off) * 0.0070;

	fragColor = sum;
}
`

// Composite shader - combines blurred gradient with sharp wordmark
const COMPOSITE_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_gradientTexture;
uniform sampler2D u_wordmarkTexture;
uniform vec2 u_resolution;
uniform float u_fadeIn;
uniform float u_rowHeight;
uniform float u_rowGap;
uniform float u_patternLength;
uniform float u_stretchMin;
uniform float u_stretchMax;
uniform float u_opacity;
uniform float u_flowDirection;
uniform float u_time;

const float PI = 3.14159265359;
const float TEMPO_WIDTH = 227.0;
const float TEMPO_HEIGHT = 18.25;

vec4 sampleWordmark(vec2 pixelCoord) {
	float rowSpacing = u_rowHeight + u_rowGap;
	float rowIndex = floor(pixelCoord.y / rowSpacing);
	float rowY = mod(pixelCoord.y, rowSpacing);

	if (rowY > u_rowHeight) {
		return vec4(0.0);
	}

	float patternOffset = u_time * u_patternLength * u_flowDirection;
	float effectiveIndex = mod(rowIndex + patternOffset, u_patternLength);

	float phase = effectiveIndex * PI / u_patternLength;
	float sinVal = sin(phase);
	float stretchRange = u_stretchMax - u_stretchMin;
	float scaleX = u_stretchMin + stretchRange * sinVal * sinVal;

	float baseScale = u_rowHeight / TEMPO_HEIGHT;
	float baseWidth = TEMPO_WIDTH * baseScale;
	float stretchedWidth = baseWidth * scaleX;

	float xOffset = (u_resolution.x - stretchedWidth) / 2.0;

	float texX = (pixelCoord.x - xOffset) / stretchedWidth;
	float texY = rowY / u_rowHeight;

	if (texX < 0.0 || texX > 1.0) {
		return vec4(0.0);
	}

	vec4 texColor = texture(u_wordmarkTexture, vec2(texX, 1.0 - texY));
	return vec4(texColor.rgb, texColor.a * u_opacity);
}

void main() {
	vec2 pixelCoord = v_uv * u_resolution;

	// Layer 1: Blurred gradient
	vec4 gradient = texture(u_gradientTexture, v_uv);

	// Layer 2: Sharp wordmark
	vec4 wordmark = sampleWordmark(pixelCoord);

	// Composite with alpha blending
	vec3 color = mix(gradient.rgb, wordmark.rgb, wordmark.a);
	float alpha = max(gradient.a, wordmark.a);

	fragColor = vec4(color, alpha * u_fadeIn);
}
`

// LiquidGlass effect shader - edge refraction and animated glow
const LIQUIDGLASS_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_power;
uniform float u_borderWidth;
uniform float u_extend;  // canvas extension in pixels
uniform float u_refractA, u_refractB, u_refractC, u_refractD;
uniform float u_refractPower;
uniform float u_glowWeight;
uniform float u_glowSpeed;
uniform float u_noise;

float sdSuperellipse(vec2 p, float n, float r) {
	vec2 pa = abs(p) + 0.0001;  // Prevent pow(0, x) which causes NaN
	float num = pow(pa.x, n) + pow(pa.y, n) - pow(r, n);
	float den = n * sqrt(pow(pa.x, 2.0 * n - 2.0) + pow(pa.y, 2.0 * n - 2.0)) + 0.0001;
	return num / den;
}

float refractFunc(float x, float a, float b, float c, float d) {
	float expVal = exp(-d * x - a);  // Use exp() instead of pow(e, x) for stability
	return max(0.001, 1.0 - b * c * expVal);  // Ensure always positive for pow()
}

void main() {
	vec2 p = (v_uv - 0.5) * 2.0;  // -1 to 1
	float d = sdSuperellipse(p, u_power, 1.0);

	// Anti-aliasing: use fwidth for smooth edge
	float aaWidth = fwidth(d) * 1.5;
	float alpha = 1.0 - smoothstep(-aaWidth, aaWidth, d);

	if (alpha < 0.001) {
		fragColor = vec4(0.0);
		return;
	}

	float dist = max(-d, 0.001);  // Clamp to avoid precision issues at center
	float edgeFactor = 1.0 - smoothstep(0.0, u_borderWidth, dist);

	// Refraction - warp UVs near edges
	float refractAmount = refractFunc(dist, u_refractA, u_refractB, u_refractC, u_refractD);
	refractAmount = clamp(refractAmount, 0.0, 2.0);  // Clamp to sane range
	float refract = mix(1.0, pow(refractAmount, u_refractPower), edgeFactor);

	vec2 warpedP = p * refract;
	vec2 warpedUV = warpedP * 0.5 + 0.5;
	warpedUV = clamp(warpedUV, 0.0, 1.0);

	vec4 color = texture(u_texture, warpedUV);

	// Optional glow effects (disabled to match reference - pure refraction only)
	if (u_glowWeight > 0.0) {
		// Fresnel-like edge brightening
		float fresnel = edgeFactor * edgeFactor * 0.08;
		color.rgb += fresnel;

		// Animated glow that rotates around the frame edge
		float boundedTime = mod(u_time * u_glowSpeed * 0.01, 6.28318);
		vec2 edgeDir = normalize(p + 0.0001);
		float angle = atan(edgeDir.y, edgeDir.x);
		float angleDiff = angle - boundedTime;
		float glowWave = cos(angleDiff) * 0.5 + 0.5;
		glowWave = pow(glowWave, 2.0);
		float glow = glowWave * u_glowWeight * edgeFactor;
		color.rgb += glow;

		// Subtle specular highlight at top-left
		vec2 lightDir = normalize(vec2(-0.5, 0.5));
		float specular = max(0.0, dot(edgeDir, lightDir));
		specular = pow(specular, 3.0) * edgeFactor * 0.06;
		color.rgb += specular;
	}

	// Apply anti-aliased alpha
	fragColor = vec4(color.rgb, color.a * alpha);
}
`

function createShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
): WebGLShader | null {
	const shader = gl.createShader(type)
	if (!shader) return null
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('Shader compile error:', gl.getShaderInfoLog(shader))
		gl.deleteShader(shader)
		return null
	}
	return shader
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertexShader: WebGLShader,
	fragmentSource: string,
): WebGLProgram | null {
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
	if (!fragmentShader) return null

	const program = gl.createProgram()
	if (!program) return null
	gl.attachShader(program, vertexShader)
	gl.attachShader(program, fragmentShader)
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error('Program link error:', gl.getProgramInfoLog(program))
		gl.deleteProgram(program)
		return null
	}
	return program
}

function createFramebuffer(gl: WebGL2RenderingContext, width: number, height: number) {
	const texture = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

	const framebuffer = gl.createFramebuffer()
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

	gl.bindFramebuffer(gl.FRAMEBUFFER, null)
	gl.bindTexture(gl.TEXTURE_2D, null)

	return { framebuffer, texture }
}

function createWordmarkTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(TEMPO_WIDTH * WORDMARK_TEXTURE_SCALE)
	canvas.height = Math.ceil(TEMPO_HEIGHT * WORDMARK_TEXTURE_SCALE)

	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	ctx.scale(WORDMARK_TEXTURE_SCALE, WORDMARK_TEXTURE_SCALE)
	ctx.strokeStyle = 'white'
	ctx.lineWidth = WORDMARK_STROKE_WIDTH
	ctx.stroke(new Path2D(TEMPO_PATH))

	const texture = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

	return texture
}

export interface ShaderCardProps {
	className?: string
	ambientColors?: Array<[number, number, number]>
	ambientIntensity?: number
}

export function ShaderCard({
	className,
	ambientColors,
	ambientIntensity,
}: ShaderCardProps) {
	const colors = ambientColors && ambientColors.length > 0 ? ambientColors : DEFAULT_AMBIENT_COLORS
	const intensity = ambientIntensity ?? DEFAULT_AMBIENT_INTENSITY
	const canvasRef = React.useRef<HTMLCanvasElement>(null)
	const startTimeRef = React.useRef<number | null>(null)

	React.useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		const gl = canvas.getContext('webgl2')
		if (!gl) {
			console.error('WebGL2 not supported')
			return
		}

		// Create shared vertex shader
		const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
		if (!vertexShader) return

		// Create programs
		// Firefox has a shader compiler bug with identical colors in if-else chains.
		// Only apply variation if there are duplicate colors.
		const colorKeys = colors.map(c => c.join(','))
		const hasDuplicates = new Set(colorKeys).size < colors.length
		const variedColors: Array<[number, number, number]> = hasDuplicates
			? colors.map((c, i) => {
				const shift = (i - Math.floor(colors.length / 2)) * 0.08
				return [
					Math.max(0, Math.min(1, c[0] + shift)),
					Math.max(0, Math.min(1, c[1] + shift)),
					Math.max(0, Math.min(1, c[2] + shift)),
				]
			})
			: colors
		const gradientShaderSource = createGradientShaderSource(variedColors)
		const gradientProgram = createProgram(gl, vertexShader, gradientShaderSource)
		const blurProgram = createProgram(gl, vertexShader, BLUR_SHADER)
		const compositeProgram = createProgram(gl, vertexShader, COMPOSITE_SHADER)
		const liquidglassProgram = createProgram(gl, vertexShader, LIQUIDGLASS_SHADER)
		if (!gradientProgram || !blurProgram || !compositeProgram || !liquidglassProgram) return

		// Create quad buffer
		const positionBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW,
		)

		// Create wordmark texture
		const wordmarkTexture = createWordmarkTexture(gl)
		if (!wordmarkTexture) return

		// Create framebuffers for multi-pass rendering
		let fb1: ReturnType<typeof createFramebuffer>
		let fb2: ReturnType<typeof createFramebuffer>
		let currentWidth = 0
		let currentHeight = 0

		const setupFramebuffers = (width: number, height: number) => {
			if (width === currentWidth && height === currentHeight) return
			currentWidth = width
			currentHeight = height
			fb1 = createFramebuffer(gl, width, height)
			fb2 = createFramebuffer(gl, width, height)
		}

		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

		const resize = () => {
			const dpr = window.devicePixelRatio || 1
			canvas.width = canvas.clientWidth * dpr
			canvas.height = canvas.clientHeight * dpr
			gl.viewport(0, 0, canvas.width, canvas.height)
			setupFramebuffers(canvas.width, canvas.height)
		}
		resize()
		window.addEventListener('resize', resize)

		const setupPositionAttrib = (program: WebGLProgram) => {
			const positionLocation = gl.getAttribLocation(program, 'a_position')
			gl.enableVertexAttribArray(positionLocation)
			gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
		}

		let animationId: number
		let frameCount = 0
		let fadeStartTime: number | null = null

		const render = (timestamp: number) => {
			if (!startTimeRef.current) startTimeRef.current = timestamp
			frameCount++

			if (frameCount === 3) fadeStartTime = timestamp

			const elapsed = timestamp - startTimeRef.current
			const time = elapsed / 16.67
			const wordmarkTime = (elapsed % WORDMARK_ANIMATION_DURATION) / WORDMARK_ANIMATION_DURATION
			const fadeElapsed = fadeStartTime ? timestamp - fadeStartTime : 0
			const fadeIn = Math.min(1, fadeElapsed / FADE_IN_DURATION)

			if (!fb1 || !fb2) {
				animationId = requestAnimationFrame(render)
				return
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)

			// Pass 1: Render gradient to fb1
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb1.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.useProgram(gradientProgram)
			setupPositionAttrib(gradientProgram)
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_time'), time)
			gl.uniform2f(gl.getUniformLocation(gradientProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_intensity'), intensity)
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_rotationSpeed'), AMBIENT_ROTATION_SPEED)
			gl.uniform2f(gl.getUniformLocation(gradientProgram, 'u_driftAmplitude'), AMBIENT_DRIFT_AMPLITUDE_X, AMBIENT_DRIFT_AMPLITUDE_Y)
			gl.uniform2f(gl.getUniformLocation(gradientProgram, 'u_driftSpeed'), AMBIENT_DRIFT_SPEED_X, AMBIENT_DRIFT_SPEED_Y)
			gl.uniform2f(gl.getUniformLocation(gradientProgram, 'u_basePos'), AMBIENT_BASE_POS_X, AMBIENT_BASE_POS_Y)
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_pulseBase'), isDark ? AMBIENT_PULSE_BASE_DARK : AMBIENT_PULSE_BASE_LIGHT)
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_pulseAmplitude'), AMBIENT_PULSE_AMPLITUDE)
			gl.uniform1f(gl.getUniformLocation(gradientProgram, 'u_pulseSpeed'), AMBIENT_PULSE_SPEED)
			const baseColor = isDark ? [0.098, 0.098, 0.098] : [0.988, 0.988, 0.988] // #191919 / #fcfcfc
			gl.uniform3f(gl.getUniformLocation(gradientProgram, 'u_baseColor'), baseColor[0], baseColor[1], baseColor[2])

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 2: Horizontal blur from fb1 to fb2
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.useProgram(blurProgram)
			setupPositionAttrib(blurProgram)
			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb1.texture)
			gl.uniform1i(gl.getUniformLocation(blurProgram, 'u_texture'), 0)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_direction'), 1.0, 0.0)
			gl.uniform1f(gl.getUniformLocation(blurProgram, 'u_radius'), 350.0)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 3: Vertical blur from fb2 to fb1
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb1.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb2.texture)
			gl.uniform1i(gl.getUniformLocation(blurProgram, 'u_texture'), 0)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_direction'), 0.0, 1.0)
			gl.uniform1f(gl.getUniformLocation(blurProgram, 'u_radius'), 350.0)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 4: Second horizontal blur from fb1 to fb2
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb1.texture)
			gl.uniform1i(gl.getUniformLocation(blurProgram, 'u_texture'), 0)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_direction'), 1.0, 0.0)
			gl.uniform1f(gl.getUniformLocation(blurProgram, 'u_radius'), 350.0)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 5: Second vertical blur from fb2 to fb1
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb1.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb2.texture)
			gl.uniform1i(gl.getUniformLocation(blurProgram, 'u_texture'), 0)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform2f(gl.getUniformLocation(blurProgram, 'u_direction'), 0.0, 1.0)
			gl.uniform1f(gl.getUniformLocation(blurProgram, 'u_radius'), 350.0)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 6: Composite blurred gradient with wordmark to fb2
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.framebuffer)
			gl.viewport(0, 0, currentWidth, currentHeight)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.useProgram(compositeProgram)
			setupPositionAttrib(compositeProgram)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb1.texture)
			gl.uniform1i(gl.getUniformLocation(compositeProgram, 'u_gradientTexture'), 0)

			gl.activeTexture(gl.TEXTURE1)
			gl.bindTexture(gl.TEXTURE_2D, wordmarkTexture)
			gl.uniform1i(gl.getUniformLocation(compositeProgram, 'u_wordmarkTexture'), 1)

			gl.uniform2f(gl.getUniformLocation(compositeProgram, 'u_resolution'), currentWidth, currentHeight)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_fadeIn'), fadeIn)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_rowHeight'), WORDMARK_ROW_HEIGHT)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_rowGap'), WORDMARK_ROW_GAP)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_patternLength'), WORDMARK_PATTERN_LENGTH)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_stretchMin'), WORDMARK_STRETCH_MIN)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_stretchMax'), WORDMARK_STRETCH_MAX)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_opacity'), WORDMARK_OPACITY)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_flowDirection'), WORDMARK_FLOW_DIRECTION)
			gl.uniform1f(gl.getUniformLocation(compositeProgram, 'u_time'), wordmarkTime)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			// Pass 7: LiquidGlass effect to screen
			gl.bindFramebuffer(gl.FRAMEBUFFER, null)
			gl.viewport(0, 0, canvas.width, canvas.height)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.enable(gl.BLEND)
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

			gl.useProgram(liquidglassProgram)
			setupPositionAttrib(liquidglassProgram)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, fb2.texture)
			gl.uniform1i(gl.getUniformLocation(liquidglassProgram, 'u_texture'), 0)

			gl.uniform2f(gl.getUniformLocation(liquidglassProgram, 'u_resolution'), canvas.width, canvas.height)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_time'), time)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_power'), LIQUIDGLASS_POWER)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_borderWidth'), LIQUIDGLASS_BORDER_WIDTH)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_extend'), LIQUIDGLASS_CANVAS_EXTEND * (window.devicePixelRatio || 1))
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_refractA'), LIQUIDGLASS_REFRACT_A)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_refractB'), LIQUIDGLASS_REFRACT_B)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_refractC'), LIQUIDGLASS_REFRACT_C)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_refractD'), LIQUIDGLASS_REFRACT_D)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_refractPower'), LIQUIDGLASS_REFRACT_POWER)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_glowWeight'), LIQUIDGLASS_GLOW_WEIGHT)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_glowSpeed'), LIQUIDGLASS_GLOW_SPEED)
			gl.uniform1f(gl.getUniformLocation(liquidglassProgram, 'u_noise'), LIQUIDGLASS_NOISE)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			animationId = requestAnimationFrame(render)
		}
		animationId = requestAnimationFrame(render)

		return () => {
			window.removeEventListener('resize', resize)
			cancelAnimationFrame(animationId)
		}
	}, [colors, intensity])

	return (
		<canvas
			ref={canvasRef}
			className={`${className} dark:drop-shadow-[0_12px_40px_rgba(0,0,0,0.4)] drop-shadow-[0_12px_40px_rgba(0,0,0,0.2)]`}
			style={{
				position: 'absolute',
				inset: -LIQUIDGLASS_CANVAS_EXTEND,
				width: `calc(100% + ${LIQUIDGLASS_CANVAS_EXTEND * 2}px)`,
				height: `calc(100% + ${LIQUIDGLASS_CANVAS_EXTEND * 2}px)`,
			}}
		/>
	)
}
