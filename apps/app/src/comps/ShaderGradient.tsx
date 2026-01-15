import * as React from 'react'

// =============================================================================
// SETTINGS - Tweak these to adjust the gradient animation
// =============================================================================

// Rotation speed (degrees per frame, higher = faster spin)
const ROTATION_SPEED = 0.3

// Center position drift - how far the gradient center moves from base position
const DRIFT_AMPLITUDE_X = 20 // horizontal drift range (percentage points)
const DRIFT_AMPLITUDE_Y = 15 // vertical drift range (percentage points)

// Center position drift speed (lower = slower drift)
const DRIFT_SPEED_X = 0.008
const DRIFT_SPEED_Y = 0.006

// Base position of gradient center (percentage of container)
const BASE_POS_X = 30 // 0 = left, 50 = center, 100 = right
const BASE_POS_Y = 70 // 0 = top, 50 = center, 100 = bottom

// Opacity pulse animation
const PULSE_BASE = 0.12 // minimum opacity
const PULSE_AMPLITUDE = 0.08 // how much opacity varies
const PULSE_SPEED = 0.02 // pulse frequency (lower = slower)

// Blur amount in pixels (applied via CSS filter)
const BLUR_AMOUNT = 80.0

// Activity intensity (0.0 to 1.0) - scales all animation amplitudes
const INTENSITY = 0.7

// Fade-in duration in milliseconds
const FADE_IN_DURATION = 150

// Default colors as RGB (0-1 range), can be overridden via props
const DEFAULT_COLORS: Array<[number, number, number]> = [
	[0.231, 0.510, 0.965], // blue (#3b82f6)
	[0.133, 0.773, 0.369], // green (#22c55e)
	[0.545, 0.361, 0.965], // purple (#8b5cf6)
]

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

const FRAGMENT_SHADER = `#version 300 es
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
uniform float u_fadeIn;
uniform vec3 u_colors[8];
uniform int u_colorCount;

const float PI = 3.14159265359;

vec3 getGradientColor(float angle) {
	// Hard color bands like CSS conic-gradient (blur is applied via CSS filter)
	float normalizedAngle = angle / (2.0 * PI);
	int idx = int(floor(normalizedAngle * float(u_colorCount))) % u_colorCount;
	return u_colors[idx];
}

void main() {
	vec2 uv = v_uv;

	// Calculate animated center position (same as CSS: posX%, posY%)
	float posX = u_basePos.x + sin(u_time * u_driftSpeed.x) * u_driftAmplitude.x * u_intensity;
	float posY = u_basePos.y + cos(u_time * u_driftSpeed.y) * u_driftAmplitude.y * u_intensity;
	vec2 center = vec2(posX, 100.0 - posY) / 100.0; // Flip Y to match CSS

	// Calculate angle from center for conic gradient
	vec2 delta = uv - center;

	float angle = atan(delta.y, delta.x);

	// Add rotation (convert to match CSS degrees-based rotation)
	float rotationDeg = u_time * u_rotationSpeed * (0.5 + u_intensity * 0.5);
	float rotationRad = rotationDeg * PI / 180.0;
	angle = angle - rotationRad;

	// Normalize angle to 0-2PI range
	angle = mod(angle + 2.0 * PI, 2.0 * PI);

	// Get color from gradient
	vec3 color = getGradientColor(angle);

	// Calculate pulse opacity (same as CSS)
	float pulse = u_pulseBase + sin(u_time * u_pulseSpeed) * u_pulseAmplitude * u_intensity;
	float opacity = pulse + u_intensity * 0.1;

	// Apply fade-in
	fragColor = vec4(color, opacity * u_fadeIn);
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
	fragmentShader: WebGLShader,
): WebGLProgram | null {
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

interface ShaderGradientProps {
	className?: string
	colors?: Array<[number, number, number]>
	intensity?: number
}

export function ShaderGradient({
	className,
	colors = DEFAULT_COLORS,
	intensity = INTENSITY,
}: ShaderGradientProps) {
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

		const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
		const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
		if (!vertexShader || !fragmentShader) return

		const program = createProgram(gl, vertexShader, fragmentShader)
		if (!program) return

		const positionBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW,
		)

		const positionLocation = gl.getAttribLocation(program, 'a_position')
		gl.enableVertexAttribArray(positionLocation)
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

		gl.useProgram(program)

		// Set static uniforms
		gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), intensity)
		gl.uniform1f(gl.getUniformLocation(program, 'u_rotationSpeed'), ROTATION_SPEED)
		gl.uniform2f(gl.getUniformLocation(program, 'u_driftAmplitude'), DRIFT_AMPLITUDE_X, DRIFT_AMPLITUDE_Y)
		gl.uniform2f(gl.getUniformLocation(program, 'u_driftSpeed'), DRIFT_SPEED_X, DRIFT_SPEED_Y)
		gl.uniform2f(gl.getUniformLocation(program, 'u_basePos'), BASE_POS_X, BASE_POS_Y)
		gl.uniform1f(gl.getUniformLocation(program, 'u_pulseBase'), PULSE_BASE)
		gl.uniform1f(gl.getUniformLocation(program, 'u_pulseAmplitude'), PULSE_AMPLITUDE)
		gl.uniform1f(gl.getUniformLocation(program, 'u_pulseSpeed'), PULSE_SPEED)
		gl.uniform1i(gl.getUniformLocation(program, 'u_colorCount'), colors.length)

		// Set colors
		const colorsFlat = new Float32Array(24) // 8 colors * 3 components
		colors.forEach((color, i) => {
			colorsFlat[i * 3] = color[0]
			colorsFlat[i * 3 + 1] = color[1]
			colorsFlat[i * 3 + 2] = color[2]
		})
		gl.uniform3fv(gl.getUniformLocation(program, 'u_colors'), colorsFlat)

		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

		const resize = () => {
			const dpr = window.devicePixelRatio || 1
			canvas.width = canvas.clientWidth * dpr
			canvas.height = canvas.clientHeight * dpr
			gl.viewport(0, 0, canvas.width, canvas.height)
		}
		resize()
		window.addEventListener('resize', resize)

		let animationId: number
		let frameCount = 0
		let fadeStartTime: number | null = null
		const render = (timestamp: number) => {
			if (!startTimeRef.current) startTimeRef.current = timestamp
			frameCount++

			// Wait a few frames before starting fade to ensure canvas is visible
			if (frameCount === 3) fadeStartTime = timestamp

			const elapsed = timestamp - startTimeRef.current
			const time = elapsed / 16.67 // Match CSS frame-based timing (~60fps)
			const fadeElapsed = fadeStartTime ? timestamp - fadeStartTime : 0
			const fadeIn = Math.min(1, fadeElapsed / FADE_IN_DURATION)

			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time)
			gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height)
			gl.uniform1f(gl.getUniformLocation(program, 'u_fadeIn'), fadeIn)

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
			className={className}
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				filter: `blur(${BLUR_AMOUNT}px)`,
			}}
		/>
	)
}
