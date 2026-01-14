export const TOKEN_CREATED_EVENT_ANDANTINO =
	'event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

export const TOKEN_CREATED_EVENT =
	'event TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)'

export function getTokenCreatedEvent(chainId: number): string {
	if (chainId === 42429) return TOKEN_CREATED_EVENT_ANDANTINO
	return TOKEN_CREATED_EVENT
}
