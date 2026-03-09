// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WithImmutables {
    uint256 public immutable CREATION_TIME;
    address public immutable DEPLOYER;
    bytes32 public immutable CONFIG_HASH;

    uint256 public value;

    constructor(bytes32 _configHash) {
        CREATION_TIME = block.timestamp;
        DEPLOYER = msg.sender;
        CONFIG_HASH = _configHash;
    }

    function setValue(uint256 _value) public {
        require(msg.sender == DEPLOYER, "Only deployer");
        value = _value;
    }

    function getInfo() public view returns (uint256, address, bytes32) {
        return (CREATION_TIME, DEPLOYER, CONFIG_HASH);
    }
}
