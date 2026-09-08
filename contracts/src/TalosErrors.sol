// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/*//////////////////////////////////////////////////////////////
                          TALOS ERRORS
//////////////////////////////////////////////////////////////*/

/**
 * @title TalosErrors
 * @author Talos
 * @notice Central catalogue of custom errors for the Talos protocol.
 * @dev Declared at file scope so every contract, library, and interface reverts
 *      with one shared, typed, gas-efficient error set instead of string reasons.
 *      Naming follows the `Talos__{Reason}` convention so a revert is unambiguous
 *      about which protocol emitted it. These are real, load-bearing errors.
 */

/*//////////////////////////////////////////////////////////////
                    FIELD / COMMITMENT VALIDATION
//////////////////////////////////////////////////////////////*/

/// @notice A commitment is zero, not a canonical BN254 field element, or already used.
error Talos__InvalidCommitment();

/// @notice A value that must be a canonical BN254 field element is out of range.
error Talos__InvalidFieldElement();

/*//////////////////////////////////////////////////////////////
                         PROOF / VERIFIER
//////////////////////////////////////////////////////////////*/

/// @notice The configured verifier rejected the proof.
error Talos__InvalidProof();

/// @notice No verifier is configured for the requested operation (zero address).
error Talos__InvalidVerifier();

/// @notice The Merkle root referenced by a spend is not in the known-root history.
error Talos__InvalidRoot();

/*//////////////////////////////////////////////////////////////
                       NULLIFIERS / REPLAY
//////////////////////////////////////////////////////////////*/

/// @notice The nullifier has already been consumed (double-spend / replay attempt).
error Talos__NullifierAlreadySpent();

/// @notice The same nullifier was supplied twice within a single operation.
error Talos__DuplicateNullifier();

/*//////////////////////////////////////////////////////////////
                        ASSET / ACCOUNTING
//////////////////////////////////////////////////////////////*/

/// @notice The recipient address is invalid (e.g. the zero address).
error Talos__InvalidRecipient();

/// @notice The asset id is not the single supported test asset.
error Talos__InvalidAsset();

/// @notice The amount is zero or exceeds the protocol's maximum note value.
error Talos__InvalidAmount();

/// @notice An ERC-20 `transfer`/`transferFrom` returned false or reverted.
error Talos__TransferFailed();

/*//////////////////////////////////////////////////////////////
                       GENERIC / STRUCTURAL
//////////////////////////////////////////////////////////////*/

/// @notice One or more parameters are structurally invalid.
error Talos__InvalidParameters();

/// @notice The append-only Merkle tree is full.
error Talos__MerkleTreeFull();

/// @notice A reentrant call was detected.
error Talos__ReentrantCall();

/*//////////////////////////////////////////////////////////////
                         ACCESS CONTROL
//////////////////////////////////////////////////////////////*/

/// @notice Caller is not the contract owner.
error Talos__NotOwner();

/// @notice The contract is paused.
error Talos__EnforcedPause();

/// @notice Verifiers are locked; changes must go through the timelocked propose/execute flow.
error Talos__VerifiersLocked();

/// @notice The verifier-change timelock has not yet elapsed.
error Talos__TimelockNotElapsed();

/// @notice No verifier change is pending for this operation.
error Talos__NoPendingVerifier();

/*//////////////////////////////////////////////////////////////
                          PHASE BOUNDARY
//////////////////////////////////////////////////////////////*/

/// @notice Functionality intentionally not implemented until a later phase.
error Talos__NotImplemented();
