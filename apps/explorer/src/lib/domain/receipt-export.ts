export type ReceiptResponseType =
	| 'application/json'
	| 'application/pdf'
	| 'text/plain'
	| undefined

export function getReceiptResponseType(
	pathname: string,
	accept: string,
	isTerminal: boolean,
): ReceiptResponseType {
	if (pathname.endsWith('.pdf')) return 'application/pdf'
	if (pathname.endsWith('.json')) return 'application/json'
	if (pathname.endsWith('.txt')) return 'text/plain'
	if (accept.includes('application/pdf')) return 'application/pdf'
	if (accept.includes('application/json')) return 'application/json'
	if (isTerminal || accept.includes('text/plain')) return 'text/plain'
	return undefined
}
