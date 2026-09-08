// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TalosVerifier} from "../src/TalosVerifier.sol";
import {Talos__InvalidParameters} from "../src/TalosErrors.sol";

/// @dev Stub with the exact generated PLONK-verifier signature for N=3, returning a
///      fixed result. TEST-ONLY: it lets us exercise the adapter's calldata reshaping
///      and selector construction without a full proof.
contract StubVerifier3 {
    bool public immutable result;

    constructor(bool result_) {
        result = result_;
    }

    function verifyProof(uint256[24] calldata, uint256[3] calldata) external view returns (bool) {
        return result;
    }
}

/**
 * @title TalosVerifierTest
 * @notice Unit tests for the {TalosVerifier} adapter: it forwards to the wrapped
 *         generated PLONK verifier with the correct selector, rejects length
 *         mismatches, and never fabricates a `true`.
 */
contract TalosVerifierTest is Test {
    function _proof() private pure returns (uint256[24] memory p) {
        for (uint256 i = 0; i < 24; ++i) {
            p[i] = i + 1;
        }
    }

    function _sig3() private pure returns (uint256[] memory s) {
        s = new uint256[](3);
        (s[0], s[1], s[2]) = (7, 8, 9);
    }

    function test_Constructor_RejectsZeroVerifier() public {
        vm.expectRevert(Talos__InvalidParameters.selector);
        new TalosVerifier(address(0), 3);
    }

    function test_Constructor_RejectsZeroSignals() public {
        address stub = address(new StubVerifier3(true));
        vm.expectRevert(Talos__InvalidParameters.selector);
        new TalosVerifier(stub, 0);
    }

    function test_ForwardsTrue() public {
        TalosVerifier v = new TalosVerifier(address(new StubVerifier3(true)), 3);
        assertTrue(v.verifyProof(_proof(), _sig3()), "should forward true");
    }

    function test_ForwardsFalse() public {
        TalosVerifier v = new TalosVerifier(address(new StubVerifier3(false)), 3);
        assertFalse(v.verifyProof(_proof(), _sig3()), "should forward false");
    }

    function test_RejectsWrongSignalCount() public {
        TalosVerifier v = new TalosVerifier(address(new StubVerifier3(true)), 3);
        uint256[] memory two = new uint256[](2);
        assertFalse(v.verifyProof(_proof(), two), "length mismatch must be false");
    }

    function test_ReturnsFalseWhenTargetIsNotAVerifier() public {
        // Target has no matching function -> staticcall fails -> false (never reverts).
        TalosVerifier v = new TalosVerifier(address(this), 3);
        assertFalse(v.verifyProof(_proof(), _sig3()), "bad target must be false");
    }
}
