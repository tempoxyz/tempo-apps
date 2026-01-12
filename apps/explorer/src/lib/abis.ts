const TOKEN_CREATED_EVENT_1 =
	'event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

const TOKEN_CREATED_EVENT_2 =
	'event TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)'

export function getTokenCreatedEvent(chainId: number): string {
	if (chainId === 42429) return TOKEN_CREATED_EVENT_1
	return TOKEN_CREATED_EVENT_2
}
