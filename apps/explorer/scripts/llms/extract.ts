import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

/**
 * A search, query, path, or body parameter read from the zod schema (or
 * `searchParams.get` call) that the route actually parses.
 */
export type Param = {
	name: string
	/** Non-literal member types, e.g. `number` or `hex`. */
	types: string[]
	/** Literal members, e.g. tab names or `latest`. */
	values: string[]
	default?: string | undefined
	required: boolean
}

export type Route = {
	/** Router full path, e.g. `/address/$address`; pathless layouts keep their id. */
	path: string
	file: string
	kind: 'page' | 'api' | 'layout'
	methods: string[]
	/** Path params, typed when the handler parses `params.<name>` with a schema. */
	pathParams: Param[]
	/** Page search params, API query params (GET), or JSON body fields (POST). */
	params: Param[]
}

const root = resolve(import.meta.dirname, '../..')

/** Reads every `createFileRoute` under `src/routes` with the app's own compiler options. */
export function extractRoutes(): Route[] {
	const config = ts.getParsedCommandLineOfConfigFile(
		join(root, 'tsconfig.json'),
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	)
	if (!config) throw new Error('Cannot read tsconfig.json')
	const files = readdirSync(join(root, 'src/routes'), { recursive: true })
		.map(String)
		.filter((file) => /\.tsx?$/.test(file))
		.map((file) => join(root, 'src/routes', file))
	const program = ts.createProgram(config.fileNames, config.options)
	const checker = program.getTypeChecker()
	const routes: Route[] = []

	for (const file of files) {
		const source = program.getSourceFile(file)
		if (!source) throw new Error(`Cannot load ${file}`)
		const visit = (node: ts.Node) => {
			const id = fileRouteId(node)
			if (id && ts.isCallExpression(node)) {
				const options = node.arguments[0]
				if (!options || !ts.isObjectLiteralExpression(options))
					throw new Error(`${id}: expected an options object`)
				routes.push(readRoute(checker, id, relative(root, file), options))
			}
			ts.forEachChild(node, visit)
		}
		visit(source)
	}

	assertMatchesRouteTree(routes)
	return routes.sort((a, b) => compare(a.path, b.path))
}

/** `createFileRoute('/_layout/tx/$hash')({...})` → `/_layout/tx/$hash`. */
function fileRouteId(node: ts.Node): string | undefined {
	if (!ts.isCallExpression(node) || !ts.isCallExpression(node.expression))
		return undefined
	const inner = node.expression
	if (!ts.isIdentifier(inner.expression)) return undefined
	if (inner.expression.text !== 'createFileRoute') return undefined
	const [id] = inner.arguments
	if (!id || !ts.isStringLiteral(id)) return undefined
	return id.text
}

/** Drops pathless `_layout` segments and index slashes, as the router does. */
export function toFullPath(id: string): string {
	const path = id
		.split('/')
		.filter((segment) => !segment.startsWith('_'))
		.join('/')
		.replace(/\/$/, '')
	return path || '/'
}

function readRoute(
	checker: ts.TypeChecker,
	id: string,
	file: string,
	options: ts.ObjectLiteralExpression,
): Route {
	const isLayout = id.split('/').at(-1)?.startsWith('_') ?? false
	const path = isLayout ? id : toFullPath(id)
	const pathParams = path
		.split('/')
		.filter((segment) => segment.startsWith('$'))
		.map((segment) => untypedParam(segment.slice(1), true))
	const route: Route = {
		path,
		file,
		kind: isLayout ? 'layout' : path.startsWith('/api/') ? 'api' : 'page',
		methods: [],
		pathParams,
		params: [],
	}

	const search = property(options, 'validateSearch')
	if (search) route.params = objectParams(checker, search)

	const handlers = property(options, 'server', 'handlers')
	if (handlers && ts.isObjectLiteralExpression(handlers))
		for (const handler of handlers.properties) {
			if (!handler.name || !ts.isIdentifier(handler.name)) continue
			route.methods.push(handler.name.text)
			const body = ts.isPropertyAssignment(handler)
				? handler.initializer
				: handler
			readHandler(checker, route, body, new Set())
		}

	return route
}

function property(
	node: ts.Expression,
	...names: string[]
): ts.Expression | undefined {
	let current: ts.Expression | undefined = node
	for (const name of names) {
		if (!current || !ts.isObjectLiteralExpression(current)) return undefined
		const match: ts.PropertyAssignment | undefined = current.properties.find(
			(item): item is ts.PropertyAssignment =>
				ts.isPropertyAssignment(item) &&
				ts.isIdentifier(item.name) &&
				item.name.text === name,
		)
		current = match?.initializer
	}
	return current
}

/**
 * Collects the parameters a handler parses: zod schemas passed to `parse` /
 * `safeParse`, and bare `searchParams.get('name')` reads. Helpers that receive
 * the `request` are followed so delegated parsing is still found.
 */
function readHandler(
	checker: ts.TypeChecker,
	route: Route,
	node: ts.Node,
	seen: Set<ts.Node>,
) {
	if (seen.has(node)) return
	seen.add(node)

	const visit = (child: ts.Node) => {
		if (ts.isCallExpression(child)) {
			readParse(checker, route, child)
			readTypeGuard(checker, route, child)
			const name = searchParamName(child)
			if (name) addParam(route, untypedParam(name, false), false)
			if (
				child.arguments.some(
					(arg) => ts.isIdentifier(arg) && arg.text === 'request',
				)
			) {
				const declaration = projectFunction(checker, child.expression)
				if (declaration) readHandler(checker, route, declaration, seen)
			}
		}
		ts.forEachChild(child, visit)
	}
	visit(node)
}

function readParse(
	checker: ts.TypeChecker,
	route: Route,
	call: ts.CallExpression,
) {
	if (!ts.isPropertyAccessExpression(call.expression)) return
	const method = call.expression.name.text
	if (method !== 'parse' && method !== 'safeParse') return
	const isNamespaceCall =
		ts.isIdentifier(call.expression.expression) &&
		call.expression.expression.text === 'z'
	const schema = isNamespaceCall
		? call.arguments[0]
		: call.expression.expression
	const input = isNamespaceCall ? call.arguments[1] : call.arguments[0]
	if (!schema || !input) return
	const output = zodType(checker, schema, 'output')
	const inputType = zodType(checker, schema, 'input')
	if (!output || !inputType) return

	const target = unwrapNullish(input)
	// `Schema.parse(params.kind)` types a path param.
	const pathParam = pathParamName(target)
	if (pathParam) {
		setPathParam(route, pathParam, describe(checker, output))
		return
	}
	// `Schema.parse(url.searchParams.get('address'))` types a single param.
	const name = ts.isCallExpression(target) ? searchParamName(target) : undefined
	if (name) {
		addParam(route, {
			...describe(checker, output),
			name,
			required: !acceptsUndefined(inputType),
		})
		return
	}
	if (!output.getProperties().length) return
	for (const param of objectParams(checker, schema))
		if (route.pathParams.some((item) => item.name === param.name))
			setPathParam(route, param.name, param)
		else addParam(route, param)
}

/** `Address.validate(params.address)` types a path param by its type predicate. */
function readTypeGuard(
	checker: ts.TypeChecker,
	route: Route,
	call: ts.CallExpression,
) {
	const signature = checker.getResolvedSignature(call)
	const predicate = signature && checker.getTypePredicateOfSignature(signature)
	if (!predicate?.type || predicate.parameterIndex === undefined) return
	const arg = call.arguments[predicate.parameterIndex]
	const name = arg && pathParamName(arg)
	if (name) setPathParam(route, name, describe(checker, predicate.type))
}

function pathParamName(node: ts.Expression): string | undefined {
	if (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'params'
	)
		return node.name.text
	return undefined
}

function setPathParam(
	route: Route,
	name: string,
	type: Pick<Param, 'types' | 'values'>,
) {
	const index = route.pathParams.findIndex((param) => param.name === name)
	if (index !== -1)
		route.pathParams[index] = {
			name,
			types: type.types,
			values: type.values,
			required: true,
		}
}

/** Schema-typed params replace bare `searchParams.get` reads of the same name. */
function addParam(route: Route, param: Param, typed = true) {
	const index = route.params.findIndex((item) => item.name === param.name)
	if (index === -1) route.params.push(param)
	else if (typed) route.params[index] = param
}

function searchParamName(call: ts.CallExpression): string | undefined {
	const callee = call.expression
	if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'get')
		return undefined
	if (
		!ts.isPropertyAccessExpression(callee.expression) ||
		callee.expression.name.text !== 'searchParams'
	)
		return undefined
	const [name] = call.arguments
	return name && ts.isStringLiteral(name) ? name.text : undefined
}

function unwrapNullish(node: ts.Expression): ts.Expression {
	if (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
	)
		return unwrapNullish(node.left)
	return node
}

/** The body of a function declared in this app (not a dependency). */
function projectFunction(
	checker: ts.TypeChecker,
	callee: ts.Expression,
): ts.Node | undefined {
	let symbol = checker.getSymbolAtLocation(callee)
	if (symbol && symbol.flags & ts.SymbolFlags.Alias)
		symbol = checker.getAliasedSymbol(symbol)
	const declaration = symbol?.declarations?.[0]
	if (!declaration) return undefined
	const file = declaration.getSourceFile().fileName
	if (!file.startsWith(join(root, 'src'))) return undefined
	return ts.isFunctionDeclaration(declaration) ? declaration.body : undefined
}

/** One param per property of an object schema's output type. */
function objectParams(checker: ts.TypeChecker, schema: ts.Expression): Param[] {
	const output = zodType(checker, schema, 'output')
	const input = zodType(checker, schema, 'input')
	if (!output || !input)
		throw new Error(`Not a zod schema: ${schema.getText()}`)
	const defaults = schemaDefaults(checker, schema)
	return output.getProperties().map((symbol) => {
		const type = checker.getTypeOfSymbol(symbol)
		const inputSymbol = input.getProperty(symbol.name)
		const optional =
			!inputSymbol ||
			(inputSymbol.flags & ts.SymbolFlags.Optional) !== 0 ||
			acceptsUndefined(checker.getTypeOfSymbol(inputSymbol))
		return {
			...describe(checker, type),
			name: symbol.name,
			default: defaults.get(symbol.name),
			required: !optional,
		}
	})
}

/**
 * The schema's `_zod.input` / `_zod.output` type. Accepts a schema, or a
 * function returning parsed values (`z.object({...}).parse`).
 */
function zodType(
	checker: ts.TypeChecker,
	node: ts.Expression,
	kind: 'input' | 'output',
): ts.Type | undefined {
	const type = checker.getTypeAtLocation(node)
	const [signature] = type.getCallSignatures()
	if (signature && !type.getProperty('_zod')) {
		if (kind === 'output') return signature.getReturnType()
		const [arg] = signature.getParameters()
		return arg && checker.getTypeOfSymbol(arg)
	}
	const internals = type.getProperty('_zod')
	if (!internals) return undefined
	const member = checker.getTypeOfSymbol(internals).getProperty(kind)
	return member && checker.getTypeOfSymbol(member)
}

/** Literal `z.prefault(schema, value)` / `z._default(schema, value)` defaults. */
function schemaDefaults(
	checker: ts.TypeChecker,
	schema: ts.Expression,
): Map<string, string> {
	const defaults = new Map<string, string>()
	const shape = objectShape(checker, schema)
	if (!shape) return defaults
	for (const item of shape.properties) {
		if (!ts.isPropertyAssignment(item) || !ts.isIdentifier(item.name)) continue
		const call = item.initializer
		if (!ts.isCallExpression(call)) continue
		if (!ts.isPropertyAccessExpression(call.expression)) continue
		if (!['prefault', '_default'].includes(call.expression.name.text)) continue
		const value = call.arguments[1]
		if (!value) continue
		const literal = literalValue(checker.getTypeAtLocation(value))
		if (literal !== undefined) defaults.set(item.name.text, literal)
	}
	return defaults
}

/** Finds the `z.object({...})` literal behind `.parse`, `.check()` or a const. */
function objectShape(
	checker: ts.TypeChecker,
	node: ts.Expression,
): ts.ObjectLiteralExpression | undefined {
	if (ts.isPropertyAccessExpression(node))
		return objectShape(checker, node.expression)
	if (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression)
	) {
		const [arg] = node.arguments
		if (node.expression.name.text === 'object' && arg)
			return ts.isObjectLiteralExpression(arg) ? arg : undefined
		return objectShape(checker, node.expression.expression)
	}
	if (ts.isIdentifier(node)) {
		let symbol = checker.getSymbolAtLocation(node)
		if (symbol && symbol.flags & ts.SymbolFlags.Alias)
			symbol = checker.getAliasedSymbol(symbol)
		const declaration = symbol?.valueDeclaration
		if (
			declaration &&
			ts.isVariableDeclaration(declaration) &&
			declaration.initializer
		)
			return objectShape(checker, declaration.initializer)
	}
	return undefined
}

function untypedParam(name: string, required: boolean): Param {
	return { name, types: ['string'], values: [], required }
}

/** `z.coerce` inputs are `unknown`, so only an explicit `undefined` marks a param optional. */
function acceptsUndefined(type: ts.Type): boolean {
	const members = type.isUnion() ? type.types : [type]
	return members.some((member) => (member.flags & ts.TypeFlags.Undefined) !== 0)
}

function literalValue(type: ts.Type): string | undefined {
	if (type.isStringLiteral() || type.isNumberLiteral())
		return String(type.value)
	if (type.flags & ts.TypeFlags.BooleanLiteral)
		return (type as ts.Type & { intrinsicName: string }).intrinsicName
	return undefined
}

/** Splits a type into documented member types and literal values. */
function describe(
	checker: ts.TypeChecker,
	type: ts.Type,
): Pick<Param, 'types' | 'values'> {
	const members = (type.isUnion() ? type.types : [type]).filter(
		(member) =>
			(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0,
	)
	const types = new Set<string>()
	const values: string[] = []
	for (const member of members) {
		if (member.flags & ts.TypeFlags.BooleanLiteral) types.add('boolean')
		else {
			const literal = literalValue(member)
			if (literal !== undefined) values.push(literal)
			else types.add(typeName(checker, member))
		}
	}
	return { types: [...types].sort(), values: values.sort(compareValues) }
}

function typeName(checker: ts.TypeChecker, type: ts.Type): string {
	if (type.flags & ts.TypeFlags.TemplateLiteral) {
		const text = checker.typeToString(type)
		if (text.startsWith('`0x')) return 'hex'
	}
	if (checker.isArrayType(type)) {
		const [element] = checker.getTypeArguments(type as ts.TypeReference)
		return `${element ? typeName(checker, element) : 'unknown'}[]`
	}
	if (type.flags & ts.TypeFlags.Object) return 'object'
	return checker.typeToString(type)
}

/** Numeric values by size, others by code point so output never depends on locale. */
function compareValues(a: string, b: string): number {
	const numeric = Number(a) - Number(b)
	return Number.isNaN(numeric) ? compare(a, b) : numeric
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

/** The router's generated tree must agree with the source files read above. */
function assertMatchesRouteTree(routes: Route[]) {
	const tree = readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8')
	const block = tree.match(/interface FileRoutesByFullPath \{([^}]*)\}/)?.[1]
	if (!block) throw new Error('Cannot find FileRoutesByFullPath')
	const expected = [...block.matchAll(/^\s*'([^']+)':/gm)]
		.map(([, path]) => toFullPath(path ?? ''))
		.sort()
	const actual = routes
		.filter((route) => route.kind !== 'layout')
		.map((route) => route.path)
		.sort()
	if (expected.join('\n') !== actual.join('\n'))
		throw new Error(
			`src/routes and src/routeTree.gen.ts disagree.\nRoute tree: ${expected.join(', ')}\nSource: ${actual.join(', ')}`,
		)
}
