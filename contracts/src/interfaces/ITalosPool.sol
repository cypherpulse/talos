// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TalosTypes} from "../TalosTypes.sol";

/// @title ITalosPool
/// @notice The public protocol surface of the Talos privacy pool and the events an
///         indexer consumes. Administrative functions are intentionally excluded.
/// @dev Every event carries only public information — never note secrets, keys, or
///      witness data. The `publicSignals` bound by each proof are defined in
///      docs/protocol/specification.md and implemented by the Phase 3 circuits and
///      the generated Groth16 verifiers.
interface ITalosPool {
    // -------------------------------------------------------------------------
    // Events (public data only)
    // -------------------------------------------------------------------------

    /// @notice A public deposit created one note commitment.
    event Deposit(
        uint256 indexed commitment,
        uint256 indexed leafIndex,
        uint256 assetId,
        uint256 amount,
        uint256 newRoot
    );

    /// @notice A commitment was appended to the Merkle tree.
    event CommitmentInserted(
        uint256 indexed commitment, uint256 indexed leafIndex, uint256 newRoot
    );

    /// @notice A private transfer: 1 input note -> 2 output commitments.
    event PrivateTransfer(
        uint256 indexed nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2,
        uint256 newRoot
    );

    /// @notice A split: 1 input note -> 2 output commitments.
    event Split(
        uint256 indexed nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2,
        uint256 newRoot
    );

    /// @notice A merge: 2 input notes -> 1 output commitment.
    event Merge(
        uint256 indexed nullifier1,
        uint256 indexed nullifier2,
        uint256 outputCommitment,
        uint256 newRoot
    );

    /// @notice A withdrawal: 1 input note -> public recipient.
    event Withdrawal(
        uint256 indexed nullifier, address indexed recipient, uint256 assetId, uint256 amount
    );

    /// @notice A nullifier was consumed. Emitted once per spent note.
    event NullifierSpent(uint256 indexed nullifier);

    /// @notice The Merkle root advanced to `newRoot` after inserting `leafIndex`.
    event RootUpdated(uint256 indexed newRoot, uint256 leafIndex);

    // -------------------------------------------------------------------------
    // Protocol operations
    // -------------------------------------------------------------------------

    /// @notice Deposit a registered asset and create one note commitment. Send native
    ///         value when the asset is the chain's native token (OKB); otherwise the
    ///         ERC-20 `amount` is pulled via transferFrom and no value may be sent.
    function deposit(
        TalosTypes.Proof calldata proof,
        uint256 assetId,
        uint256 amount,
        uint256 commitment
    ) external payable;

    /// @notice Private transfer: consume one note, create two output commitments.
    function transfer(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2
    ) external;

    /// @notice Split: consume one note, create two output commitments.
    function split(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2
    ) external;

    /// @notice Merge: consume two notes, create one output commitment.
    function merge(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier1,
        uint256 nullifier2,
        uint256 outputCommitment
    ) external;

    /// @notice Withdraw: consume one note, pay the public asset to `recipient`.
    function withdraw(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 amount,
        address recipient,
        uint256 assetId
    ) external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice The most recent Merkle root.
    function getLastRoot() external view returns (uint256);

    /// @notice Whether `root` is within the retained root history.
    function isKnownRoot(uint256 root) external view returns (bool);

    /// @notice Whether `nullifier` has been consumed.
    function isNullifierSpent(uint256 nullifier) external view returns (bool);
}
