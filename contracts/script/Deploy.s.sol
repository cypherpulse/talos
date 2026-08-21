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
        address hasher = vm.envOr("POSEIDON_HASHER_ADDRESS", address(0));
        address owner = vm.addr(deployerKey);

        address usdc = vm.envOr("TEST_USDC_ADDRESS", address(0));
        address usdt = vm.envOr("TEST_USDT_ADDRESS", address(0));
        address usdg = vm.envOr("TEST_USDG_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        // Deploy the circomlib Poseidon(2) from bytecode if no address was provided.
        if (hasher == address(0)) {
            bytes memory code =
                vm.parseJsonBytes(vm.readFile("test/fixtures/poseidon2.json"), ".bytecode");
            address deployed;
            assembly {
                deployed := create(0, add(code, 0x20), mload(code))
            }
            require(deployed != address(0), "poseidon deploy failed");
            hasher = deployed;
        }

        // Registry with a unique identity per asset (USDC=ASSET_ID=1).
        registry = new TalosAssetRegistry(owner);
        if (usdc != address(0)) registry.registerAsset(1, usdc, false, "USDC", 6);
        if (usdt != address(0)) registry.registerAsset(2, usdt, false, "USDT", 6);
        if (usdg != address(0)) registry.registerAsset(3, usdg, false, "USDG", 6);
        // Native OKB (X Layer gas token) — no ERC-20 backing.
        registry.registerAsset(4, address(0), true, "OKB", 18);

        pool = new TalosPool(ITalosAssetRegistry(address(registry)), IHasher(hasher), owner);

        // Deploy each generated Groth16 verifier + its adapter, wire it into the pool, and log both.
        _install(pool, TalosTypes.Operation.Transfer, address(new TransferVerifier()), 4, "Transfer");
        _install(pool, TalosTypes.Operation.Split, address(new SplitVerifier()), 4, "Split");
        _install(pool, TalosTypes.Operation.Merge, address(new MergeVerifier()), 4, "Merge");
        _install(pool, TalosTypes.Operation.Withdraw, address(new WithdrawVerifier()), 5, "Withdraw");

        vm.stopBroadcast();

        console2.log("TalosAssetRegistry:", address(registry));
        console2.log("TalosPool:", address(pool));
        console2.log("Poseidon (hasher):", hasher);
    }

    /// @dev Deploys the adapter for `verifier`, wires it into `pool` for `op`, and logs both addresses.
    function _install(
        TalosPool pool,
        TalosTypes.Operation op,
        address verifier,
        uint256 signals,
        string memory name
    ) internal {
        address adapter = address(new TalosVerifier(verifier, signals));
        pool.setVerifier(op, ITalosVerifier(adapter));
        console2.log(string.concat(name, "Verifier:"), verifier);
        console2.log(string.concat(name, " adapter:"), adapter);
    }
}
