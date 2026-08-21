// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IERC20
/// @notice Minimal ERC-20 interface used by TalosPool for the single test asset.
/// @dev Only the members the pool needs are declared. Non-standard tokens (missing
///      or non-bool returns) are handled by the pool's safe-transfer wrappers.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
