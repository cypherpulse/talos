# PowerShell script to add and commit Hermes Bridge project files
# This script commits the complete Hermes Bridge implementation for cross-chain USDC transfers

# Get the list of untracked files
$untrackedFiles = (git ls-files --others --exclude-standard) -split '\r\n|\n|\r' | Where-Object { $_ -ne "" }

# Get the list of modified files (staged and unstaged)
$modifiedUnstaged = (git diff --name-only) -split '\r\n|\n|\r' | Where-Object { $_ -ne "" }
$modifiedStaged = (git diff --cached --name-only) -split '\r\n|\n|\r' | Where-Object { $_ -ne "" }
$modifiedFiles = ($modifiedUnstaged + $modifiedStaged) | Select-Object -Unique

# Combine all files to commit
$allFiles = ($untrackedFiles + $modifiedFiles) | Select-Object -Unique

# Comprehensive commit message for Hermes Bridge project
$commitMessage = "feat: add key generation and profile management for Talos identity

- Implemented API endpoint for generating Talos keys (spendingKey and ownerPublicKey).
- Added functionality to manage Talos identity in the profile page, including key generation and regeneration.
- Introduced UI components for displaying and copying public and spending keys.
- Enhanced agent messaging to include owner address for scoped actions.
- Updated deposit handling to require user action for non-custodial transactions.
- Added notes page to display private notes and their shielded balances.
- Introduced utility functions for encoding and managing Talos identity keys."

# Commit each file individually
foreach ($file in $allFiles) {
    if ($file -ne "") {
        git add $file
        git commit --only $file -m "$commitMessage - $file"
    }
}

# Push all commits
git push --set-upstream origin  main