// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IHasher} from "../../src/interfaces/IHasher.sol";
import {TalosTypes} from "../../src/TalosTypes.sol";

/// @title TestPoseidonHasher
/// @notice A deterministic 2-arity {IHasher} for contract tests.
/// @dev TEST-ONLY and explicitly NOT Poseidon. It uses keccak256 reduced modulo the
///      BN254 field so the incremental Merkle tree can be exercised in Phase 2
///      without deploying real Poseidon. Because it is not Poseidon, the roots it
///      produces are NOT circuit-consistent; Phase 3 injects the real circomlib
///      Poseidon(2) contract in its place. The tree ALGORITHM under test is
///      identical either way — only this compression primitive is swapped.
contract TestPoseidonHasher is IHasher {
    /// @inheritdoc IHasher
    function poseidon(uint256[2] calldata input) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(input[0], input[1]))) % TalosTypes.FIELD_SIZE;
    }
}
