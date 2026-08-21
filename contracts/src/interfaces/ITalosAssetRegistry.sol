// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title ITalosAssetRegistry
/// @notice Read interface the pool uses to resolve an `assetId` to its backing token.
/// @dev The tuple order matches {TalosAssetRegistry.AssetConfig} exactly, so the
///      auto-generated `assets` getter satisfies this interface.
interface ITalosAssetRegistry {
    /// @param assetId The field-element id bound into note commitments.
    /// @return token The backing ERC-20 (zero for native).
    /// @return decimals The token's decimals (for off-chain display/scaling).
    /// @return isNative True for the chain's native token (OKB on X Layer).
    /// @return registered Whether `assetId` is registered.
    /// @return symbol Short symbol (bytes32) identifying the asset.
    function assets(uint256 assetId)
        external
        view
        returns (address token, uint8 decimals, bool isNative, bool registered, bytes32 symbol);
}
