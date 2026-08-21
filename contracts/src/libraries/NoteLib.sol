// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TalosTypes} from "../TalosTypes.sol";

/**
 * @title NoteLib
 * @author Talos
 * @notice Field-element validation and the frozen preimage layout for note
 *         commitments and nullifiers.
 * @dev The pool treats commitments and nullifiers as OPAQUE field elements — it
 *      never recomputes Poseidon on-chain (that is the circuit's job in Phase 3).
 *      This library therefore only (a) validates that a value is a canonical BN254
 *      field element and (b) records, in one authoritative place, the exact preimage
 *      ordering the Phase 3 circuits must hash. See `docs/protocol/specification.md`.
 *
 *      Frozen commitment preimage (Poseidon, arity 5):
 *          commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce)
 *
 *      Frozen nullifier preimage (Poseidon, arity 2):
 *          nullifier  = Poseidon(nullifierSecret, secret)
 *      where `nullifierSecret` is derived from the owner's spending key so that a
 *      given note yields exactly one nullifier and distinct notes yield
 *      cryptographically independent nullifiers.
 */
library NoteLib {
    /// @notice True iff `x` is a canonical BN254 field element (`0 <= x < FIELD_SIZE`).
    function isValidFieldElement(uint256 x) internal pure returns (bool) {
        return x < TalosTypes.FIELD_SIZE;
    }

    /// @notice True iff `commitment` is usable: a nonzero canonical field element.
    /// @dev Uniqueness (not-already-inserted) is storage-dependent and is enforced
    ///      by the pool, not here.
    function isWellFormedCommitment(uint256 commitment) internal pure returns (bool) {
        return commitment != 0 && commitment < TalosTypes.FIELD_SIZE;
    }

    /// @notice True iff `nullifier` is usable: a nonzero canonical field element.
    function isWellFormedNullifier(uint256 nullifier) internal pure returns (bool) {
        return nullifier != 0 && nullifier < TalosTypes.FIELD_SIZE;
    }

    /// @notice True iff `value` is within the protocol's allowed note-value range.
    function isValidValue(uint256 value) internal pure returns (bool) {
        return value != 0 && value <= TalosTypes.MAX_VALUE;
    }
}
