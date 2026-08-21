// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title ITalosVerifier
/// @notice Common verification boundary for every private Talos operation.
/// @dev Phase 2 defines the boundary; Phase 3 plugs in the snarkjs-generated
///      Groth16 verifier(s) behind this interface, one per operation. The
///      `publicSignals` array carries the operation's frozen public inputs in the
///      exact order documented in docs/protocol/specification.md.
///
///      This interface must NEVER be implemented by a component that returns
///      `true` unconditionally in production. In Phase 2 the only implementations
///      are (a) a placeholder that reverts and (b) an explicitly test-only mock.
interface ITalosVerifier {
    /// @notice Verify a Groth16 proof over the given public signals.
    /// @param a  Groth16 proof element A.
    /// @param b  Groth16 proof element B.
    /// @param c  Groth16 proof element C.
    /// @param publicSignals The operation's public inputs, in frozen order.
    /// @return valid True iff the proof is valid for `publicSignals`.
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicSignals
    ) external view returns (bool valid);
}
