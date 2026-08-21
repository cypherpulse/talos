// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IHasher} from "../interfaces/IHasher.sol";
import {TalosTypes} from "../TalosTypes.sol";
import {Talos__InvalidFieldElement, Talos__MerkleTreeFull} from "../TalosErrors.sol";

/**
 * @title MerkleTreeLib
 * @author Talos
 * @notice Fixed-depth, append-only incremental Merkle tree with a bounded root
 *         history, parameterized by an injected 2-arity hasher ({IHasher}).
 * @dev The tree ALGORITHM is frozen here; the hash PRIMITIVE is injected so Phase 3
 *      can supply the circomlib Poseidon(2) contract without touching this code.
 *      It follows the well-audited Tornado/Semaphore incremental-tree pattern: only
 *      the right-hand frontier (`filledSubtrees`) and a small ring buffer of recent
 *      roots are stored, making each insert O(depth) hashes and O(depth) SSTOREs —
 *      no unbounded loops or arrays.
 *
 * @custom:security Only append and read are supported; there is no path to mutate or
 *      remove a leaf. Callers MUST validate leaves are canonical field elements
 *      (also enforced defensively in `insert`).
 */
library MerkleTreeLib {
    /*//////////////////////////////////////////////////////////////
                             TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Storage layout of a single incremental Merkle tree instance.
    struct Tree {
        uint256 depth; // number of levels (leaves live at level 0)
        uint256 rootHistorySize; // size of the roots ring buffer
        uint256 nextLeafIndex; // index the next inserted leaf will occupy
        uint256 currentRootIndex; // ring-buffer index of the current root
        mapping(uint256 => uint256) zeros; // zeros[i] = root of an empty height-i subtree
        mapping(uint256 => uint256) filledSubtrees; // rightmost filled node per level
        mapping(uint256 => uint256) roots; // ring buffer of recent roots
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL - MUTATING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Initialize an empty tree and seed its root history with the empty root.
     * @param self The tree storage struct.
     * @param hasher The 2-arity hasher used for internal nodes.
     * @param depth Tree depth (levels above the leaves).
     * @param rootHistorySize Number of historical roots to retain.
     * @param zeroValue The value of an empty leaf.
     */
    function init(
        Tree storage self,
        IHasher hasher,
        uint256 depth,
        uint256 rootHistorySize,
        uint256 zeroValue
    ) internal {
        self.depth = depth;
        self.rootHistorySize = rootHistorySize;

        // Precompute the "all-empty" subtree root at each level once, so later
        // inserts never need to hash empty siblings on the fly.
        uint256 current = zeroValue;
        self.zeros[0] = current;
        self.filledSubtrees[0] = current;
        for (uint256 i = 1; i < depth; ++i) {
            current = hasher.poseidon([current, current]);
            self.zeros[i] = current;
            self.filledSubtrees[i] = current;
        }

        // Root of the fully-empty tree = hash of the two top empty subtrees.
        self.roots[0] = hasher.poseidon([current, current]);
        self.currentRootIndex = 0;
        self.nextLeafIndex = 0;
    }

    /**
     * @notice Append a leaf and advance the root. Follows checks-effects ordering.
     * @param self The tree storage struct.
     * @param hasher The 2-arity hasher used for internal nodes.
     * @param leaf The leaf (a commitment); must be a canonical field element.
     * @return index The zero-based index the leaf was inserted at.
     * @return newRoot The resulting Merkle root.
     */
    function insert(Tree storage self, IHasher hasher, uint256 leaf)
        internal
        returns (uint256 index, uint256 newRoot)
    {
        // --- Checks ---
        if (leaf >= TalosTypes.FIELD_SIZE) revert Talos__InvalidFieldElement();

        uint256 depth = self.depth;
        uint256 nextIndex = self.nextLeafIndex;
        if (nextIndex >= (uint256(1) << depth)) revert Talos__MerkleTreeFull();

        // --- Effects: fold the new leaf up to the root along its authentication path ---
        uint256 currentIndex = nextIndex;
        uint256 currentHash = leaf;
        uint256 left;
        uint256 right;

        for (uint256 i = 0; i < depth; ++i) {
            if (currentIndex % 2 == 0) {
                // Even index: this node is on the frontier; its right sibling is empty.
                left = currentHash;
                right = self.zeros[i];
                self.filledSubtrees[i] = currentHash;
            } else {
                // Odd index: the left sibling was filled by an earlier insert.
                left = self.filledSubtrees[i];
                right = currentHash;
            }
            currentHash = hasher.poseidon([left, right]);
            currentIndex /= 2;
        }

        uint256 newRootIndex = (self.currentRootIndex + 1) % self.rootHistorySize;
        self.currentRootIndex = newRootIndex;
        self.roots[newRootIndex] = currentHash;
        self.nextLeafIndex = nextIndex + 1;

        return (nextIndex, currentHash);
    }

    /*//////////////////////////////////////////////////////////////
                             INTERNAL - VIEW
    //////////////////////////////////////////////////////////////*/

    /// @notice The most recently computed root.
    function getLastRoot(Tree storage self) internal view returns (uint256) {
        return self.roots[self.currentRootIndex];
    }

    /**
     * @notice Whether `root` is one of the retained recent roots.
     * @dev A zero root is never considered known. Walks the ring buffer backwards
     *      from the current root, so the freshest roots are matched first.
     */
    function isKnownRoot(Tree storage self, uint256 root) internal view returns (bool) {
        if (root == 0) return false;

        uint256 size = self.rootHistorySize;
        uint256 start = self.currentRootIndex;
        uint256 cursor = start;
        do {
            if (self.roots[cursor] == root) return true;
            if (cursor == 0) {
                cursor = size;
            }
            --cursor;
        } while (cursor != start);

        return false;
    }
}
