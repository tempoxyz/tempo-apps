export type PortKind = 'input' | 'output'

export type ServicePort = {
	id: string
	label: string
	schema: string
}

export type MppService = {
	id: string
	name: string
	realm: string
	description: string
	inputs: ServicePort[]
	outputs: ServicePort[]
}

export type DiagramNode = {
	id: string
	serviceId: string
	title: string
	x: number
	y: number
	inputs: ServicePort[]
	outputs: ServicePort[]
	stepInput: string
}

export type DiagramConnection = {
	id: string
	fromNodeId: string
	fromPortId: string
	toNodeId: string
	toPortId: string
}

export type DiagramState = {
	nodes: DiagramNode[]
	connections: DiagramConnection[]
	selectedNodeId: string | null
}

export type ServiceCatalogResponse = {
	services: MppService[]
	source: string
	accountSdk: {
		packageName: 'accounts'
		purpose: string
	}
}
