// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {TalosPool} from "../src/TalosPool.sol";
import {TalosVerifier} from "../src/TalosVerifier.sol";
import {ITalosVerifier} from "../src/interfaces/ITalosVerifier.sol";
import {IHasher} from "../src/interfaces/IHasher.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {TalosTypes} from "../src/TalosTypes.sol";
import {TransferVerifier} from "../src/verifiers/TransferVerifier.sol";
import {SplitVerifier} from "../src/verifiers/SplitVerifier.sol";
import {MergeVerifier} from "../src/verifiers/MergeVerifier.sol";
import {WithdrawVerifier} from "../src/verifiers/WithdrawVerifier.sol";

/// @title Deploy
/// @author Talos
/// @notice Phase 3 deployment: wires TalosPool to the real Groth16 verifiers.
/// @dev Deploys the pool against an existing ERC-20 test asset and an existing
///      Poseidon(2) hasher, then installs the generated Groth16 verifier for every
///      private operation behind the {TalosVerifier} adapter (which reshapes the
///      pool's dynamic public signals into each circuit's fixed-size input array).
///
///      The Poseidon(2) hasher is deployed separately from the circomlibjs bytecode
///      (see packages/zk) and its address supplied via POSEIDON_HASHER_ADDRESS — it
///      cannot be expressed as Solidity source.
///
///      Required environment:
///        DEPLOYER_PRIVATE_KEY     - deployer key (testnet only)
///        TEST_USDC_ADDRESS        - the single supported ERC-20 test asset
///        POSEIDON_HASHER_ADDRESS  - the deployed circomlib Poseidon(2) contract
contract Deploy is Script {
    function run() external returns (TalosPool pool) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address asset = vm.envAddress("TEST_USDC_ADDRESS");
        address hasher = vm.envAddress("POSEIDON_HASHER_ADDRESS");
        address owner = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        pool = new TalosPool(IERC20(asset), IHasher(hasher), owner);

        // Deploy the generated verifiers and install each behind the adapter with
        // its frozen public-signal count.
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

        console2.log("TalosPool:", address(pool));
        console2.log("asset:", asset);
        console2.log("hasher:", hasher);
    }
}
