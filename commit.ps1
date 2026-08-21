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
$commitMessage = "feat: add end-to-end harness for Talos contracts deployment and testing

feat: implement PostgreSQL integration tests for repositories

test: add unit tests for NoteEncryptionService

test: add unit tests for TalosGuard policy enforcement

test: add unit tests for idempotency in operation creation

test: add unit tests for Merkle tree functionality

test: add unit tests for state machine transitions

chore: add TypeScript configuration for core service

chore: initialize indexer service with basic structure

chore: initialize relayer service with basic structure

chore: add root TypeScript configuration

chore: add Turbo configuration for build and test tasks"

# Commit each file individually
foreach ($file in $allFiles) {
    if ($file -ne "") {
        git add $file
        git commit --only $file -m "$commitMessage - $file"
    }
}

# Push all commits
git push --set-upstream origin  main