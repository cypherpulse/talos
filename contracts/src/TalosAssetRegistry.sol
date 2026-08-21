// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TalosTypes} from "./TalosTypes.sol";
import {Talos__InvalidAsset, Talos__InvalidParameters, Talos__NotOwner} from "./TalosErrors.sol";

/**
 * @title TalosAssetRegistry
 * @author Talos
 * @notice Standalone registry mapping each protocol `assetId` to its backing token.
 *         `TalosPool` links to one registry and resolves asset backing from it.
 *
 * @dev IDENTITY & UNIQUENESS (the point of this contract): every asset has a single,
 *      canonical identity, so one token can never be confused for another.
 *        - `assetId` (a BN254 field element) is bound into every note commitment and
 *          enforced in-circuit, so a note is permanently tied to one asset.
 *        - Each `assetId` may be registered at most once (never re-pointed).
 *        - Each ERC-20 token maps to exactly one `assetId` (`assetIdByToken`), so the
 *          same token cannot be registered twice under different ids.
 *        - At most one native asset (OKB) may exist (`nativeAssetId`).
 *      `symbol`/`decimals` are stored for off-chain identification and correct scaling
 *      (e.g. 1 USDC at 6 decimals vs 1 OKB at 18) — they are not consensus-critical.
 */
contract TalosAssetRegistry {
    struct AssetConfig {
        address token; // backing ERC-20 (zero for native)
        uint8 decimals; // display/scale decimals
        bool isNative; // chain native token (OKB)
        bool registered; // registration flag
        bytes32 symbol; // short symbol, e.g. "USDC"
    }

    /// @notice assetId => configuration (public getter matches {ITalosAssetRegistry}).
    mapping(uint256 assetId => AssetConfig config) public assets;

    /// @notice token address => assetId (0 means not registered) — enforces token uniqueness.
    mapping(address token => uint256 assetId) public assetIdByToken;

    /// @notice The single native (OKB) assetId, or 0 if none registered.
    uint256 public nativeAssetId;

    /// @notice Registry administrator (may register assets).
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AssetRegistered(
        uint256 indexed assetId,
        address indexed token,
        bool isNative,
        bytes32 symbol,
        uint8 decimals
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Talos__NotOwner();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert Talos__InvalidParameters();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /**
     * @notice Register a new asset. Owner-only; each id/token registers at most once.
     * @param assetId Nonzero field-element id bound into note commitments.
     * @param token Backing ERC-20 (ignored when `isNative`).
     * @param isNative True for the chain's native token (OKB).
     * @param symbol Short symbol for identification (e.g. "USDC").
     * @param decimals Token decimals for off-chain scaling.
     */
    function registerAsset(
        uint256 assetId,
        address token,
        bool isNative,
        bytes32 symbol,
        uint8 decimals
    ) external onlyOwner {
        if (assetId == 0 || assetId >= TalosTypes.FIELD_SIZE) {
            revert Talos__InvalidAsset();
        }
        if (assets[assetId].registered) revert Talos__InvalidAsset();

        if (isNative) {
            if (nativeAssetId != 0) revert Talos__InvalidAsset(); // at most one native
            nativeAssetId = assetId;
            token = address(0);
        } else {
            if (token == address(0)) revert Talos__InvalidParameters();
            if (assetIdByToken[token] != 0) revert Talos__InvalidAsset(); // token uniqueness
            assetIdByToken[token] = assetId;
        }

        assets[assetId] = AssetConfig({
            token: token, decimals: decimals, isNative: isNative, registered: true, symbol: symbol
        });
        emit AssetRegistered(assetId, token, isNative, symbol, decimals);
    }

    /// @notice Whether `assetId` is registered.
    function isRegistered(uint256 assetId) external view returns (bool) {
        return assets[assetId].registered;
    }

    /// @notice Transfer registry ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert Talos__InvalidParameters();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }
}
