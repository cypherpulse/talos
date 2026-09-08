// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TalosTestBase} from "./TalosTestBase.t.sol";
import {TalosTypes} from "../src/TalosTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {
    Talos__InvalidAsset,
    Talos__InvalidAmount,
    Talos__InvalidParameters,
    Talos__NotOwner
} from "../src/TalosErrors.sol";

/**
 * @title TalosAssetRegistryTest
 * @notice Standalone registry (identity/uniqueness) + native OKB routing through the
 *         linked pool. Covers registration rules, token↔assetId uniqueness, the single
 *         native slot, and ERC-20 vs native deposit/withdrawal.
 */
contract TalosAssetRegistryTest is TalosTestBase {
    uint256 internal constant NATIVE_ID = 2;
    uint256 internal constant SECOND_ERC20_ID = 3;

    function setUp() public override {
        super.setUp();
        vm.deal(address(this), 100 ether);
    }

    /*//////////////////////////////////////////////////////////////
                       REGISTRY IDENTITY & UNIQUENESS
    //////////////////////////////////////////////////////////////*/

    function test_DefaultAsset_Registered() public view {
        (address t, uint8 decimals, bool isNative, bool registered, bytes32 symbol) =
            registry.assets(TalosTypes.ASSET_ID);
        assertEq(t, address(token));
        assertEq(decimals, 6);
        assertFalse(isNative);
        assertTrue(registered);
        assertEq(symbol, bytes32("tUSDC"));
        assertEq(registry.assetIdByToken(address(token)), TalosTypes.ASSET_ID);
    }

    function test_RegisterNativeAsset() public {
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
        (, uint8 decimals, bool isNative, bool registered,) = registry.assets(NATIVE_ID);
        assertEq(decimals, 18);
        assertTrue(isNative);
        assertTrue(registered);
        assertEq(registry.nativeAssetId(), NATIVE_ID);
    }

    function test_RegisterErc20Asset() public {
        MockERC20 usdt = new MockERC20();
        registry.registerAsset(SECOND_ERC20_ID, address(usdt), false, "USDT", 6);
        assertEq(registry.assetIdByToken(address(usdt)), SECOND_ERC20_ID);
    }

    function test_RegisterAsset_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Talos__NotOwner.selector);
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
    }

    function test_RegisterAsset_RevertsIfIdAlreadyRegistered() public {
        address dummy = address(new MockERC20());
        vm.expectRevert(Talos__InvalidAsset.selector);
        registry.registerAsset(TalosTypes.ASSET_ID, dummy, false, "X", 6);
    }

    function test_RegisterAsset_RevertsIfTokenAlreadyRegistered() public {
        // The default token is already registered at ASSET_ID; a second id must reject it.
        vm.expectRevert(Talos__InvalidAsset.selector);
        registry.registerAsset(SECOND_ERC20_ID, address(token), false, "DUP", 6);
    }

    function test_RegisterAsset_RevertsOnSecondNative() public {
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
        vm.expectRevert(Talos__InvalidAsset.selector);
        registry.registerAsset(SECOND_ERC20_ID, address(0), true, "OKB2", 18);
    }

    function test_RegisterAsset_RevertsOnZeroErc20() public {
        vm.expectRevert(Talos__InvalidParameters.selector);
        registry.registerAsset(SECOND_ERC20_ID, address(0), false, "X", 6);
    }

    function test_RegisterAsset_RevertsOnZeroId() public {
        address dummy = address(new MockERC20());
        vm.expectRevert(Talos__InvalidAsset.selector);
        registry.registerAsset(0, dummy, false, "X", 6);
    }

    /*//////////////////////////////////////////////////////////////
                          DEPOSIT / WITHDRAW ROUTING
    //////////////////////////////////////////////////////////////*/

    function test_Deposit_RevertsOnUnregisteredAsset() public {
        vm.expectRevert(Talos__InvalidAsset.selector);
        pool.deposit(_proof(), 99, AMOUNT, _fe());
    }

    function test_Erc20Deposit_RejectsNativeValue() public {
        token.mint(address(this), AMOUNT);
        token.approve(address(pool), AMOUNT);
        vm.expectRevert(Talos__InvalidAmount.selector);
        pool.deposit{value: 1}(_proof(), TalosTypes.ASSET_ID, AMOUNT, _fe());
    }

    function test_NativeDeposit_Works() public {
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
        uint256 commitment = _fe();
        pool.deposit{value: 1 ether}(_proof(), NATIVE_ID, 1 ether, commitment);
        assertTrue(pool.commitmentInserted(commitment));
        assertEq(address(pool).balance, 1 ether);
    }

    function test_NativeDeposit_RevertsOnValueMismatch() public {
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
        vm.expectRevert(Talos__InvalidAmount.selector);
        pool.deposit{value: 0.5 ether}(_proof(), NATIVE_ID, 1 ether, _fe());
    }

    function test_NativeWithdraw_PaysRecipient() public {
        registry.registerAsset(NATIVE_ID, address(0), true, "OKB", 18);
        pool.deposit{value: 1 ether}(_proof(), NATIVE_ID, 1 ether, _fe());

        uint256 root = pool.getLastRoot();
        uint256 nullifier = _fe();
        uint256 before = bob.balance;

        pool.withdraw(_proof(), root, nullifier, 1 ether, bob, NATIVE_ID);

        assertEq(bob.balance - before, 1 ether, "recipient not paid in native");
        assertEq(address(pool).balance, 0);
        assertTrue(pool.isNullifierSpent(nullifier));
    }
}
