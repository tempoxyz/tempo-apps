import type { FileTreeIconConfig } from '@pierre/trees'

// Solidity comes from Simple Icons (CC0-1.0) and Vyper from vscode-icons (MIT).
const icon = (id: string, color: string, viewBox: string, path: string) =>
	`<symbol id="${id}" viewBox="${viewBox}"><path style="color:var(--contract-source-icon-color, var(--trees-icon-${color}))" fill="currentColor" d="${path}"/></symbol>`

const spriteSheet = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${[
	icon(
		'contract-source-icon-solidity',
		'blue',
		'0 0 24 24',
		'M4.409 6.608L7.981.255l3.572 6.353zM8.411 0l3.569 6.348L15.552 0zm4.036 17.392l3.572 6.354l3.575-6.354zm-.608-10.284h-7.43l3.715 6.605zm.428-.25h7.428L15.982.255zM15.589 24l-3.569-6.349L8.448 24zm-3.856-6.858H4.306l3.712 6.603zm.428-.25h7.433l-3.718-6.605z',
	),
	icon(
		'contract-source-icon-vyper',
		'purple',
		'0 0 32 32',
		'm17.96 25.22l-8.421-8.419a1.96 1.96 0 0 1-.532-1.378V3.407c0-.7-.7-1.4-1.4-1.4H4.799c-.7 0-1.4.7-1.4 1.4v13.996c0 .742.273 1.456.799 1.981l9.8 9.797c.546.546 1.26.819 1.981.819h1.4a1.4 1.4 0 0 0 1.4-1.4v-1.392c0-.721-.273-1.435-.819-1.981zM28.601 3.4c0-.707-.693-1.4-1.4-1.4h-2.808c-.7 0-1.4.7-1.4 1.4v12.009a1.98 1.98 0 0 1-.56 1.385l-2.821 2.821a2.8 2.8 0 0 0-.819 1.98v1.4c0 .777.63 1.399 1.4 1.399h1.4c.714 0 1.435-.273 1.981-.818l4.2-4.199c.525-.526.82-1.238.82-1.981V3.4z',
	),
].join('')}</svg>`

/** Pierre's full colored icon set, plus the contract languages it lacks. */
export const contractSourceIcons: FileTreeIconConfig = {
	set: 'complete',
	colored: true,
	spriteSheet,
	byFileExtension: {
		sol: 'contract-source-icon-solidity',
		vy: 'contract-source-icon-vyper',
	},
}
