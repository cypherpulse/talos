#!/usr/bin/env bash
#
# Deploy Talos to X Layer testnet.
#   - Loads variables from ./.env (exported automatically)
#   - Deploys Poseidon(2) + TalosAssetRegistry + TalosPool + verifiers via forge script
#
# Usage:
#   bash testnetdeploy.sh          # broadcast (real deployment)
#   bash testnetdeploy.sh --dry    # simulate only (no transactions sent)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/.env"

# --- Load .env safely (do NOT `source` it: values may contain spaces / CRLF) ---
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env not found at $ENV_FILE (copy .env.example to .env and fill it in)" >&2
  exit 1
fi
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"                       # strip trailing CR (Windows line endings)
  [[ "$line" =~ ^[[:space:]]*# ]] && continue # skip comments
  [[ "$line" != *=* ]] && continue            # skip non KEY=VALUE lines
  key="${line%%=*}"
  val="${line#*=}"
  key="${key#"${key%%[![:space:]]*}"}"        # ltrim key
  key="${key%"${key##*[![:space:]]}"}"        # rtrim key
  [[ -z "$key" || "$key" =~ [^A-Za-z0-9_] ]] && continue
  val="${val#\"}"; val="${val%\"}"            # strip surrounding double quotes
  val="${val#\'}"; val="${val%\'}"            # strip surrounding single quotes
  export "$key=$val"
done < "$ENV_FILE"

# --- Make sure Foundry is available ---
export PATH="$HOME/.foundry/bin:$PATH"
if ! command -v forge >/dev/null 2>&1; then
  echo "Error: 'forge' not found. Install Foundry: https://book.getfoundry.sh" >&2
  exit 1
fi

# --- Required inputs ---
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env (a funded X Layer testnet key)}"
RPC_URL="${XLAYER_TESTNET_RPC_URL:-https://testrpc.xlayer.tech}"

# Poseidon is auto-deployed from the bytecode fixture when POSEIDON_HASHER_ADDRESS is empty.
if [[ -z "${POSEIDON_HASHER_ADDRESS:-}" && ! -f "$ROOT/contracts/test/fixtures/poseidon2.json" ]]; then
  echo "Error: POSEIDON_HASHER_ADDRESS is unset and the Poseidon bytecode fixture is missing." >&2
  echo "       Run 'pnpm zk:setup' first, or set POSEIDON_HASHER_ADDRESS in .env." >&2
  exit 1
fi

DEPLOYER_ADDR="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null || echo 'unknown')"

echo "──────────────────────────────────────────────"
echo " Talos → X Layer testnet deploy"
echo "   RPC:       $RPC_URL"
echo "   Deployer:  $DEPLOYER_ADDR"
echo "   USDC(1):   ${TEST_USDC_ADDRESS:-<unset>}"
echo "   USDT(2):   ${TEST_USDT_ADDRESS:-<unset>}"
echo "   USDG(3):   ${TEST_USDG_ADDRESS:-<unset>}"
echo "   OKB(4):    native"
echo "──────────────────────────────────────────────"

# Warn if the deployer looks unfunded.
if command -v cast >/dev/null 2>&1 && [[ "$DEPLOYER_ADDR" != "unknown" ]]; then
  BAL="$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC_URL" 2>/dev/null || echo 0)"
  echo "   Balance:   $BAL wei"
  if [[ "$BAL" == "0" ]]; then
    echo "   ⚠  Deployer has 0 balance — fund it from the X Layer testnet faucet first." >&2
  fi
fi

BROADCAST="--broadcast"
if [[ "${1:-}" == "--dry" || "${1:-}" == "-d" ]]; then
  BROADCAST=""
  echo "   (dry run — simulation only, no transactions)"
fi

cd "$ROOT/contracts"
# shellcheck disable=SC2086
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" $BROADCAST -vvv

echo "──────────────────────────────────────────────"
echo "Done. Copy the printed addresses into .env:"
echo "  TALOS_POOL_ADDRESS, TALOS_ASSET_REGISTRY_ADDRESS, POSEIDON_HASHER_ADDRESS (hasher)"
echo "──────────────────────────────────────────────"
