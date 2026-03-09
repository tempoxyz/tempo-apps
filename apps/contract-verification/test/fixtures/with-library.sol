// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library MathLib {
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    function mul(uint256 a, uint256 b) external pure returns (uint256) {
        return a * b;
    }
}

contract WithLibrary {
    using MathLib for uint256;

    uint256 public total;

    function addToTotal(uint256 value) public {
        total = MathLib.add(total, value);
    }

    function multiplyTotal(uint256 factor) public {
        total = MathLib.mul(total, factor);
    }
}
