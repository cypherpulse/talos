// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title TalosTypes
 * @author Talos
 * @notice Frozen protocol constants and shared types for the Talos MVP.
 * @dev Every constant here is part of the frozen Phase 2 specification
 *      (see `docs/protocol/specification.md`). The Phase 3 Circom circuits MUST
 *      match these values exactly, or on-chain verification will fail. Treat this
 *      file as the single source of truth for protocol-wide constants.
 */
library TalosTypes {
    /*//////////////////////////////////////////////////////////////
                            FIELD ARITHMETIC
    //////////////////////////////////////////////////////////////*/

    /// @notice BN254 scalar field modulus `r`. Commitments, nullifiers, and Merkle
    ///         nodes are elements of GF(r); Poseidon (Phase 3) operates in this field.
    uint256 internal constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /*//////////////////////////////////////////////////////////////
                              MERKLE TREE
    //////////////////////////////////////////////////////////////*/

    /// @notice Depth of the append-only commitment Merkle tree. 2**20 ≈ 1,048,576
    ///         leaves for the MVP. Frozen — the Phase 3 membership circuit uses it.
    uint256 internal constant MERKLE_DEPTH = 20;

    /// @notice Number of historical roots retained so proofs built against a
    ///         slightly stale root still verify (avoids races with insertions).
    uint256 internal constant ROOT_HISTORY_SIZE = 30;

    /// @notice Zero-leaf value seeding empty subtrees of the Merkle tree.
    /// @dev `keccak256("Talos")` interpreted as a uint256; it is already < FIELD_SIZE,
    ///      so `keccak256("Talos") % FIELD_SIZE` equals this literal. Frozen.
    uint256 internal constant ZERO_VALUE =
        0x00690d5549b641a93200f57d5dff1c979ffbb084c3b78d4bf51ed712f2dd431f;

    /*//////////////////////////////////////////////////////////////
                                 ASSET
    //////////////////////////////////////////////////////////////*/

    /// @notice The single supported test asset's protocol id for the MVP.
    /// @dev A note's `assetId` field must equal this. Multi-asset support (a registry
    ///      mapping assetId → token) is an explicit future extension, out of scope.
    uint256 internal constant ASSET_ID = 1;

    /// @notice Maximum note value (fits in 128 bits) so in-circuit value sums cannot
    ///         overflow the field. Frozen.
    uint256 internal constant MAX_VALUE = type(uint128).max;

    /*//////////////////////////////////////////////////////////////
                             TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The private, MVP-shaped operations that consume/produce notes.
    /// @dev Deposit is public and needs no proof in Phase 2, so it is not listed.
    enum Operation {
        Transfer, // 1 note  -> 2 notes
        Split, //    1 note  -> 2 notes
        Merge, //    2 notes -> 1 note
        Withdraw //  1 note  -> public recipient
    }

    /// @notice A Groth16 proof in the encoding snarkjs' Solidity verifier expects.
    /// @dev The concrete verifier is generated in Phase 3; freezing this shape keeps
    ///      the pool's calldata layout stable when the real verifier is wired in.
    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    /// @notice The canonical private note. NEVER stored on-chain — only its
    ///         commitment is. Defined here as the frozen field layout from which the
    ///         commitment and nullifier are derived (see `NoteLib` and the spec).
    /// @dev `value` is bounded by `MAX_VALUE`; all other fields are field elements.
    struct Note {
        uint256 assetId; // must equal ASSET_ID for the MVP
        uint256 value; // <= MAX_VALUE
        uint256 ownerPubKey; // Poseidon-based spending public key
        uint256 secret; // per-note random secret
        uint256 nonce; // per-note random nonce (uniqueness / domain separation)
    }
}
