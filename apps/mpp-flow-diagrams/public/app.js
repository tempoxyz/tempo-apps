// src/client.ts
var app = mustQuery('#app', HTMLElement)
var state = {
	nodes: [],
	connections: [],
	selectedNodeId: null,
}
var services = []
var pendingPort = null
void boot()
async function boot() {
	renderShell()
	await loadServices()
	if (services[0]) {
		addNode(services[0], 120, 120)
	}
	if (services[1]) {
		addNode(services[1], 430, 230)
	}
	render()
}
function renderShell() {
	app.innerHTML = `
		<section class="surface">
			<aside class="sidebar">
				<div class="brand-row">
					<div class="mark" aria-hidden="true"></div>
					<div>
						<h1>MPP Flow Diagrams</h1>
						<p>Tempo account-aware service workflows</p>
					</div>
				</div>
				<div class="toolbar">
					<button id="export-json" type="button">Export</button>
					<label class="file-button">
						Import
						<input id="import-json" type="file" accept="application/json" />
					</label>
				</div>
				<div class="section-label">Services</div>
				<div id="service-list" class="service-list"></div>
			</aside>
			<section class="board-wrap">
				<div class="board-header">
					<div>
						<div class="section-label">Canvas</div>
						<h2>Build request, payment, and output paths</h2>
					</div>
					<div id="status" class="status">Loading MPP services</div>
				</div>
				<div id="board" class="board"></div>
			</section>
			<aside class="inspector">
				<div class="section-label">Step Input</div>
				<div id="inspector-content"></div>
			</aside>
		</section>
	`
	mustQuery('#export-json', HTMLButtonElement).addEventListener(
		'click',
		exportJson,
	)
	mustQuery('#import-json', HTMLInputElement).addEventListener(
		'change',
		importJson,
	)
}
async function loadServices() {
	const response = await fetch('/api/services')
	const catalog = await response.json()
	services = catalog.services
	mustQuery('#status', HTMLElement).textContent =
		`${services.length} MPP services loaded \xB7 ${catalog.accountSdk.packageName} SDK ready`
}
function render() {
	renderServiceList()
	renderBoard()
	renderInspector()
}
function renderServiceList() {
	const list = mustQuery('#service-list', HTMLElement)
	list.replaceChildren(
		...services.map((service) => {
			const button = document.createElement('button')
			button.className = 'service-card'
			button.type = 'button'
			button.innerHTML = `
				<span>${escapeHtml(service.name)}</span>
				<small>${escapeHtml(service.realm)}</small>
			`
			button.addEventListener('click', () =>
				addNode(
					service,
					160 + state.nodes.length * 26,
					130 + state.nodes.length * 22,
				),
			)
			return button
		}),
	)
}
function renderBoard() {
	const board = mustQuery('#board', HTMLElement)
	board.replaceChildren()
	const svg = svgEl('svg')
	svg.classList.add('connections')
	for (const connection of state.connections) {
		const from = state.nodes.find((node) => node.id === connection.fromNodeId)
		const to = state.nodes.find((node) => node.id === connection.toNodeId)
		if (!from || !to) continue
		const path = svgEl('path')
		const x1 = from.x + 260
		const y1 =
			from.y + 94 + getPortIndex(from, connection.fromPortId, 'output') * 30
		const x2 = to.x
		const y2 = to.y + 94 + getPortIndex(to, connection.toPortId, 'input') * 30
		path.setAttribute(
			'd',
			`M ${x1} ${y1} C ${x1 + 90} ${y1}, ${x2 - 90} ${y2}, ${x2} ${y2}`,
		)
		svg.appendChild(path)
	}
	board.appendChild(svg)
	for (const node of state.nodes) {
		board.appendChild(renderNode(node))
	}
}
function renderNode(node) {
	const element = document.createElement('article')
	element.className =
		node.id === state.selectedNodeId ? 'node selected' : 'node'
	element.style.transform = `translate(${node.x}px, ${node.y}px)`
	element.innerHTML = `
		<header>
			<strong>${escapeHtml(node.title)}</strong>
			<button type="button" data-action="delete">\xD7</button>
		</header>
		<div class="ports">
			<div>${node.inputs.map((port) => portButton(node, port.id, port.label, 'input')).join('')}</div>
			<div>${node.outputs.map((port) => portButton(node, port.id, port.label, 'output')).join('')}</div>
		</div>
	`
	element.addEventListener('click', () => {
		state.selectedNodeId = node.id
		render()
	})
	element
		.querySelector('[data-action="delete"]')
		?.addEventListener('click', (event) => {
			event.stopPropagation()
			deleteNode(node.id)
		})
	for (const button of element.querySelectorAll('[data-port]')) {
		button.addEventListener('click', (event) => {
			event.stopPropagation()
			selectPort(node.id, button.dataset.port ?? '', button.dataset.kind)
		})
	}
	enableDrag(element, node)
	return element
}
function renderInspector() {
	const container = mustQuery('#inspector-content', HTMLElement)
	const selected = state.nodes.find((node) => node.id === state.selectedNodeId)
	if (!selected) {
		container.innerHTML =
			'<div class="empty">Select a node to edit its request input.</div>'
		return
	}
	container.innerHTML = `
		<label>
			Step name
			<input id="node-title" value="${escapeAttribute(selected.title)}" />
		</label>
		<label>
			Request input
			<textarea id="node-input" spellcheck="false">${escapeHtml(selected.stepInput)}</textarea>
		</label>
		<div class="io-list">
			<strong>Inputs</strong>
			${selected.inputs.map((port) => `<span>${escapeHtml(port.label)} <small>${escapeHtml(port.schema)}</small></span>`).join('')}
			<strong>Outputs</strong>
			${selected.outputs.map((port) => `<span>${escapeHtml(port.label)} <small>${escapeHtml(port.schema)}</small></span>`).join('')}
		</div>
	`
	mustQuery('#node-title', HTMLInputElement).addEventListener(
		'input',
		(event) => {
			const target = event.currentTarget
			if (!(target instanceof HTMLInputElement)) return
			selected.title = target.value
			renderBoard()
		},
	)
	mustQuery('#node-input', HTMLTextAreaElement).addEventListener(
		'input',
		(event) => {
			const target = event.currentTarget
			if (!(target instanceof HTMLTextAreaElement)) return
			selected.stepInput = target.value
		},
	)
}
function addNode(service, x, y) {
	const node = {
		id: crypto.randomUUID(),
		serviceId: service.id,
		title: service.name,
		x,
		y,
		inputs: service.inputs,
		outputs: service.outputs,
		stepInput: JSON.stringify({ service: service.realm, input: {} }, null, 2),
	}
	state.nodes.push(node)
	state.selectedNodeId = node.id
	render()
}
function selectPort(nodeId, portId, kind) {
	if (!pendingPort) {
		pendingPort = { nodeId, portId, kind }
		mustQuery('#status', HTMLElement).textContent =
			'Select a matching port to connect'
		return
	}
	if (
		pendingPort.kind === 'output' &&
		kind === 'input' &&
		pendingPort.nodeId !== nodeId
	) {
		state.connections.push({
			id: crypto.randomUUID(),
			fromNodeId: pendingPort.nodeId,
			fromPortId: pendingPort.portId,
			toNodeId: nodeId,
			toPortId: portId,
		})
	}
	pendingPort = null
	mustQuery('#status', HTMLElement).textContent =
		`${state.connections.length} connections`
	render()
}
function deleteNode(nodeId) {
	state.nodes = state.nodes.filter((node) => node.id !== nodeId)
	state.connections = state.connections.filter(
		(connection) =>
			connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId,
	)
	if (state.selectedNodeId === nodeId) state.selectedNodeId = null
	render()
}
function enableDrag(element, node) {
	let origin = null
	element.addEventListener('pointerdown', (event) => {
		if (event.target.closest('button')) return
		origin = {
			x: event.clientX,
			y: event.clientY,
			nodeX: node.x,
			nodeY: node.y,
		}
		element.setPointerCapture(event.pointerId)
	})
	element.addEventListener('pointermove', (event) => {
		if (!origin) return
		node.x = Math.max(16, origin.nodeX + event.clientX - origin.x)
		node.y = Math.max(16, origin.nodeY + event.clientY - origin.y)
		renderBoard()
	})
	element.addEventListener('pointerup', () => {
		origin = null
	})
}
function exportJson() {
	const blob = new Blob([JSON.stringify(state, null, 2)], {
		type: 'application/json',
	})
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = 'mpp-flow-diagram.json'
	anchor.click()
	URL.revokeObjectURL(url)
}
function importJson(event) {
	const input = event.currentTarget
	const file = input.files?.[0]
	if (!file) return
	const reader = new FileReader()
	reader.addEventListener('load', () => {
		const parsed = JSON.parse(String(reader.result))
		state.nodes = parsed.nodes
		state.connections = parsed.connections
		state.selectedNodeId = parsed.selectedNodeId
		render()
	})
	reader.readAsText(file)
}
function portButton(node, portId, label, kind) {
	const active =
		pendingPort?.nodeId === node.id && pendingPort.portId === portId
			? ' active'
			: ''
	return `<button type="button" class="port ${kind}${active}" data-port="${escapeAttribute(portId)}" data-kind="${kind}">${escapeHtml(label)}</button>`
}
function getPortIndex(node, portId, kind) {
	const ports = kind === 'input' ? node.inputs : node.outputs
	return Math.max(
		0,
		ports.findIndex((port) => port.id === portId),
	)
}
function svgEl(tag) {
	return document.createElementNS('http://www.w3.org/2000/svg', tag)
}
function mustQuery(selector, type) {
	const element = document.querySelector(selector)
	if (!(element instanceof type)) throw new Error(`Missing ${selector}`)
	return element
}
function escapeHtml(value) {
	return value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char)
}
function escapeAttribute(value) {
	return escapeHtml(value)
}
var htmlEscapes = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
}
//# sourceMappingURL=app.js.map
