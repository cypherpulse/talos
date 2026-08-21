// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITalosVerifier} from "../../src/interfaces/ITalosVerifier.sol";

/// @title MockVerifier
/// @notice A controllable {ITalosVerifier} for exercising TalosPool's state machine.
/// @dev TEST-ONLY. This is NOT a proof system and provides NO security. It exists
///      solely so contract tests can drive both the accept and reject paths of the
///      pool without a real Groth16 verifier (which arrives in Phase 3). It must
///      never be deployed to production; the pool has no dependency on it.
///
///      `verifyProof` is `view` (matching the interface, since the pool calls it via
///      staticcall), so it simply returns the configured `result`.
contract MockVerifier is ITalosVerifier {
    bool public result;

    constructor(bool result_) {
        result = result_;
    }

    /// @notice Set the boolean this mock returns for subsequent verifications.
    function setResult(bool result_) external {
        result = result_;
    }

    /// @inheritdoc ITalosVerifier
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[] calldata
    ) external view override returns (bool) {
        return result;
    }
}
