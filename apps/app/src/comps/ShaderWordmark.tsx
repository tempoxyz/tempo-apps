import * as React from 'react'

// =============================================================================
// SETTINGS
// =============================================================================

// Time (ms) for one complete wave cycle to travel through all rows
const ANIMATION_DURATION = 20000

// Height of each text row in pixels
const ROW_HEIGHT = 48

// Vertical gap between rows in pixels
const ROW_GAP = 30

// Number of rows in the wave pattern (affects wave wavelength)
const PATTERN_LENGTH = 15

// Minimum stretch factor (1.0 = no stretch)
const STRETCH_MIN = 1.0

// Maximum stretch factor (how much the text stretches at the wave peak)
const STRETCH_MAX = 4.0

// Opacity of the text (0.0 to 1.0)
const OPACITY = 0.12

// Stroke width for the text outline
const STROKE_WIDTH = 0.6

// Texture scale (higher = crisper text, but more memory)
const TEXTURE_SCALE = 4

// Wave flow direction: 1 = downward, -1 = upward
const FLOW_DIRECTION = -1

// Fade-in duration in milliseconds
const FADE_IN_DURATION = 150

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

uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_resolution;

// Settings passed as uniforms
uniform float u_rowHeight;
uniform float u_rowGap;
uniform float u_patternLength;
uniform float u_stretchMin;
uniform float u_stretchMax;
uniform float u_opacity;
uniform float u_flowDirection;
uniform float u_fadeIn;

const float TEMPO_WIDTH = 227.0;
const float TEMPO_HEIGHT = 18.25;
const float PI = 3.14159265359;

void main() {
	vec2 pixelCoord = v_uv * u_resolution;

	float rowSpacing = u_rowHeight + u_rowGap;
	float rowIndex = floor(pixelCoord.y / rowSpacing);
	float rowY = mod(pixelCoord.y, rowSpacing);

	// Only render within the row height (not in the gap)
	if (rowY > u_rowHeight) {
		fragColor = vec4(0.0);
		return;
	}

	// Calculate stretch using sine curve for perfectly smooth easing
	float patternOffset = u_time * u_patternLength * u_flowDirection;
	float effectiveIndex = mod(rowIndex + patternOffset, u_patternLength);

	// Use sine² for smooth easing at both min and max stretch
	float phase = effectiveIndex * PI / u_patternLength;
	float sinVal = sin(phase);
	float stretchRange = u_stretchMax - u_stretchMin;
	float scaleX = u_stretchMin + stretchRange * sinVal * sinVal;

	// Calculate texture coordinates
	float baseScale = u_rowHeight / TEMPO_HEIGHT;
	float baseWidth = TEMPO_WIDTH * baseScale;
	float stretchedWidth = baseWidth * scaleX;

	// Center the stretched wordmark
	float xOffset = (u_resolution.x - stretchedWidth) / 2.0;

	// Transform pixel coordinate to texture UV
	float texX = (pixelCoord.x - xOffset) / stretchedWidth;
	float texY = rowY / u_rowHeight;

	// Check if we're within the texture bounds
	if (texX < 0.0 || texX > 1.0) {
		fragColor = vec4(0.0);
		return;
	}

	// Sample the texture (flip Y for WebGL coordinate system)
	vec4 texColor = texture(u_texture, vec2(texX, 1.0 - texY));

	// Apply opacity with fade-in
	fragColor = vec4(texColor.rgb, texColor.a * u_opacity * u_fadeIn);
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

function createTextTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(TEMPO_WIDTH * TEXTURE_SCALE)
	canvas.height = Math.ceil(TEMPO_HEIGHT * TEXTURE_SCALE)

	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE)
	ctx.strokeStyle = 'white'
	ctx.lineWidth = STROKE_WIDTH
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

export function ShaderWordmark({ className }: { className?: string }) {
	const canvasRef = React.useRef<HTMLCanvasElement>(null)
	const glRef = React.useRef<WebGL2RenderingContext | null>(null)
	const programRef = React.useRef<WebGLProgram | null>(null)
	const startTimeRef = React.useRef<number | null>(null)

	React.useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		const gl = canvas.getContext('webgl2')
		if (!gl) {
			console.error('WebGL2 not supported')
			return
		}
		glRef.current = gl

		const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
		const fragmentShader = createShader(
			gl,
			gl.FRAGMENT_SHADER,
			FRAGMENT_SHADER,
		)
		if (!vertexShader || !fragmentShader) return

		const program = createProgram(gl, vertexShader, fragmentShader)
		if (!program) return
		programRef.current = program

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

		const texture = createTextTexture(gl)
		if (!texture) return

		gl.useProgram(program)

		// Set static uniforms (settings that don't change per frame)
		gl.uniform1f(gl.getUniformLocation(program, 'u_rowHeight'), ROW_HEIGHT)
		gl.uniform1f(gl.getUniformLocation(program, 'u_rowGap'), ROW_GAP)
		gl.uniform1f(gl.getUniformLocation(program, 'u_patternLength'), PATTERN_LENGTH)
		gl.uniform1f(gl.getUniformLocation(program, 'u_stretchMin'), STRETCH_MIN)
		gl.uniform1f(gl.getUniformLocation(program, 'u_stretchMax'), STRETCH_MAX)
		gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), OPACITY)
		gl.uniform1f(gl.getUniformLocation(program, 'u_flowDirection'), FLOW_DIRECTION)

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
			const time = (elapsed % ANIMATION_DURATION) / ANIMATION_DURATION
			const fadeElapsed = fadeStartTime ? timestamp - fadeStartTime : 0
			const fadeIn = Math.min(1, fadeElapsed / FADE_IN_DURATION)

			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			const timeLocation = gl.getUniformLocation(program, 'u_time')
			const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
			const fadeInLocation = gl.getUniformLocation(program, 'u_fadeIn')

			gl.uniform1f(timeLocation, time)
			gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
			gl.uniform1f(fadeInLocation, fadeIn)

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			animationId = requestAnimationFrame(render)
		}
		animationId = requestAnimationFrame(render)

		return () => {
			window.removeEventListener('resize', resize)
			cancelAnimationFrame(animationId)
		}
	}, [])

	return (
		<canvas
			ref={canvasRef}
			className={className}
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
			}}
		/>
	)
}
