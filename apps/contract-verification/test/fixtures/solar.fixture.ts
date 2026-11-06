// Generated from a real solar build: test/fixtures/with-immutables.sol compiled with
// paradigmxyz/solar@d83529bcb2f8a911607e43ba4bb2e316d9ac78a4 (tempoxyz/earn solar.lock) through
// solar --standard-json, then deployed on a local Tempo dev node with CONFIG_HASH = 0x11…11.
// onchainRuntimeBytecode is that deployment's eth_getCode, with its immutables filled in.

const SOURCE =
	'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract WithImmutables {\n    uint256 public immutable CREATION_TIME;\n    address public immutable DEPLOYER;\n    bytes32 public immutable CONFIG_HASH;\n\n    uint256 public value;\n\n    constructor(bytes32 _configHash) {\n        CREATION_TIME = block.timestamp;\n        DEPLOYER = msg.sender;\n        CONFIG_HASH = _configHash;\n    }\n\n    function setValue(uint256 _value) public {\n        require(msg.sender == DEPLOYER, "Only deployer");\n        value = _value;\n    }\n\n    function getInfo() public view returns (uint256, address, bytes32) {\n        return (CREATION_TIME, DEPLOYER, CONFIG_HASH);\n    }\n}\n'

export const solarFixture = {
	chainId: 31_318,
	address: '0x3333333333333333333333333333333333333333' as const,
	compilerVersion: '0.8.36+commit.d83529b.solar.0.2.0',
	contractIdentifier: 'src/WithImmutables.sol:WithImmutables',
	stdJsonInput: {
		language: 'Solidity',
		sources: { 'src/WithImmutables.sol': { content: SOURCE } },
		settings: {
			optimizer: { enabled: true, runs: 200 },
			viaIR: true,
			evmVersion: 'cancun',
			metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
			outputSelection: {
				'*': {
					'*': [
						'abi',
						'evm.bytecode.object',
						'evm.bytecode.sourceMap',
						'evm.bytecode.linkReferences',
						'evm.deployedBytecode.object',
						'evm.deployedBytecode.sourceMap',
						'evm.deployedBytecode.linkReferences',
						'evm.deployedBytecode.immutableReferences',
						'metadata',
					],
				},
			},
		},
	},
	solarCompileOutput: {
		contracts: {
			'src/WithImmutables.sol': {
				WithImmutables: {
					abi: [
						{
							type: 'constructor',
							inputs: [
								{
									name: '_configHash',
									type: 'bytes32',
									internalType: 'bytes32',
								},
							],
							stateMutability: 'nonpayable',
						},
						{
							type: 'function',
							name: 'CONFIG_HASH',
							inputs: [],
							outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
							stateMutability: 'view',
						},
						{
							type: 'function',
							name: 'CREATION_TIME',
							inputs: [],
							outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
							stateMutability: 'view',
						},
						{
							type: 'function',
							name: 'DEPLOYER',
							inputs: [],
							outputs: [{ name: '', type: 'address', internalType: 'address' }],
							stateMutability: 'view',
						},
						{
							type: 'function',
							name: 'getInfo',
							inputs: [],
							outputs: [
								{ name: '', type: 'uint256', internalType: 'uint256' },
								{ name: '', type: 'address', internalType: 'address' },
								{ name: '', type: 'bytes32', internalType: 'bytes32' },
							],
							stateMutability: 'view',
						},
						{
							type: 'function',
							name: 'setValue',
							inputs: [
								{ name: '_value', type: 'uint256', internalType: 'uint256' },
							],
							outputs: [],
							stateMutability: 'nonpayable',
						},
						{
							type: 'function',
							name: 'value',
							inputs: [],
							outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
							stateMutability: 'view',
						},
					],
					metadata:
						'{"compiler":{"version":"0.2.0"},"language":"Solidity","output":{"abi":[{"inputs":[{"internalType":"bytes32","name":"_configHash","type":"bytes32"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"CONFIG_HASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"CREATION_TIME","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"DEPLOYER","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getInfo","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"},{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_value","type":"uint256"}],"name":"setValue","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"value","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}],"devdoc":{"kind":"dev","methods":{},"version":1},"userdoc":{"kind":"user","methods":{},"version":1}},"settings":{"compilationTarget":{"src/WithImmutables.sol":"WithImmutables"},"evmVersion":"cancun","libraries":{},"metadata":{"bytecodeHash":"ipfs"},"optimizer":{"enabled":true,"runs":200},"remappings":[]},"sources":{"src/WithImmutables.sol":{"keccak256":"0xff0fe2807c01e8235e47b30e988127e3553e108676af76cda44a60f5ed84f3e7","urls":["bzz-raw://6aca7567de59ba35e2f281da5c60c0272d0b74868ac6d7b6e4070f71cd56a5bc","dweb:/ipfs/QmZ6jbs5A8bZQyGqC5Kn7BaYUBKA8uUj7gNbkHaRCdrM5o"]}},"version":1}',
					evm: {
						bytecode: {
							object:
								'61025b38038061025b6101203961012001601f01601f19166040526101208061025b3803019060200111341760aa574260c0523360e05261012051610100526101ad8060ae6101203960c05161016b5260e05160601b610193515f1960a01c161761019352610100516101af5260e05160601b6101e7515f1960a01c16176101e75260c0516102095260e05160601b61022a515f1960a01c161761022a526101005161023f52610120f35b5f5ffd346045575f3560e01c80633fa4f2451460b5578063552410771460be5780635a9b0b891460e7578063b410da25146049578063c1b8411a146071578063d28cb06f14608d575b5f5ffd5b7f00000000000000000000000000000000000000000000000000000000000000005f5260205ff35b7300000000000000000000000000000000000000005f5260205ff35b7f00000000000000000000000000000000000000000000000000000000000000005f5260205ff35b5f545f5260205ff35b60243610604557730000000000000000000000000000000000000000330361014c576004355f55005b7f00000000000000000000000000000000000000000000000000000000000000007300000000000000000000000000000000000000007f0000000000000000000000000000000000000000000000000000000000000000915f5260205260405260605ff35b6c4f6e6c79206465706c6f79657260981b600d602080526040526060526308c379a05f526064601cfdfea264697066735822122051382db49a0e2a012aa45f5f7c0e7195f62e804161b2dc5e26b05731287d519265736f6c6172430002000034',
							sourceMap:
								':::-:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;284:31:0;;;325:21;;;356:25;;;;-1:-1:-1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;',
							linkReferences: {},
						},
						deployedBytecode: {
							object:
								'346045575f3560e01c80633fa4f2451460b5578063552410771460be5780635a9b0b891460e7578063b410da25146049578063c1b8411a146071578063d28cb06f14608d575b5f5ffd5b7f00000000000000000000000000000000000000000000000000000000000000005f5260205ff35b7300000000000000000000000000000000000000005f5260205ff35b7f00000000000000000000000000000000000000000000000000000000000000005f5260205ff35b5f545f5260205ff35b60243610604557730000000000000000000000000000000000000000330361014c576004355f55005b7f00000000000000000000000000000000000000000000000000000000000000007300000000000000000000000000000000000000007f0000000000000000000000000000000000000000000000000000000000000000915f5260205260405260605ff35b6c4f6e6c79206465706c6f79657260981b600d602080526040526060526308c379a05f526064601cfdfea264697066735822122051382db49a0e2a012aa45f5f7c0e7195f62e804161b2dc5e26b05731287d519265736f6c6172430002000034',
							sourceMap:
								':::-:0;;;;;;;;;;;:::i;:::-;;;;:::i;:::-;;;;:::i;:::-;;;;:::i;:::-;;;;:::i;:::-;;;;:::i;:::-;;;;;88:39:0;;;;;;-1:-1:-1;132:34:0;;;;;;-1:-1:-1;171:37:0;;;;;;-1:-1:-1;214:21:0;;;;;;;-1:-1:-1;;;;;;467:8:0;453:22;;445:48;;503:14;;;;394:130;-1:-1:-1;615:13:0;630:8;640:11;-1:-1:-1;;;;;;;;;;;445:48:0;;;;;;;;;;;;;;;;',
							linkReferences: {},
							immutableReferences: {
								'8': [
									{ start: 75, length: 32 },
									{ start: 233, length: 32 },
								],
								'9': [
									{ start: 115, length: 20 },
									{ start: 199, length: 20 },
									{ start: 266, length: 20 },
								],
								'10': [
									{ start: 143, length: 32 },
									{ start: 287, length: 32 },
								],
							},
						},
					},
				},
			},
		},
		errors: [
			{
				sourceLocation: null,
				secondarySourceLocations: [],
				type: 'Warning',
				component: 'general',
				severity: 'warning',
				errorCode: '2264',
				message: 'code generation is experimental',
				formattedMessage: 'warning[2264]: code generation is experimental\n\n',
			},
		],
		sources: { 'src/WithImmutables.sol': { id: 0 } },
	},
	onchainRuntimeBytecode:
		'0x346045575f3560e01c80633fa4f2451460b5578063552410771460be5780635a9b0b891460e7578063b410da25146049578063c1b8411a146071578063d28cb06f14608d575b5f5ffd5b7f000000000000000000000000000000000000000000000000000000006adfc61a5f5260205ff35b73f39fd6e51aad88f6f4ce6ab8827279cfffb922665f5260205ff35b7f11111111111111111111111111111111111111111111111111111111111111115f5260205ff35b5f545f5260205ff35b6024361060455773f39fd6e51aad88f6f4ce6ab8827279cfffb92266330361014c576004355f55005b7f000000000000000000000000000000000000000000000000000000006adfc61a73f39fd6e51aad88f6f4ce6ab8827279cfffb922667f1111111111111111111111111111111111111111111111111111111111111111915f5260205260405260605ff35b6c4f6e6c79206465706c6f79657260981b600d602080526040526060526308c379a05f526064601cfdfea264697066735822122051382db49a0e2a012aa45f5f7c0e7195f62e804161b2dc5e26b05731287d519265736f6c6172430002000034' as `0x${string}`,
}
