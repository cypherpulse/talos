// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITalosVerifier} from "./interfaces/ITalosVerifier.sol";
import {Talos__InvalidParameters} from "./TalosErrors.sol";

/**
 * @title TalosVerifier
 * @author Talos
 * @notice Production adapter that presents a snarkjs-generated PLONK verifier
 *         through the Phase 2 {ITalosVerifier} boundary.
 * @dev Phase 3. The generated verifiers (contracts/src/verifiers/*.sol) expose
 *      `verifyProof(uint256[24], uint256[N])` with a FIXED-size public-input array
 *      per circuit. The pool speaks the interface's dynamic `uint256[]`. This adapter
 *      bridges the two without touching the generated cryptography: it forwards the
 *      24-word proof and public signals verbatim via a low-level `staticcall`, so the
 *      real PLONK verification runs unchanged.
 *
 *      One adapter instance wraps one generated verifier and its exact public-signal
 *      count. A length mismatch, a verifier revert, or a `false` result all yield
 *      `false` — never a silent accept.
 *
 * @custom:security This adapter can only ever return what the generated verifier
 *      returns; it never fabricates a `true`.
 */
contract TalosVerifier is ITalosVerifier {
    /// @notice The snarkjs-generated PLONK verifier this adapter wraps.
    address public immutable verifier;

    /// @notice The exact number of public signals the wrapped circuit exposes.
    uint256 public immutable numPublicSignals;

    /// @dev Precomputed selector of `verifyProof(uint256[24],uint256[N])`.
    bytes4 private immutable _selector;

    /// @param verifier_ Address of the generated PLONK verifier.
    /// @param numPublicSignals_ The circuit's public-signal count (frozen per op).
    constructor(address verifier_, uint256 numPublicSignals_) {
        if (verifier_ == address(0) || numPublicSignals_ == 0) revert Talos__InvalidParameters();
        verifier = verifier_;
        numPublicSignals = numPublicSignals_;
        _selector = bytes4(
            keccak256(
                abi.encodePacked(
                    "verifyProof(uint256[24],uint256[", _toString(numPublicSignals_), "])"
                )
            )
        );
    }

    /// @inheritdoc ITalosVerifier
    /// @dev Reconstructs the generated verifier's static calldata (both fixed-size
    ///      arrays encode inline) and staticcalls it. Any failure ⇒ `false`.
    function verifyProof(uint256[24] calldata proof, uint256[] calldata publicSignals)
        external
        view
        override
        returns (bool)
    {
        if (publicSignals.length != numPublicSignals) return false;

        bytes memory data = abi.encodePacked(_selector, proof);
        for (uint256 i = 0; i < publicSignals.length; ++i) {
            data = abi.encodePacked(data, publicSignals[i]);
        }

        (bool ok, bytes memory ret) = verifier.staticcall(data);
        return ok && ret.length == 32 && abi.decode(ret, (bool));
    }

    /// @dev Minimal uint→decimal-string for selector construction.
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // Safe: (value % 10) ∈ [0,9] so 48 + it ∈ [48,57], within uint8.
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
