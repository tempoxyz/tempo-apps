/**
 * CHIP-8 Emulator
 *
 * A minimal CHIP-8 implementation for the pay-to-play Tetris game.
 * Supports state serialization for persistence across moves.
 */

/** CHIP-8 display dimensions */
export const DISPLAY_WIDTH = 64
export const DISPLAY_HEIGHT = 32

/** Built-in font sprites (0-F) loaded at 0x000-0x04F */
const FONT_SET = new Uint8Array([
	0xf0,
	0x90,
	0x90,
	0x90,
	0xf0, // 0
	0x20,
	0x60,
	0x20,
	0x20,
	0x70, // 1
	0xf0,
	0x10,
	0xf0,
	0x80,
	0xf0, // 2
	0xf0,
	0x10,
	0xf0,
	0x10,
	0xf0, // 3
	0x90,
	0x90,
	0xf0,
	0x10,
	0x10, // 4
	0xf0,
	0x80,
	0xf0,
	0x10,
	0xf0, // 5
	0xf0,
	0x80,
	0xf0,
	0x90,
	0xf0, // 6
	0xf0,
	0x10,
	0x20,
	0x40,
	0x40, // 7
	0xf0,
	0x90,
	0xf0,
	0x90,
	0xf0, // 8
	0xf0,
	0x90,
	0xf0,
	0x10,
	0xf0, // 9
	0xf0,
	0x90,
	0xf0,
	0x90,
	0x90, // A
	0xe0,
	0x90,
	0xe0,
	0x90,
	0xe0, // B
	0xf0,
	0x80,
	0x80,
	0x80,
	0xf0, // C
	0xe0,
	0x90,
	0x90,
	0x90,
	0xe0, // D
	0xf0,
	0x80,
	0xf0,
	0x80,
	0xf0, // E
	0xf0,
	0x80,
	0xf0,
	0x80,
	0x80, // F
])

/** Serializable game state */
export interface Chip8State {
	memory: string // Base64 encoded 4KB
	V: number[] // 16 general-purpose registers (V0-VF)
	I: number // Index register
	pc: number // Program counter
	stack: number[] // Call stack
	sp: number // Stack pointer
	delayTimer: number
	soundTimer: number
	display: number[] // 64x32 pixels (2048 bits as array)
	keys: number[] // 16 keys state
	waitingForKey: boolean
	keyRegister: number
}

/** Persistent game metadata */
export interface GameMetadata {
	moveCount: number
	linesCleared: number
	lastMove: string // ISO timestamp
	lastMoveBy?: string // wallet address
}

export class Chip8 {
	// 4KB memory
	private memory = new Uint8Array(4096)

	// 16 8-bit registers V0-VF
	private V = new Uint8Array(16)

	// Index register
	private I = 0

	// Program counter (starts at 0x200)
	private pc = 0x200

	// Stack and stack pointer
	private stack = new Uint16Array(16)
	private sp = 0

	// Timers
	private delayTimer = 0
	private soundTimer = 0

	// Display (64x32 pixels)
	private display = new Uint8Array(DISPLAY_WIDTH * DISPLAY_HEIGHT)

	// Keypad state (16 keys: 0-F)
	private keys = new Uint8Array(16)

	// For Fx0A (wait for key)
	private waitingForKey = false
	private keyRegister = 0

	constructor() {
		this.reset()
	}

	/** Reset the emulator to initial state */
	reset(): void {
		this.memory.fill(0)
		this.V.fill(0)
		this.I = 0
		this.pc = 0x200
		this.stack.fill(0)
		this.sp = 0
		this.delayTimer = 0
		this.soundTimer = 0
		this.display.fill(0)
		this.keys.fill(0)
		this.waitingForKey = false
		this.keyRegister = 0

		// Load font set
		this.memory.set(FONT_SET, 0)
	}

	/** Load a ROM into memory starting at 0x200 */
	loadRom(rom: Uint8Array): void {
		this.memory.set(rom, 0x200)
	}

	/** Press a key (0-F) */
	pressKey(key: number): void {
		if (key >= 0 && key < 16) {
			this.keys[key] = 1

			// Handle Fx0A (wait for key press)
			if (this.waitingForKey) {
				this.V[this.keyRegister] = key
				this.waitingForKey = false
			}
		}
	}

	/** Release a key (0-F) */
	releaseKey(key: number): void {
		if (key >= 0 && key < 16) {
			this.keys[key] = 0
		}
	}

	/** Release all keys */
	releaseAllKeys(): void {
		this.keys.fill(0)
	}

	/** Run a single CPU cycle */
	cycle(): void {
		if (this.waitingForKey) return

		// Fetch opcode (2 bytes, big-endian)
		const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1]
		this.pc += 2

		// Decode and execute
		this.execute(opcode)
	}

	/** Decrement timers (call at 60Hz) */
	decrementTimers(): void {
		if (this.delayTimer > 0) this.delayTimer--
		if (this.soundTimer > 0) this.soundTimer--
	}

	/** Execute a single opcode */
	private execute(opcode: number): void {
		const x = (opcode & 0x0f00) >> 8
		const y = (opcode & 0x00f0) >> 4
		const n = opcode & 0x000f
		const nn = opcode & 0x00ff
		const nnn = opcode & 0x0fff

		switch (opcode & 0xf000) {
			case 0x0000:
				switch (opcode) {
					case 0x00e0: // CLS - Clear display
						this.display.fill(0)
						break
					case 0x00ee: // RET - Return from subroutine
						this.sp--
						this.pc = this.stack[this.sp]
						break
				}
				break

			case 0x1000: // JP addr - Jump to nnn
				this.pc = nnn
				break

			case 0x2000: // CALL addr - Call subroutine at nnn
				this.stack[this.sp] = this.pc
				this.sp++
				this.pc = nnn
				break

			case 0x3000: // SE Vx, byte - Skip if Vx == nn
				if (this.V[x] === nn) this.pc += 2
				break

			case 0x4000: // SNE Vx, byte - Skip if Vx != nn
				if (this.V[x] !== nn) this.pc += 2
				break

			case 0x5000: // SE Vx, Vy - Skip if Vx == Vy
				if (this.V[x] === this.V[y]) this.pc += 2
				break

			case 0x6000: // LD Vx, byte - Set Vx = nn
				this.V[x] = nn
				break

			case 0x7000: // ADD Vx, byte - Set Vx = Vx + nn
				this.V[x] = (this.V[x] + nn) & 0xff
				break

			case 0x8000:
				switch (n) {
					case 0x0: // LD Vx, Vy
						this.V[x] = this.V[y]
						break
					case 0x1: // OR Vx, Vy
						this.V[x] |= this.V[y]
						break
					case 0x2: // AND Vx, Vy
						this.V[x] &= this.V[y]
						break
					case 0x3: // XOR Vx, Vy
						this.V[x] ^= this.V[y]
						break
					case 0x4: {
						// ADD Vx, Vy (with carry)
						const sum = this.V[x] + this.V[y]
						this.V[0xf] = sum > 255 ? 1 : 0
						this.V[x] = sum & 0xff
						break
					}
					case 0x5: // SUB Vx, Vy (with borrow)
						this.V[0xf] = this.V[x] > this.V[y] ? 1 : 0
						this.V[x] = (this.V[x] - this.V[y]) & 0xff
						break
					case 0x6: // SHR Vx
						this.V[0xf] = this.V[x] & 0x1
						this.V[x] >>= 1
						break
					case 0x7: // SUBN Vx, Vy
						this.V[0xf] = this.V[y] > this.V[x] ? 1 : 0
						this.V[x] = (this.V[y] - this.V[x]) & 0xff
						break
					case 0xe: // SHL Vx
						this.V[0xf] = (this.V[x] & 0x80) >> 7
						this.V[x] = (this.V[x] << 1) & 0xff
						break
				}
				break

			case 0x9000: // SNE Vx, Vy - Skip if Vx != Vy
				if (this.V[x] !== this.V[y]) this.pc += 2
				break

			case 0xa000: // LD I, addr - Set I = nnn
				this.I = nnn
				break

			case 0xb000: // JP V0, addr - Jump to nnn + V0
				this.pc = nnn + this.V[0]
				break

			case 0xc000: // RND Vx, byte - Set Vx = random & nn
				this.V[x] = Math.floor(Math.random() * 256) & nn
				break

			case 0xd000: {
				// DRW Vx, Vy, n - Draw sprite
				const xPos = this.V[x] % DISPLAY_WIDTH
				const yPos = this.V[y] % DISPLAY_HEIGHT
				this.V[0xf] = 0

				for (let row = 0; row < n; row++) {
					const sprite = this.memory[this.I + row]
					for (let col = 0; col < 8; col++) {
						if ((sprite & (0x80 >> col)) !== 0) {
							const px = (xPos + col) % DISPLAY_WIDTH
							const py = (yPos + row) % DISPLAY_HEIGHT
							const idx = py * DISPLAY_WIDTH + px

							if (this.display[idx] === 1) {
								this.V[0xf] = 1 // Collision
							}
							this.display[idx] ^= 1
						}
					}
				}
				break
			}

			case 0xe000:
				switch (nn) {
					case 0x9e: // SKP Vx - Skip if key Vx is pressed
						if (this.keys[this.V[x]] === 1) this.pc += 2
						break
					case 0xa1: // SKNP Vx - Skip if key Vx is not pressed
						if (this.keys[this.V[x]] !== 1) this.pc += 2
						break
				}
				break

			case 0xf000:
				switch (nn) {
					case 0x07: // LD Vx, DT - Set Vx = delay timer
						this.V[x] = this.delayTimer
						break
					case 0x0a: // LD Vx, K - Wait for key press
						this.waitingForKey = true
						this.keyRegister = x
						break
					case 0x15: // LD DT, Vx - Set delay timer = Vx
						this.delayTimer = this.V[x]
						break
					case 0x18: // LD ST, Vx - Set sound timer = Vx
						this.soundTimer = this.V[x]
						break
					case 0x1e: // ADD I, Vx - Set I = I + Vx
						this.I = (this.I + this.V[x]) & 0xfff
						break
					case 0x29: // LD F, Vx - Set I = sprite location for digit Vx
						this.I = (this.V[x] & 0xf) * 5
						break
					case 0x33: // LD B, Vx - Store BCD of Vx at I, I+1, I+2
						this.memory[this.I] = Math.floor(this.V[x] / 100)
						this.memory[this.I + 1] = Math.floor((this.V[x] % 100) / 10)
						this.memory[this.I + 2] = this.V[x] % 10
						break
					case 0x55: // LD [I], Vx - Store V0-Vx at I
						for (let i = 0; i <= x; i++) {
							this.memory[this.I + i] = this.V[i]
						}
						break
					case 0x65: // LD Vx, [I] - Load V0-Vx from I
						for (let i = 0; i <= x; i++) {
							this.V[i] = this.memory[this.I + i]
						}
						break
				}
				break
		}
	}

	/** Get the display buffer */
	getDisplay(): Uint8Array {
		return this.display
	}

	/** Render display as ASCII art */
	renderAscii(): string {
		const lines: string[] = []
		for (let y = 0; y < DISPLAY_HEIGHT; y++) {
			let line = ''
			for (let x = 0; x < DISPLAY_WIDTH; x++) {
				const pixel = this.display[y * DISPLAY_WIDTH + x]
				line += pixel ? '█' : ' '
			}
			lines.push(line)
		}
		return lines.join('\n')
	}

	/** Serialize the emulator state for persistence */
	serialize(): Chip8State {
		return {
			memory: uint8ArrayToBase64(this.memory),
			V: Array.from(this.V),
			I: this.I,
			pc: this.pc,
			stack: Array.from(this.stack),
			sp: this.sp,
			delayTimer: this.delayTimer,
			soundTimer: this.soundTimer,
			display: Array.from(this.display),
			keys: Array.from(this.keys),
			waitingForKey: this.waitingForKey,
			keyRegister: this.keyRegister,
		}
	}

	/** Restore the emulator state from a serialized state */
	deserialize(state: Chip8State): void {
		const memoryData = base64ToUint8Array(state.memory)
		this.memory = new Uint8Array(memoryData)
		this.V = new Uint8Array(state.V)
		this.I = state.I
		this.pc = state.pc
		this.stack = new Uint16Array(state.stack)
		this.sp = state.sp
		this.delayTimer = state.delayTimer
		this.soundTimer = state.soundTimer
		this.display = new Uint8Array(state.display)
		this.keys = new Uint8Array(state.keys)
		this.waitingForKey = state.waitingForKey
		this.keyRegister = state.keyRegister
	}
}

/** Convert Uint8Array to base64 string */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

/** Convert base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}
