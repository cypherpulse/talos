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
$commitMessage = "feat(audit): add production gap analysis document detailing critical blockers and remediation steps

feat(tests): implement non-custodial deposit proving test to ensure client-side key management

feat(tests): implement non-custodial withdraw proving test to validate client-side key management

test(poseidon): add parity check for poseidon-lite and circomlibjs to ensure consistent field element outputs

build(setup): create PLONK trusted setup script for universal SRS using Perpetual Powers of Tau"

# Commit each file individually
foreach ($file in $allFiles) {
    if ($file -ne "") {
        git add $file
        git commit --only $file -m "$commitMessage - $file"
    }
}

# Push all commits
git push --set-upstream origin  main