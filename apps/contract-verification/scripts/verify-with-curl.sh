#!/usr/bin/env bash

set -euo pipefail

PORT="${PORT:-22222}"
URL="${URL:-http://localhost:${PORT}}"
CHAIN_ID="${CHAIN_ID:-42429}"
ADDRESS="${ADDRESS:-0x6c12eB13Ec6C8AC4EaF16CAf4c0c2141386c4c26}"

echo "Verifying contract $ADDRESS"
echo "on chain $CHAIN_ID"
echo "verify API is running on ${URL}"
echo

curl --silent \
  --request POST \
  --url "${URL}/v2/verify/${CHAIN_ID}/${ADDRESS}" \
  --header 'Content-Type: application/json' \
  --data '{
  "stdJsonInput": {
    "language": "Solidity",
    "sources": {
      "src/Mail.sol": {
        "content": "// SPDX-License-Identifier: UNLICENSED\npragma solidity ^0.8.13;\n\nimport {ITIP20} from \"tempo-std/interfaces/ITIP20.sol\";\n\ncontract Mail {\n    event MailSent(address indexed from, address indexed to, string message, Attachment attachment);\n\n    struct Attachment {\n        uint256 amount;\n        bytes32 memo;\n    }\n\n    ITIP20 public token;\n\n    constructor(ITIP20 token_) {\n        token = token_;\n    }\n\n    function sendMail(address to, string memory message, Attachment memory attachment) external {\n        token.transferFromWithMemo(msg.sender, to, attachment.amount, attachment.memo);\n\n        emit MailSent(msg.sender, to, message, attachment);\n    }\n}"
      },
      "tempo-std/interfaces/ITIP20.sol": {
        "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.13;\n\ninterface ITIP20 {\n    error ContractPaused();\n    error InsufficientAllowance();\n    error InsufficientBalance(uint256 currentBalance, uint256 expectedBalance, address);\n    error InvalidAmount();\n    error InvalidCurrency();\n    error InvalidQuoteToken();\n    error InvalidBaseToken();\n    error InvalidToken();\n    error InvalidRecipient();\n    error InvalidSupplyCap();\n    error NoOptedInSupply();\n    error ScheduledRewardsDisabled();\n    error PolicyForbids();\n    error ProtectedAddress();\n    error SupplyCapExceeded();\n    event Approval(address indexed owner, address indexed spender, uint256 amount);\n    event Burn(address indexed from, uint256 amount);\n    event BurnBlocked(address indexed from, uint256 amount);\n    event Mint(address indexed to, uint256 amount);\n    event NextQuoteTokenSet(address indexed updater, ITIP20 indexed nextQuoteToken);\n    event PauseStateUpdate(address indexed updater, bool isPaused);\n    event QuoteTokenUpdate(address indexed updater, ITIP20 indexed newQuoteToken);\n    event RewardRecipientSet(address indexed holder, address indexed recipient);\n    event RewardScheduled(address indexed funder, uint64 indexed id, uint256 amount, uint32 durationSeconds);\n    event SupplyCapUpdate(address indexed updater, uint256 indexed newSupplyCap);\n    event Transfer(address indexed from, address indexed to, uint256 amount);\n    event TransferPolicyUpdate(address indexed updater, uint64 indexed newPolicyId);\n    event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo);\n    function BURN_BLOCKED_ROLE() external view returns (bytes32);\n    function ISSUER_ROLE() external view returns (bytes32);\n    function PAUSE_ROLE() external view returns (bytes32);\n    function UNPAUSE_ROLE() external view returns (bytes32);\n    function allowance(address owner, address spender) external view returns (uint256);\n    function approve(address spender, uint256 amount) external returns (bool);\n    function balanceOf(address account) external view returns (uint256);\n    function burn(uint256 amount) external;\n    function burnBlocked(address from, uint256 amount) external;\n    function burnWithMemo(uint256 amount, bytes32 memo) external;\n    function changeTransferPolicyId(uint64 newPolicyId) external;\n    function claimRewards() external returns (uint256 maxAmount);\n    function completeQuoteTokenUpdate() external;\n    function currency() external view returns (string memory);\n    function decimals() external pure returns (uint8);\n    function globalRewardPerToken() external view returns (uint256);\n    function mint(address to, uint256 amount) external;\n    function mintWithMemo(address to, uint256 amount, bytes32 memo) external;\n    function name() external view returns (string memory);\n    function nextQuoteToken() external view returns (ITIP20);\n    function optedInSupply() external view returns (uint128);\n    function pause() external;\n    function paused() external view returns (bool);\n    function quoteToken() external view returns (ITIP20);\n    function setNextQuoteToken(ITIP20 newQuoteToken) external;\n    function setRewardRecipient(address newRewardRecipient) external;\n    function setSupplyCap(uint256 newSupplyCap) external;\n    function startReward(uint256 amount, uint32 seconds_) external returns (uint64);\n    function supplyCap() external view returns (uint256);\n    function symbol() external view returns (string memory);\n    function systemTransferFrom(address from, address to, uint256 amount) external returns (bool);\n    function totalSupply() external view returns (uint256);\n    function transfer(address to, uint256 amount) external returns (bool);\n    function transferFeePostTx(address to, uint256 refund, uint256 actualUsed) external;\n    function transferFeePreTx(address from, uint256 amount) external;\n    function transferFrom(address from, address to, uint256 amount) external returns (bool);\n    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo) external returns (bool);\n    function transferPolicyId() external view returns (uint64);\n    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;\n    function unpause() external;\n    function userRewardInfo(address) external view returns (address rewardRecipient, uint256 rewardPerToken, uint256 rewardBalance);\n}"
      }
    },
    "settings": {
      "optimizer": { "enabled": false, "runs": 200 },
      "outputSelection": { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
      "evmVersion": "cancun"
    }
  },
  "compilerVersion": "0.8.30",
  "contractIdentifier": "src/Mail.sol:Mail"
}'
