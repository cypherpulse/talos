// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/*//////////////////////////////////////////////////////////////
                              IMPORTS
//////////////////////////////////////////////////////////////*/

import {ITalosPool} from "./interfaces/ITalosPool.sol";
import {ITalosVerifier} from "./interfaces/ITalosVerifier.sol";
import {IHasher} from "./interfaces/IHasher.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {TalosTypes} from "./TalosTypes.sol";
import {NoteLib} from "./libraries/NoteLib.sol";
import {MerkleTreeLib} from "./libraries/MerkleTreeLib.sol";
import {
    Talos__InvalidCommitment,
    Talos__InvalidFieldElement,
    Talos__InvalidProof,
    Talos__InvalidVerifier,
    Talos__InvalidRoot,
    Talos__NullifierAlreadySpent,
    Talos__DuplicateNullifier,
    Talos__InvalidRecipient,
    Talos__InvalidAsset,
    Talos__InvalidAmount,
    Talos__TransferFailed,
    Talos__InvalidParameters,
    Talos__ReentrantCall,
    Talos__NotOwner,
    Talos__EnforcedPause
} from "./TalosErrors.sol";

/**
 * @title TalosPool
 * @author Talos
 * @notice The Talos privacy pool: the on-chain root of protocol state for the MVP.
 *         It owns four concerns, kept strictly separated:
 *           1. protocol state ..... the append-only commitment Merkle tree and the
 *                                    spent-nullifier / inserted-commitment sets;
 *           2. cryptography ....... a pluggable Merkle {IHasher} and per-operation
 *                                    {ITalosVerifier} proof-verification boundary;
 *           3. token accounting ... the immutable single ERC-20 test `asset`;
 *           4. administration ..... `owner`, `paused`, and verifier configuration.
 *
 *         Supported operations: Deposit (public → 1 note), Transfer (1 → 2),
 *         Split (1 → 2), Merge (2 → 1), Withdraw (1 → public recipient).
 *
 * @dev CRYPTOGRAPHIC BOUNDARY. This contract implements the protocol *state
 *      machine* and delegates cryptography through two pluggable seams: the Merkle
 *      {IHasher} and the per-operation {ITalosVerifier}. As of Phase 3 these are the
 *      REAL primitives — the circomlib Poseidon(2) contract and the snarkjs-generated
 *      Groth16 verifiers (behind the {TalosVerifier} adapter). Security therefore
 *      reduces to Groth16 soundness + Poseidon + the trusted setup: the pool never
 *      fabricates a proof result and cannot move value without a verified proof.
 *      A deployment is only as sound as the verifiers configured into it.
 *      See `docs/protocol/zk-system.md` and `docs/security/threat-model.md`.
 *
 * @custom:security-contact security@talos.example
 * @custom:invariant One note ⇒ one nullifier ⇒ at most one successful spend.
 */
contract TalosPool is ITalosPool {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    using MerkleTreeLib for MerkleTreeLib.Tree;
    using NoteLib for uint256;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    // --- Reentrancy guard sentinels ---
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // --- Immutable configuration (set once, at deployment) ---

    /// @notice The single supported ERC-20 test asset. Fixed at deployment so user
    ///         funds can never be stranded by an asset switch.
    IERC20 public immutable asset;

    /// @notice The injected 2-arity hasher used to build the Merkle tree
    ///         (circomlib Poseidon(2) from Phase 3 onward).
    IHasher public immutable hasher;

    // --- Administrative state ---

    /// @notice The privileged administrator. Powers: configure per-operation
    ///         verifiers, pause/unpause, transfer ownership. The owner CANNOT move
    ///         user funds, forge proofs, spend notes, or alter Merkle state.
    address public owner;

    /// @notice When true, all state-changing protocol operations are blocked.
    bool public paused;

    /// @notice Per-operation proof verifier. The zero address means "unconfigured".
    mapping(TalosTypes.Operation operation => ITalosVerifier verifier) public verifiers;

    // --- Protocol state ---

    /// @notice Consumed nullifiers. `true` ⇒ the corresponding note was spent.
    mapping(uint256 nullifier => bool spent) public isNullifierSpent;

    /// @notice Inserted commitments, used to reject accidental duplicate insertion.
    mapping(uint256 commitment => bool inserted) public commitmentInserted;

    /// @dev Reentrancy guard status. Initialized to `_NOT_ENTERED`.
    uint256 private _status = _NOT_ENTERED;

    /// @dev The append-only commitment Merkle tree with bounded root history.
    MerkleTreeLib.Tree private _tree;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    // Protocol events are declared in {ITalosPool}. Administrative events below.

    /// @notice Emitted when ownership moves from `previousOwner` to `newOwner`.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when the verifier for `operation` is set to `verifier`.
    event VerifierUpdated(TalosTypes.Operation indexed operation, address indexed verifier);

    /// @notice Emitted when the pause flag is set to `paused`.
    event PausedSet(bool paused);

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Restricts a function to the current `owner`.
    modifier onlyOwner() {
        if (msg.sender != owner) revert Talos__NotOwner();
        _;
    }

    /// @dev Blocks the call while the contract is paused.
    modifier whenNotPaused() {
        if (paused) revert Talos__EnforcedPause();
        _;
    }

    /// @dev Prevents reentrancy on functions that make external calls.
    modifier nonReentrant() {
        if (_status == _ENTERED) revert Talos__ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param asset_ The single supported ERC-20 test asset.
     * @param hasher_ The 2-arity hasher for the Merkle tree (Poseidon in Phase 3).
     * @param owner_ The initial administrator.
     */
    constructor(IERC20 asset_, IHasher hasher_, address owner_) {
        if (address(asset_) == address(0) || address(hasher_) == address(0) || owner_ == address(0))
        {
            revert Talos__InvalidParameters();
        }

        asset = asset_;
        hasher = hasher_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);

        _tree.init(
            hasher_, TalosTypes.MERKLE_DEPTH, TalosTypes.ROOT_HISTORY_SIZE, TalosTypes.ZERO_VALUE
        );
    }

    /*//////////////////////////////////////////////////////////////
                     EXTERNAL FUNCTIONS - PROTOCOL
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ITalosPool
    /// @dev Public → 1 note. No proof in Phase 2; the Phase 3 deposit circuit binds
    ///      `commitment` to `[assetId, amount]`. Follows Checks-Effects-Interactions:
    ///      the commitment is recorded before the token pull, and the whole call is
    ///      atomic, so state only persists if the transfer succeeds.
    function deposit(uint256 assetId, uint256 amount, uint256 commitment)
        external
        whenNotPaused
        nonReentrant
    {
        // --- Checks ---
        if (assetId != TalosTypes.ASSET_ID) revert Talos__InvalidAsset();
        if (!amount.isValidValue()) revert Talos__InvalidAmount();
        _validateNewCommitment(commitment);

        // --- Effects ---
        (uint256 index, uint256 newRoot) = _insertCommitment(commitment);
        emit Deposit(commitment, index, assetId, amount, newRoot);

        // --- Interactions ---
        _safeTransferFrom(asset, msg.sender, address(this), amount);
    }

    /// @inheritdoc ITalosPool
    /// @dev 1 note → 2 notes. The circuit (Phase 3) proves `input = out1 + out2`.
    function transfer(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2
    ) external whenNotPaused {
        _spendOneToTwo(
            TalosTypes.Operation.Transfer,
            proof,
            root,
            nullifier,
            outputCommitment1,
            outputCommitment2
        );

        _insertCommitment(outputCommitment1);
        (, uint256 newRoot) = _insertCommitment(outputCommitment2);

        emit PrivateTransfer(nullifier, outputCommitment1, outputCommitment2, newRoot);
    }

    /// @inheritdoc ITalosPool
    /// @dev 1 note → 2 notes. The circuit (Phase 3) proves `input = out1 + out2`.
    function split(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2
    ) external whenNotPaused {
        _spendOneToTwo(
            TalosTypes.Operation.Split, proof, root, nullifier, outputCommitment1, outputCommitment2
        );

        _insertCommitment(outputCommitment1);
        (, uint256 newRoot) = _insertCommitment(outputCommitment2);

        emit Split(nullifier, outputCommitment1, outputCommitment2, newRoot);
    }

    /// @inheritdoc ITalosPool
    /// @dev 2 notes → 1 note. The circuit (Phase 3) proves `in1 + in2 = out`. Both
    ///      nullifiers must differ and be unspent.
    function merge(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier1,
        uint256 nullifier2,
        uint256 outputCommitment
    ) external whenNotPaused {
        // --- Checks ---
        if (!isKnownRoot(root)) revert Talos__InvalidRoot();
        if (nullifier1 == nullifier2) revert Talos__DuplicateNullifier();
        _requireUnspentNullifier(nullifier1);
        _requireUnspentNullifier(nullifier2);
        _validateNewCommitment(outputCommitment);

        uint256[] memory signals = new uint256[](4);
        signals[0] = root;
        signals[1] = nullifier1;
        signals[2] = nullifier2;
        signals[3] = outputCommitment;
        _verify(TalosTypes.Operation.Merge, proof, signals);

        // --- Effects ---
        _spendNullifier(nullifier1);
        _spendNullifier(nullifier2);
        (, uint256 newRoot) = _insertCommitment(outputCommitment);

        emit Merge(nullifier1, nullifier2, outputCommitment, newRoot);
    }

    /// @inheritdoc ITalosPool
    /// @dev 1 note → public recipient. The `recipient` and `amount` are public inputs,
    ///      binding the proof to this exact payout so it cannot be replayed elsewhere.
    ///      Follows Checks-Effects-Interactions with the token transfer performed last.
    function withdraw(
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 amount,
        address recipient,
        uint256 assetId
    ) external whenNotPaused nonReentrant {
        // --- Checks ---
        if (!isKnownRoot(root)) revert Talos__InvalidRoot();
        if (recipient == address(0)) revert Talos__InvalidRecipient();
        if (assetId != TalosTypes.ASSET_ID) revert Talos__InvalidAsset();
        if (!amount.isValidValue()) revert Talos__InvalidAmount();
        _requireUnspentNullifier(nullifier);

        uint256[] memory signals = new uint256[](5);
        signals[0] = root;
        signals[1] = nullifier;
        signals[2] = amount;
        signals[3] = uint256(uint160(recipient));
        signals[4] = assetId;
        _verify(TalosTypes.Operation.Withdraw, proof, signals);

        // --- Effects ---
        _spendNullifier(nullifier);

        // --- Interactions ---
        _safeTransfer(asset, recipient, amount);

        emit Withdrawal(nullifier, recipient, assetId, amount);
    }

    /*//////////////////////////////////////////////////////////////
                    EXTERNAL FUNCTIONS - ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Configure the verifier for a given operation.
    /// @param operation The operation whose verifier is being set.
    /// @param verifier The verifier contract; must be nonzero.
    function setVerifier(TalosTypes.Operation operation, ITalosVerifier verifier)
        external
        onlyOwner
    {
        if (address(verifier) == address(0)) revert Talos__InvalidVerifier();
        verifiers[operation] = verifier;
        emit VerifierUpdated(operation, address(verifier));
    }

    /// @notice Pause or unpause all state-changing protocol operations.
    /// @param paused_ The new pause state.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Transfer ownership to `newOwner`.
    /// @param newOwner The new administrator; must be nonzero.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert Talos__InvalidParameters();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                        PUBLIC / EXTERNAL VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ITalosPool
    function getLastRoot() external view returns (uint256) {
        return _tree.getLastRoot();
    }

    /// @notice The index the next inserted commitment will occupy.
    function nextLeafIndex() external view returns (uint256) {
        return _tree.nextLeafIndex;
    }

    /// @notice The frozen Merkle depth.
    function merkleDepth() external pure returns (uint256) {
        return TalosTypes.MERKLE_DEPTH;
    }

    /// @inheritdoc ITalosPool
    function isKnownRoot(uint256 root) public view returns (bool) {
        return _tree.isKnownRoot(root);
    }

    /*//////////////////////////////////////////////////////////////
                    PRIVATE FUNCTIONS - STATE TRANSITIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Shared logic for the two 1-input/2-output operations (Transfer & Split):
     *      validate the root, nullifier, and both fresh output commitments, verify
     *      the proof over the frozen public signals `[root, nullifier, out1, out2]`,
     *      then consume the nullifier. Output insertion is done by the caller.
     */
    function _spendOneToTwo(
        TalosTypes.Operation operation,
        TalosTypes.Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 outputCommitment1,
        uint256 outputCommitment2
    ) private {
        // --- Checks ---
        if (!isKnownRoot(root)) revert Talos__InvalidRoot();
        _requireUnspentNullifier(nullifier);
        if (outputCommitment1 == outputCommitment2) revert Talos__InvalidCommitment();
        _validateNewCommitment(outputCommitment1);
        _validateNewCommitment(outputCommitment2);

        uint256[] memory signals = new uint256[](4);
        signals[0] = root;
        signals[1] = nullifier;
        signals[2] = outputCommitment1;
        signals[3] = outputCommitment2;
        _verify(operation, proof, signals);

        // --- Effects ---
        _spendNullifier(nullifier);
    }

    /// @dev Marks `commitment` inserted, appends it to the tree, and emits events.
    function _insertCommitment(uint256 commitment)
        private
        returns (uint256 index, uint256 newRoot)
    {
        commitmentInserted[commitment] = true;
        (index, newRoot) = _tree.insert(hasher, commitment);
        emit CommitmentInserted(commitment, index, newRoot);
        emit RootUpdated(newRoot, index);
    }

    /// @dev Records a nullifier as spent and announces it.
    function _spendNullifier(uint256 nullifier) private {
        isNullifierSpent[nullifier] = true;
        emit NullifierSpent(nullifier);
    }

    /*//////////////////////////////////////////////////////////////
                     PRIVATE FUNCTIONS - VALIDATION
    //////////////////////////////////////////////////////////////*/

    /// @dev Reverts unless the per-operation verifier accepts the proof/signals.
    function _verify(
        TalosTypes.Operation operation,
        TalosTypes.Proof calldata proof,
        uint256[] memory signals
    ) private view {
        ITalosVerifier verifier = verifiers[operation];
        if (address(verifier) == address(0)) revert Talos__InvalidVerifier();
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, signals)) {
            revert Talos__InvalidProof();
        }
    }

    /// @dev Reverts if `nullifier` is malformed or already spent.
    function _requireUnspentNullifier(uint256 nullifier) private view {
        if (!nullifier.isWellFormedNullifier()) revert Talos__InvalidFieldElement();
        if (isNullifierSpent[nullifier]) revert Talos__NullifierAlreadySpent();
    }

    /// @dev Reverts if `commitment` is malformed or has already been inserted.
    function _validateNewCommitment(uint256 commitment) private view {
        if (!commitment.isWellFormedCommitment()) revert Talos__InvalidCommitment();
        if (commitmentInserted[commitment]) revert Talos__InvalidCommitment();
    }

    /*//////////////////////////////////////////////////////////////
                   PRIVATE FUNCTIONS - SAFE ERC-20
    //////////////////////////////////////////////////////////////*/

    /// @dev ERC-20 `transfer` that reverts on failure and tolerates non-standard
    ///      tokens that omit a boolean return value.
    function _safeTransfer(IERC20 token, address to, uint256 amount) private {
        _callOptionalReturn(
            address(token), abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
    }

    /// @dev ERC-20 `transferFrom` that reverts on failure and tolerates non-standard
    ///      tokens that omit a boolean return value.
    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) private {
        _callOptionalReturn(
            address(token), abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
    }

    /// @dev Low-level token call that treats a revert, or a returned `false`, as
    ///      failure. An empty return (non-standard token) is treated as success.
    function _callOptionalReturn(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert Talos__TransferFailed();
    }
}
