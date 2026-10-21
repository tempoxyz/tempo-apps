export function formatAbiParameterType(parameter: unknown): string | null {
	if (!isRecord(parameter) || typeof parameter.type !== 'string') return null

	if (parameter.type === 'tuple' || parameter.type.startsWith('tuple[')) {
		const components = Array.isArray(parameter.components)
			? parameter.components
			: []
		const componentTypes = components
			.map((component) => formatAbiParameterType(component))
			.filter((type): type is string => type !== null)
		const suffix = parameter.type.slice('tuple'.length)
		return `(${componentTypes.join(',')})${suffix}`
	}

	return parameter.type
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
