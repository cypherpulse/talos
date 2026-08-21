// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IHasher
/// @notice Two-input hash used to build the commitment Merkle tree's internal nodes.
/// @dev The production implementation is the snarkjs/circomlib-generated Poseidon(2)
///      contract, deployed and injected in Phase 3, so the on-chain tree matches the
///      in-circuit Merkle hash exactly. The interface is intentionally minimal and
///      hash-agnostic: `MerkleTreeLib` depends only on this 2-arity compression
///      function, so swapping the primitive does not change the tree algorithm.
///
///      In Phase 2, no real Poseidon is deployed; contract tests inject an
///      explicitly test-only hasher (see contracts/test). This is disclosed in the
///      spec and threat model — the Phase 2 tree is not yet circuit-consistent.
interface IHasher {
    /// @notice Compress two field elements into one.
    /// @param input `[left, right]`, each expected to be < FIELD_SIZE.
    /// @return out The Poseidon hash of the pair, a field element < FIELD_SIZE.
    function poseidon(uint256[2] calldata input) external view returns (uint256 out);
}
