// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WithConstructor {
    string public name;
    uint256 public value;
    address public owner;

    constructor(string memory _name, uint256 _value) {
        name = _name;
        value = _value;
        owner = msg.sender;
    }

    function setName(string memory _name) public {
        name = _name;
    }

    function setValue(uint256 _value) public {
        value = _value;
    }
}
