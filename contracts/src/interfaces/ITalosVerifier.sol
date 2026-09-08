// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title ITalosVerifier
/// @notice Common verification boundary for every private Talos operation.
/// @dev Phase 2 defines the boundary; Phase 3 plugs in the snarkjs-generated
///      PLONK verifier(s) behind this interface, one per operation. The
///      `publicSignals` array carries the operation's frozen public inputs in the
///      exact order documented in docs/protocol/specification.md.
///
///      This interface must NEVER be implemented by a component that returns
///      `true` unconditionally in production. In Phase 2 the only implementations
///      are (a) a placeholder that reverts and (b) an explicitly test-only mock.
interface ITalosVerifier {
    /// @notice Verify a PLONK proof over the given public signals.
    /// @param proof The flat `uint256[24]` PLONK proof (snarkjs encoding).
    /// @param publicSignals The operation's public inputs, in frozen order.
    /// @return valid True iff the proof is valid for `publicSignals`.
    function verifyProof(uint256[24] calldata proof, uint256[] calldata publicSignals)
        external
        view
        returns (bool valid);
}
