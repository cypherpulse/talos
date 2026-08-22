# DEX SDK 

The OKX DEX SDK is a typescript toolkit for developers to integrate OKX DEX API functionalities into their applications.

GitHub Repository https://github.com/okx/okx-dex-sdk

To get started, follow the guide here: https://github.com/okx/okx-dex-sdk?tab=readme-ov-file#usage


## Install the SDK


```bash
npm install @okx-dex/okx-dex-sdk
# or
yarn add @okx-dex/okx-dex-sdk
# or
pnpm add @okx-dex/okx-dex-sdk
```

## Setup Your Environment
Create a .env file with your API credentials and wallet information.

```bash
# OKX API Credentials
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_API_PASSPHRASE=your_passphrase
OKX_PROJECT_ID=your_project_id

# Solana Configuration
SOLANA_RPC_URL=your_solana_rpc_url
SOLANA_WALLET_ADDRESS=your_solana_wallet_address
SOLANA_PRIVATE_KEY=your_solana_private_key

# EVM Configuration
EVM_RPC_URL=your_evm_rpc_url
EVM_PRIVATE_KEY=your_evm_private_key
```


## Initialize the Client
Create a file for your DEX client (e.g., DexClient.ts):

```typescript
// example.ts or test.ts
import { OKXDexClient } from '@okx-dex/okx-dex-sdk';
import { Connection } from '@solana/web3.js';
import { createWallet } from '@okx-dex/okx-dex-sdk/core/wallet';
import 'dotenv/config';
import { createEVMWallet } from '@okx-dex/okx-dex-sdk/core/evm-wallet';
import { ethers } from 'ethers';

// Validate environment variables
const requiredEnvVars = [
    'OKX_API_KEY',
    'OKX_SECRET_KEY', 
    'OKX_API_PASSPHRASE',
    'OKX_PROJECT_ID',
    'SOLANA_RPC_URL',
    'SOLANA_PRIVATE_KEY',
    'EVM_RPC_URL',
    'EVM_PRIVATE_KEY'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

// Create Solana connection and wallet
const connection = new Connection(process.env.SOLANA_RPC_URL!);
const wallet = createWallet(process.env.SOLANA_PRIVATE_KEY!, connection);

// Create EVM provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_URL!);
const evmWallet = createEVMWallet(process.env.EVM_PRIVATE_KEY!, provider);

// Initialize the client with both Solana and EVM support
export const client = new OKXDexClient({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    apiPassphrase: process.env.OKX_API_PASSPHRASE!,
    projectId: process.env.OKX_PROJECT_ID!,
    solana: {
        wallet: wallet
    },
    evm: {
        wallet: evmWallet
    }
});
```

## Using the Client
Once initialized, you can use the client to make DEX API calls:

```typescript
async function main() {
    try {
        // Get tokens for Solana (chainIndex: 501)
        const tokens = await client.dex.getTokens("501");
        console.log('Supported tokens:', JSON.stringify(tokens, null, 2));
        
        // Get tokens for Ethereum (chainIndex: 1)
        const ethTokens = await client.dex.getTokens("1");
        console.log('Ethereum tokens:', JSON.stringify(ethTokens, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
    }
}
main();
```

