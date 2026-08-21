// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {TalosPool} from "../src/TalosPool.sol";
import {TalosAssetRegistry} from "../src/TalosAssetRegistry.sol";
import {TalosVerifier} from "../src/TalosVerifier.sol";
import {ITalosVerifier} from "../src/interfaces/ITalosVerifier.sol";
import {ITalosAssetRegistry} from "../src/interfaces/ITalosAssetRegistry.sol";
import {IHasher} from "../src/interfaces/IHasher.sol";
import {TalosTypes} from "../src/TalosTypes.sol";
import {TransferVerifier} from "../src/verifiers/TransferVerifier.sol";
import {SplitVerifier} from "../src/verifiers/SplitVerifier.sol";
import {MergeVerifier} from "../src/verifiers/MergeVerifier.sol";
import {WithdrawVerifier} from "../src/verifiers/WithdrawVerifier.sol";

/// @title Deploy
/// @author Talos
/// @notice Deploys the standalone {TalosAssetRegistry}, registers the X Layer testnet
///         assets (USDC=1, USDT=2, USDG=3, native OKB=4), deploys {TalosPool} linked to
///         the registry, and installs the generated Groth16 verifiers behind the
///         {TalosVerifier} adapter for each private operation.
/// @dev The Poseidon(2) hasher is deployed separately from the circomlibjs bytecode
///      (see packages/zk) and supplied via POSEIDON_HASHER_ADDRESS. Token addresses are
///      optional env vars; unset stablecoins are skipped.
///
///      Required env:  DEPLOYER_PRIVATE_KEY, POSEIDON_HASHER_ADDRESS
///      Optional env:  TEST_USDC_ADDRESS, TEST_USDT_ADDRESS, TEST_USDG_ADDRESS
contract Deploy is Script {
    function run() external returns (TalosPool pool, TalosAssetRegistry registry) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address hasher = vm.envAddress("POSEIDON_HASHER_ADDRESS");
        address owner = vm.addr(deployerKey);

        address usdc = vm.envOr("TEST_USDC_ADDRESS", address(0));
        address usdt = vm.envOr("TEST_USDT_ADDRESS", address(0));
        address usdg = vm.envOr("TEST_USDG_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        // Registry with a unique identity per asset (USDC=ASSET_ID=1).
        registry = new TalosAssetRegistry(owner);
        if (usdc != address(0)) registry.registerAsset(1, usdc, false, "USDC", 6);
        if (usdt != address(0)) registry.registerAsset(2, usdt, false, "USDT", 6);
        if (usdg != address(0)) registry.registerAsset(3, usdg, false, "USDG", 6);
        // Native OKB (X Layer gas token) — no ERC-20 backing.
        registry.registerAsset(4, address(0), true, "OKB", 18);

        pool = new TalosPool(ITalosAssetRegistry(address(registry)), IHasher(hasher), owner);

        // Install each generated verifier behind the adapter with its frozen signal count.
        pool.setVerifier(
            TalosTypes.Operation.Transfer,
            ITalosVerifier(address(new TalosVerifier(address(new TransferVerifier()), 4)))
        );
        pool.setVerifier(
            TalosTypes.Operation.Split,
            ITalosVerifier(address(new TalosVerifier(address(new SplitVerifier()), 4)))
        );
        pool.setVerifier(
            TalosTypes.Operation.Merge,
            ITalosVerifier(address(new TalosVerifier(address(new MergeVerifier()), 4)))
        );
        pool.setVerifier(
            TalosTypes.Operation.Withdraw,
            ITalosVerifier(address(new TalosVerifier(address(new WithdrawVerifier()), 5)))
        );

        vm.stopBroadcast();

        console2.log("TalosAssetRegistry:", address(registry));
        console2.log("TalosPool:", address(pool));
        console2.log("hasher:", hasher);
    }
}
