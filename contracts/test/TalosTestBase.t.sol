// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TalosPool} from "../src/TalosPool.sol";
import {ITalosVerifier} from "../src/interfaces/ITalosVerifier.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IHasher} from "../src/interfaces/IHasher.sol";
import {TalosTypes} from "../src/TalosTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {TestPoseidonHasher} from "./mocks/TestPoseidonHasher.sol";

/**
 * @title TalosTestBase
 * @notice Shared fixture and helpers for the Talos Foundry test suite.
 * @dev Deploys the test-only ERC-20, hasher, and a permissive {MockVerifier} wired
 *      for every operation, so tests can drive the pool's real state machine. The
 *      mock verifier provides NO security — it is a controllable stand-in for the
 *      Phase 3 Groth16 verifier, letting tests exercise both accept and reject paths.
 */
abstract contract TalosTestBase is Test {
    /*//////////////////////////////////////////////////////////////
                                FIXTURE
    //////////////////////////////////////////////////////////////*/

    MockERC20 internal token;
    TestPoseidonHasher internal hasher;
    MockVerifier internal verifier;
    TalosPool internal pool;

    address internal owner = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 1_000e6; // 1,000 tUSDC (6 decimals)

    /// @dev Monotonic seed so generated commitments/nullifiers are unique per test.
    uint256 private _seed;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public virtual {
        token = new MockERC20();
        hasher = new TestPoseidonHasher();
        verifier = new MockVerifier(true); // default: accept proofs
        pool = new TalosPool(IERC20(address(token)), IHasher(address(hasher)), owner);

        pool.setVerifier(TalosTypes.Operation.Transfer, ITalosVerifier(address(verifier)));
        pool.setVerifier(TalosTypes.Operation.Split, ITalosVerifier(address(verifier)));
        pool.setVerifier(TalosTypes.Operation.Merge, ITalosVerifier(address(verifier)));
        pool.setVerifier(TalosTypes.Operation.Withdraw, ITalosVerifier(address(verifier)));
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev A fresh, canonical, nonzero field element (unique across calls).
    function _fe() internal returns (uint256) {
        _seed++;
        return (uint256(keccak256(abi.encode("talos.fe", _seed))) % (TalosTypes.FIELD_SIZE - 1)) + 1;
    }

    /// @dev A syntactically-shaped dummy Groth16 proof (contents ignored by the mock).
    function _proof() internal pure returns (TalosTypes.Proof memory p) {
        p.a = [uint256(1), uint256(2)];
        p.b = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        p.c = [uint256(7), uint256(8)];
    }

    /// @dev Mint + approve + deposit `amount` under `commitment`, paid by this test.
    function _deposit(uint256 commitment, uint256 amount) internal {
        token.mint(address(this), amount);
        token.approve(address(pool), amount);
        pool.deposit(TalosTypes.ASSET_ID, amount, commitment);
    }

    /// @dev Deposit a fresh note of `AMOUNT` and return the resulting known root.
    function _seedDepositAndGetRoot() internal returns (uint256 root) {
        _deposit(_fe(), AMOUNT);
        return pool.getLastRoot();
    }
}
