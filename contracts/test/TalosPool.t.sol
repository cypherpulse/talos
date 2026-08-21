// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TalosTestBase} from "./TalosTestBase.t.sol";
import {TalosPool} from "../src/TalosPool.sol";
import {ITalosPool} from "../src/interfaces/ITalosPool.sol";
import {ITalosVerifier} from "../src/interfaces/ITalosVerifier.sol";
import {ITalosAssetRegistry} from "../src/interfaces/ITalosAssetRegistry.sol";
import {IHasher} from "../src/interfaces/IHasher.sol";
import {TalosTypes} from "../src/TalosTypes.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {
    Talos__InvalidCommitment,
    Talos__InvalidProof,
    Talos__InvalidVerifier,
    Talos__InvalidRoot,
    Talos__NullifierAlreadySpent,
    Talos__DuplicateNullifier,
    Talos__InvalidRecipient,
    Talos__InvalidAsset,
    Talos__InvalidAmount,
    Talos__InvalidParameters,
    Talos__NotOwner,
    Talos__EnforcedPause
} from "../src/TalosErrors.sol";

/**
 * @title TalosPoolTest
 * @notice Behavioural tests for the Talos protocol state machine: deposit, the four
 *         private operations, nullifier/replay protection, Merkle state, token
 *         accounting, and access control.
 * @dev The proof verifier is a controllable mock; these tests assert the CONTRACT's
 *      state transitions, not ZK soundness (which is a Phase 3 concern).
 */
contract TalosPoolTest is TalosTestBase {
    /*//////////////////////////////////////////////////////////////
                                DEPOSIT
    //////////////////////////////////////////////////////////////*/

    function test_Deposit_Valid() public {
        uint256 commitment = _fe();
        uint256 rootBefore = pool.getLastRoot();

        _deposit(commitment, AMOUNT);

        assertEq(token.balanceOf(address(pool)), AMOUNT, "pool did not receive tokens");
        assertEq(token.balanceOf(address(this)), 0, "depositor not debited");
        assertTrue(pool.commitmentInserted(commitment), "commitment not recorded");
        assertEq(pool.nextLeafIndex(), 1, "leaf index did not advance");
        assertTrue(pool.getLastRoot() != rootBefore, "root did not change");
        assertTrue(pool.isKnownRoot(pool.getLastRoot()), "new root not known");
    }

    function test_Deposit_EmitsEvents() public {
        uint256 commitment = _fe();
        token.mint(address(this), AMOUNT);
        token.approve(address(pool), AMOUNT);

        // Assert the indexed topics of Deposit (commitment, leafIndex); ignore data.
        // mint/approve happen above so the only logs under assertion are the pool's.
        vm.expectEmit(true, true, false, false);
        emit ITalosPool.Deposit(commitment, 0, 0, 0, 0);
        pool.deposit(TalosTypes.ASSET_ID, AMOUNT, commitment);
    }

    function test_Deposit_MultipleAdvanceLeafIndex() public {
        _deposit(_fe(), AMOUNT);
        _deposit(_fe(), AMOUNT);
        _deposit(_fe(), AMOUNT);
        assertEq(pool.nextLeafIndex(), 3);
        assertEq(token.balanceOf(address(pool)), 3 * AMOUNT);
    }

    function test_Deposit_RevertsOnZeroAmount() public {
        vm.expectRevert(Talos__InvalidAmount.selector);
        pool.deposit(TalosTypes.ASSET_ID, 0, _fe());
    }

    function test_Deposit_RevertsOnAmountTooLarge() public {
        uint256 tooLarge = uint256(type(uint128).max) + 1;
        vm.expectRevert(Talos__InvalidAmount.selector);
        pool.deposit(TalosTypes.ASSET_ID, tooLarge, _fe());
    }

    function test_Deposit_RevertsOnInvalidAsset() public {
        vm.expectRevert(Talos__InvalidAsset.selector);
        pool.deposit(TalosTypes.ASSET_ID + 1, AMOUNT, _fe());
    }

    function test_Deposit_RevertsOnZeroCommitment() public {
        vm.expectRevert(Talos__InvalidCommitment.selector);
        pool.deposit(TalosTypes.ASSET_ID, AMOUNT, 0);
    }

    function test_Deposit_RevertsOnNonFieldCommitment() public {
        vm.expectRevert(Talos__InvalidCommitment.selector);
        pool.deposit(TalosTypes.ASSET_ID, AMOUNT, TalosTypes.FIELD_SIZE); // == r is out of range
    }

    function test_Deposit_RevertsOnDuplicateCommitment() public {
        uint256 commitment = _fe();
        _deposit(commitment, AMOUNT);

        token.mint(address(this), AMOUNT);
        token.approve(address(pool), AMOUNT);
        vm.expectRevert(Talos__InvalidCommitment.selector);
        pool.deposit(TalosTypes.ASSET_ID, AMOUNT, commitment);
    }

    function test_Deposit_RevertsWhenPaused() public {
        pool.setPaused(true);
        token.mint(address(this), AMOUNT);
        token.approve(address(pool), AMOUNT);
        vm.expectRevert(Talos__EnforcedPause.selector);
        pool.deposit(TalosTypes.ASSET_ID, AMOUNT, _fe());
    }

    /*//////////////////////////////////////////////////////////////
                                TRANSFER
    //////////////////////////////////////////////////////////////*/

    function test_Transfer_Valid() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 nullifier = _fe();
        uint256 out1 = _fe();
        uint256 out2 = _fe();
        uint256 leavesBefore = pool.nextLeafIndex();

        pool.transfer(_proof(), root, nullifier, out1, out2);

        assertTrue(pool.isNullifierSpent(nullifier), "nullifier not consumed");
        assertTrue(pool.commitmentInserted(out1), "out1 not inserted");
        assertTrue(pool.commitmentInserted(out2), "out2 not inserted");
        assertEq(pool.nextLeafIndex(), leavesBefore + 2, "two leaves not inserted");
    }

    function test_Transfer_RevertsOnInvalidProof() public {
        uint256 root = _seedDepositAndGetRoot();
        verifier.setResult(false);
        vm.expectRevert(Talos__InvalidProof.selector);
        pool.transfer(_proof(), root, _fe(), _fe(), _fe());
    }

    function test_Transfer_RevertsOnUnknownRoot() public {
        _seedDepositAndGetRoot();
        vm.expectRevert(Talos__InvalidRoot.selector);
        pool.transfer(_proof(), _fe(), _fe(), _fe(), _fe());
    }

    function test_Transfer_RevertsOnSpentNullifier() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 nullifier = _fe();
        pool.transfer(_proof(), root, nullifier, _fe(), _fe());

        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.transfer(_proof(), root, nullifier, _fe(), _fe());
    }

    function test_Transfer_RevertsOnDuplicateOutputs() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 out = _fe();
        vm.expectRevert(Talos__InvalidCommitment.selector);
        pool.transfer(_proof(), root, _fe(), out, out);
    }

    function test_Transfer_RevertsWhenVerifierUnset() public {
        // Fresh pool with no verifiers configured.
        TalosPool bare =
            new TalosPool(ITalosAssetRegistry(address(registry)), IHasher(address(hasher)), owner);
        uint256 root = bare.getLastRoot();
        vm.expectRevert(Talos__InvalidVerifier.selector);
        bare.transfer(_proof(), root, _fe(), _fe(), _fe());
    }

    /*//////////////////////////////////////////////////////////////
                                 SPLIT
    //////////////////////////////////////////////////////////////*/

    function test_Split_Valid() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 nullifier = _fe();
        uint256 out1 = _fe();
        uint256 out2 = _fe();
        uint256 leavesBefore = pool.nextLeafIndex();

        pool.split(_proof(), root, nullifier, out1, out2);

        assertTrue(pool.isNullifierSpent(nullifier));
        assertTrue(pool.commitmentInserted(out1));
        assertTrue(pool.commitmentInserted(out2));
        assertEq(pool.nextLeafIndex(), leavesBefore + 2);
    }

    function test_Split_RevertsOnInvalidProof() public {
        uint256 root = _seedDepositAndGetRoot();
        verifier.setResult(false);
        vm.expectRevert(Talos__InvalidProof.selector);
        pool.split(_proof(), root, _fe(), _fe(), _fe());
    }

    function test_Split_RevertsOnSpentNullifier() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 nullifier = _fe();
        pool.split(_proof(), root, nullifier, _fe(), _fe());
        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.split(_proof(), root, nullifier, _fe(), _fe());
    }

    /*//////////////////////////////////////////////////////////////
                                 MERGE
    //////////////////////////////////////////////////////////////*/

    function test_Merge_Valid() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 n1 = _fe();
        uint256 n2 = _fe();
        uint256 out = _fe();
        uint256 leavesBefore = pool.nextLeafIndex();

        pool.merge(_proof(), root, n1, n2, out);

        assertTrue(pool.isNullifierSpent(n1), "nullifier1 not consumed");
        assertTrue(pool.isNullifierSpent(n2), "nullifier2 not consumed");
        assertTrue(pool.commitmentInserted(out), "output not inserted");
        assertEq(pool.nextLeafIndex(), leavesBefore + 1, "one leaf not inserted");
    }

    function test_Merge_RevertsOnDuplicateNullifier() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 n = _fe();
        vm.expectRevert(Talos__DuplicateNullifier.selector);
        pool.merge(_proof(), root, n, n, _fe());
    }

    function test_Merge_RevertsOnSpentNullifier() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 n1 = _fe();
        uint256 n2 = _fe();
        pool.merge(_proof(), root, n1, n2, _fe());

        // Reusing either consumed nullifier must fail.
        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.merge(_proof(), root, n1, _fe(), _fe());
    }

    function test_Merge_RevertsOnInvalidProof() public {
        uint256 root = _seedDepositAndGetRoot();
        verifier.setResult(false);
        vm.expectRevert(Talos__InvalidProof.selector);
        pool.merge(_proof(), root, _fe(), _fe(), _fe());
    }

    /*//////////////////////////////////////////////////////////////
                               WITHDRAW
    //////////////////////////////////////////////////////////////*/

    function test_Withdraw_Valid() public {
        uint256 root = _seedDepositAndGetRoot(); // funds the pool with AMOUNT
        uint256 nullifier = _fe();
        uint256 poolBefore = token.balanceOf(address(pool));

        pool.withdraw(_proof(), root, nullifier, AMOUNT, bob, TalosTypes.ASSET_ID);

        assertEq(token.balanceOf(bob), AMOUNT, "recipient did not receive funds");
        assertEq(token.balanceOf(address(pool)), poolBefore - AMOUNT, "pool not debited");
        assertTrue(pool.isNullifierSpent(nullifier), "nullifier not consumed");
    }

    function test_Withdraw_RevertsOnInvalidRecipient() public {
        uint256 root = _seedDepositAndGetRoot();
        vm.expectRevert(Talos__InvalidRecipient.selector);
        pool.withdraw(_proof(), root, _fe(), AMOUNT, address(0), TalosTypes.ASSET_ID);
    }

    function test_Withdraw_RevertsOnInvalidAsset() public {
        uint256 root = _seedDepositAndGetRoot();
        vm.expectRevert(Talos__InvalidAsset.selector);
        pool.withdraw(_proof(), root, _fe(), AMOUNT, bob, TalosTypes.ASSET_ID + 1);
    }

    function test_Withdraw_RevertsOnInvalidAmount() public {
        uint256 root = _seedDepositAndGetRoot();
        vm.expectRevert(Talos__InvalidAmount.selector);
        pool.withdraw(_proof(), root, _fe(), 0, bob, TalosTypes.ASSET_ID);
    }

    function test_Withdraw_RevertsOnUnknownRoot() public {
        _seedDepositAndGetRoot();
        vm.expectRevert(Talos__InvalidRoot.selector);
        pool.withdraw(_proof(), _fe(), _fe(), AMOUNT, bob, TalosTypes.ASSET_ID);
    }

    function test_Withdraw_RevertsOnInvalidProof() public {
        uint256 root = _seedDepositAndGetRoot();
        verifier.setResult(false);
        vm.expectRevert(Talos__InvalidProof.selector);
        pool.withdraw(_proof(), root, _fe(), AMOUNT, bob, TalosTypes.ASSET_ID);
    }

    function test_Withdraw_RevertsOnReplay() public {
        uint256 root = _seedDepositAndGetRoot();
        _deposit(_fe(), AMOUNT); // extra liquidity so a second payout could settle
        uint256 nullifier = _fe();

        pool.withdraw(_proof(), root, nullifier, AMOUNT, bob, TalosTypes.ASSET_ID);

        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.withdraw(_proof(), root, nullifier, AMOUNT, bob, TalosTypes.ASSET_ID);
    }

    /*//////////////////////////////////////////////////////////////
                             MERKLE STATE
    //////////////////////////////////////////////////////////////*/

    function test_Merkle_InitialRootIsKnown() public view {
        uint256 root = pool.getLastRoot();
        assertTrue(root != 0, "empty root is zero");
        assertTrue(pool.isKnownRoot(root), "initial root not known");
    }

    function test_Merkle_UnknownRootRejected() public view {
        assertFalse(pool.isKnownRoot(123456789), "arbitrary root reported known");
        assertFalse(pool.isKnownRoot(0), "zero root reported known");
    }

    function test_Merkle_RootChangesAndHistoryRetained() public {
        uint256 r0 = pool.getLastRoot();
        _deposit(_fe(), AMOUNT);
        uint256 r1 = pool.getLastRoot();
        _deposit(_fe(), AMOUNT);
        uint256 r2 = pool.getLastRoot();

        assertTrue(r0 != r1 && r1 != r2, "roots not distinct");
        // Historical roots remain valid so in-flight proofs still verify.
        assertTrue(pool.isKnownRoot(r0), "r0 not retained");
        assertTrue(pool.isKnownRoot(r1), "r1 not retained");
        assertTrue(pool.isKnownRoot(r2), "r2 not current");
    }

    /*//////////////////////////////////////////////////////////////
                           ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    function test_SetVerifier_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Talos__NotOwner.selector);
        pool.setVerifier(TalosTypes.Operation.Transfer, ITalosVerifier(address(verifier)));
    }

    function test_SetVerifier_RevertsOnZeroAddress() public {
        vm.expectRevert(Talos__InvalidVerifier.selector);
        pool.setVerifier(TalosTypes.Operation.Transfer, ITalosVerifier(address(0)));
    }

    function test_SetPaused_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Talos__NotOwner.selector);
        pool.setPaused(true);
    }

    function test_TransferOwnership_Works() public {
        pool.transferOwnership(alice);
        assertEq(pool.owner(), alice);

        // Old owner can no longer administer.
        vm.expectRevert(Talos__NotOwner.selector);
        pool.setPaused(true);

        // New owner can.
        vm.prank(alice);
        pool.setPaused(true);
        assertTrue(pool.paused());
    }

    function test_TransferOwnership_RevertsOnZero() public {
        vm.expectRevert(Talos__InvalidParameters.selector);
        pool.transferOwnership(address(0));
    }

    /*//////////////////////////////////////////////////////////////
                              SECURITY
    //////////////////////////////////////////////////////////////*/

    function test_Security_DoubleSpendAcrossOperations() public {
        uint256 root = _seedDepositAndGetRoot();
        uint256 nullifier = _fe();

        // Spend once via transfer...
        pool.transfer(_proof(), root, nullifier, _fe(), _fe());

        // ...then the same note cannot be spent again via a different operation.
        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.split(_proof(), root, nullifier, _fe(), _fe());

        vm.expectRevert(Talos__NullifierAlreadySpent.selector);
        pool.withdraw(_proof(), root, nullifier, AMOUNT, bob, TalosTypes.ASSET_ID);
    }

    function test_Security_ConstructorRejectsZeroArgs() public {
        vm.expectRevert(Talos__InvalidParameters.selector);
        new TalosPool(ITalosAssetRegistry(address(0)), IHasher(address(hasher)), owner);

        vm.expectRevert(Talos__InvalidParameters.selector);
        new TalosPool(ITalosAssetRegistry(address(registry)), IHasher(address(0)), owner);

        vm.expectRevert(Talos__InvalidParameters.selector);
        new TalosPool(ITalosAssetRegistry(address(registry)), IHasher(address(hasher)), address(0));
    }

    /// @dev Fuzz: any canonical, nonzero, unique commitment deposits successfully.
    function testFuzz_Deposit_AcceptsCanonicalCommitment(uint256 commitment, uint128 amount)
        public
    {
        commitment = bound(commitment, 1, TalosTypes.FIELD_SIZE - 1);
        vm.assume(amount > 0);

        token.mint(address(this), amount);
        token.approve(address(pool), amount);
        pool.deposit(TalosTypes.ASSET_ID, amount, commitment);

        assertTrue(pool.commitmentInserted(commitment));
        assertEq(token.balanceOf(address(pool)), amount);
    }
}
