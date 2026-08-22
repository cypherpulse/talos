{/* api-page */}

<ApiLayout
  defaultRequestLanguage='shell'
  defaultResponseStatusCode='200'
  supportedRequestLanguageList={['shell']}
  supportedResponseStatusCodeList={['200']}
>

<ParamsWrapper>

# Get Supported Chains

Retrieve information on chains supported by the DEX Balance endpoint

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/balance/supported/chain`

## Request Parameters

None

</RequestParamsWrapper >

<ResponseParamsWrapper>

## Response Parameters

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| name      | String | Chain name        |
| logoUrl   | String | Chain logo URL    |
| shortName | String | Chain short name  |
| chainIndex| String | Chain unique identifier |

</ResponseParamsWrapper>



</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/balance/supported/chain' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper>
<ResponseCodeExample codeStatus='200'>

```json

{
    "code": "0",
    "data": [
        {
            "name": "Ethereum",
            "logoUrl": "http://www.eth.org/eth.png",
            "shortName": "ETH",
            "chainIndex": "1"
        }
    ],
    "msg": ""
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>


{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get Total Value

Retrieve the total balance of all tokens and DeFi assets under an account. 

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/balance/total-value-by-address`

## Request Parameters

| Parameter         | Type    | Required | Description                                                        |
| ------------------| ------- | -------- | ------------------------------------------------------------------ |
| address           | String  | Yes      | Get the total valuation for the address                                  |
| chains            | String  | Yes      | Filter chains for which to query total assets, separated by ",". Supports up to 50 chains..<br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain). |
| assetType         | String  | No       | Query balance type. Default is to query all asset balances. <br/>`0`: Query total balance for all assets, including tokens and DeFi assets.<br/> `1`: Query only token balance.<br/> `2`: Query only DeFi balance. |
| excludeRiskToken  | Boolean | No       | Option to filter out risky airdrop & honeypot tokens. Default is to filter. <br/>`true`: filter out, `false`: do not filter out <br/> It supports only `ETH`、`BSC`、`SOL`、`BASE` for honeypot tokens, more chains will be supported soon.   |

</RequestParamsWrapper>

<ResponseParamsWrapper >

## Response Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| totalValue | String | Total asset balance based on the query type, returned in USD |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/balance/total-value-by-address?address=0x0b32aa5c1e71715206fe29b7badb21ad95f272c0&chains=1&assetType=0' \

--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```
</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "totalValue": "1172.895057177065864522056725546579939398"
        }
    ]
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>

{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>


# Get Total Token Balances

Retrieve the list of token balances for an address across multiple chains or specified chains.


<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/balance/all-token-balances-by-address`

## Request Parameters

| Parameter      | Type   | Required | Description                             |
|----------------|--------|----------|-----------------------------------------|
| address                   | String | Yes      | Address |
| chains                    | Array  | Yes      | When filtering the chains for querying asset details, multiple chains should be separated by commas (`,`). A maximum of 50 chains is supported. <br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain).|
| excludeRiskToken          | String | No       | Option to filter out risky airdrop & honeypot tokens. Default is to filter.<br/>`0`: Filter out <br/> `1`: Do not filter out <br/> It supports only `ETH`、`BSC`、`SOL`、`BASE` for honeypot tokens, more chains will be supported soon.    |

</RequestParamsWrapper>
<ResponseParamsWrapper >

## Response Parameters

| Parameter     | Type   | Description                              |
|---------------|--------|------------------------------------------|
| tokenAssets   | Array  | List of token balances                   |
| >chainIndex   | String | Unique identifier for the chain          |
| >tokenContractAddress | String | Contract address                         |
| >address      | String | Address                                  |
| >symbol       | String | Token symbol                             |
| >balance      | String | Token balance                            |
| >rawBalance   | String | Raw balance of token address. For unsupported chains, this field is empty. More chains will be supported soon.          |
| >tokenPrice   | String | Token unit value, priced in USD          |
| >isRiskToken  | Boolean| `true`: flagged as a risky airdrop & honeypot token <br/> `false`: not flagged as a risky airdrop & honeypot token |

</ResponseParamsWrapper>



</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/balance/all-token-balances-by-address?address=0xEd0C6079229E2d407672a117c22b62064f4a4312&chains=1' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example
<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "tokenAssets": [
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x386ae941d4262b0ee96354499df2ab8442734ec0",
                    "symbol": "PT-sUSDE-27FEB2025",
                    "balance": "47042180.520700015",
                    "tokenPrice": "0.968391562089677097",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
                    "symbol": "wstETH",
                    "balance": "7565.892480395067",
                    "tokenPrice": "4321.611627695311",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
                    "symbol": "WBTC",
                    "balance": "329.10055205",
                    "tokenPrice": "98847.8",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x23878914efe38d27c4d67ab83ed1b93a74d4086a",
                    "symbol": "aEthUSDT",
                    "balance": "30057379.938443",
                    "tokenPrice": "0.99978",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x657e8c867d8b37dcc18fa4caead9c45eb088c642",
                    "symbol": "eBTC",
                    "balance": "271.94970471",
                    "tokenPrice": "99094.345321371",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8",
                    "symbol": "aEthWETH",
                    "balance": "6080.001975381972",
                    "tokenPrice": "3634.32",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xe00bd3df25fb187d6abbb620b3dfd19839947b81",
                    "symbol": "PT-sUSDE-27MAR2025",
                    "balance": "19016580.895408865",
                    "tokenPrice": "0.952031186961110727",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xa17581a9e3356d9a858b789d68b4d866e593ae94",
                    "symbol": "cWETHv3",
                    "balance": "3000.000734740809",
                    "tokenPrice": "3663.74",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x9d39a5de30e57443bff2a8307a4256c8797a3497",
                    "symbol": "sUSDe",
                    "balance": "4863500.628333919",
                    "tokenPrice": "1.144688569528375454",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xec5a52c685cc3ad79a6a347abace330d69e0b1ed",
                    "symbol": "PT-LBTC-27MAR2025",
                    "balance": "46.02912324",
                    "tokenPrice": "97165.169717785655331396",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x8236a87084f8b84306f72007f36f2618a5634494",
                    "symbol": "LBTC",
                    "balance": "38.09998",
                    "tokenPrice": "99187.19184268864",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xbeef047a543e45807105e51a8bbefcc5950fcfba",
                    "symbol": "steakUSDT",
                    "balance": "482651.8612595832",
                    "tokenPrice": "1.063",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
                    "symbol": "USDe",
                    "balance": "69564",
                    "tokenPrice": "0.99977",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x8be3460a480c80728a8c4d7a5d5303c85ba7b3b9",
                    "symbol": "sENA",
                    "balance": "42294.989425",
                    "tokenPrice": "1.19",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "",
                    "symbol": "ETH",
                    "balance": "8.135546539084933",
                    "tokenPrice": "3638.63",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xbf5495efe5db9ce00f80364c8b423567e58d2110",
                    "symbol": "ezETH",
                    "balance": "5.270854886240325",
                    "tokenPrice": "3763.152404188635320082",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x6b175474e89094c44da98b954eedeac495271d0f",
                    "symbol": "DAI",
                    "balance": "1196.2693184870445",
                    "tokenPrice": "1.0002",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xc00e94cb662c3520282e6f5717214004a7f26888",
                    "symbol": "COMP",
                    "balance": "0.007643",
                    "tokenPrice": "84.43345772756197",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x9abfc0f085c82ec1be31d30843965fcc63053ffe",
                    "symbol": "Q*",
                    "balance": "900",
                    "tokenPrice": "0.000419255747329174",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
                    "symbol": "rsETH",
                    "balance": "0.00007090104120006",
                    "tokenPrice": "3765.640772858747921444",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x56015bbe3c01fe05bc30a8a9a9fd9a88917e7db3",
                    "symbol": "CAT",
                    "balance": "0.42",
                    "tokenPrice": "0.06242994543936436",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xec53bf9167f50cdeb3ae105f56099aaab9061f83",
                    "symbol": "EIGEN",
                    "balance": "0.002496149915967488",
                    "tokenPrice": "4.018538365202288",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x58d97b57bb95320f9a05dc918aef65434969c2b2",
                    "symbol": "MORPHO",
                    "balance": "0.001409373661132556",
                    "tokenPrice": "3.3568669630371337",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6",
                    "symbol": "STG",
                    "balance": "0.000009547670354338",
                    "tokenPrice": "0.49707759500034454",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xba3335588d9403515223f109edc4eb7269a9ab5d",
                    "symbol": "GEAR",
                    "balance": "0.000009005734110189",
                    "tokenPrice": "0.012329598382413718",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x35fa164735182de50811e8e2e824cfb9b6118ac2",
                    "symbol": "eETH",
                    "balance": "0.000000000000000001",
                    "tokenPrice": "3637.93",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
                    "symbol": "stETH",
                    "balance": "0.000000000000000001",
                    "tokenPrice": "3637.93",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd",
                    "symbol": "sUSDS",
                    "balance": "67435907.43236613",
                    "tokenPrice": "0",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xa8705a14c79fa1cded70875510211fec822b3c30",
                    "symbol": "BEEX",
                    "balance": "5000000",
                    "tokenPrice": "0",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0xabc0abace9fb9625fcefbedc423e8f94225bd251",
                    "symbol": "TANUKI",
                    "balance": "3548102.746002181",
                    "tokenPrice": "0",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                },
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d",
                    "symbol": "syrupUSDT",
                    "balance": "1750000",
                    "tokenPrice": "0",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": "0xed0c6079229e2d407672a117c22b62064f4a4312"
                }
            ]
        }
    ]
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>


{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get Specific Token Balance

Query the balance of a specific token under an address.

<RequestParamsWrapper>

## Request URL

<RequestTag color="ORANGE">POST</RequestTag> `https://web3.okx.com/api/v6/dex/balance/token-balances-by-address`

## Request Parameters

| Parameter      | Type   | Required | Description                             |
|----------------|--------|----------|-----------------------------------------|
| address                 | String   | Yes      | Address                    |
| tokenContractAddresses  | Array    | Yes      | List of tokens addresses to query. Maximum of 20 items. |
| >chainIndex             | String   | Yes      | Unique identifier for the chain.<br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain).         |
| >tokenContractAddress   | String   | Yes      | Token address.<br/>`1`: Pass an empty string `""` to query the native token of the corresponding chain.<br/>`2`: Pass the specific token contract address to query the corresponding token. |
| excludeRiskToken        | String   | No       | Option to filter out risky airdrop & honeypot tokens. Default is to filter <br/> `0`: Filter out <br/> `1`: Do not filter out<br/> It supports only `ETH`、`BSC`、`SOL`、`BASE` for honeypot tokens, more chains will be supported soon.   |  

</RequestParamsWrapper>
<ResponseParamsWrapper >

## Response Parameters

| Parameter    | Type   | Description                             |
|--------------|--------|-----------------------------------------|
| tokenAssets   | Array | List for token balances |
| >chainIndex   | String | Unique identifier for the chain         |
| >tokenContractAddress | String | Token address.If the return is an empty string `""`, it means the query is for the native token of the corresponding blockchain. |
| >address      | String | Address                                 |
| >symbol       | String | Token symbol                            |
| >balance      | String | Token balance.                          |
| >rawBalance   | String | Raw balance of token address. For unsupported chains, this field is empty. More chains will be supported soon.         |
| >tokenPrice   | String | Token price in USD                      |
| >isRiskToken  | Boolean| `true`: flagged as a risky airdrop & honeypot token <br/> `false`: not flagged as a risky airdrop & honeypot token |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

```shell
curl --location --request POST 'https://web3.okx.com/api/v6/dex/balance/token-balances' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z' \
--data-raw '{
    "address": "0x50c476a139aab23fdaf9bca12614cdd54a4244e3",
    "tokenContractAddresses": [
        {
            "chainIndex": "1",
            "tokenContractAddress": ""
        }
    ]
}'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "tokenAssets": [
                {
                    "chainIndex": "1",
                    "tokenContractAddress": "",
                    "symbol": "eth",
                    "balance": "0",
                    "tokenPrice": "3640.43",
                    "isRiskToken": false,
                    "rawBalance": "",
                    "address": ""
                }
            ]
        }
    ]
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>

# Error Codes

| Code  | HTTP status | Message                                                         |
|-------|-------------|-----------------------------------------------------------------|
| 50014 |  400 | param \{param0\} is invalid                               |
| 50001 |  200 | Service temporarily unavailable. Try again later          |
| 81001 |  200 | Incorrect parameter: : \{param0\}                         |
| 50011 |  429 | Too Many Requests                                         |
| 81104 |  200 | Chain not support                                         |
| 81001 |  200 | Required request body is missing                          |

# Broadcast Transactions

Transaction API supports onchain transaction simulation and broadcasting. It combines OKX Web3's proprietary RPC nodes with premium third-party nodes to enable intelligent broadcasting, lower failure rates, and faster confirmation speeds. Pair it with the Swap and Cross-Chain APIs to build a complete experience — no extra external resources needed.

## Key Capabilities

### 1. High-Availability Hybrid Node Architecture

* Proprietary multi-chain node clusters for stable, high-performance service.
* Third-party premium nodes integrated to form a redundant, resilient network.
* Real-time health monitoring, dynamic load balancing, and sub-second failover.

### 2. Intelligent Multi-Broadcasting Engine

* Broadcasts transactions across multiple node networks simultaneously.
* Distributed propagation algorithms that raise onchain success rates.
* Priority block-packaging for Ethereum, BNB Chain, Solana, and more.

{/* api-page */}

<ApiLayout
  defaultRequestLanguage='shell'
  defaultResponseStatusCode='200'
  supportedRequestLanguageList={['shell']}
  supportedResponseStatusCodeList={['200']}
>

<ParamsWrapper>

# Get Supported Chains

Retrieve information on chains supported by Onchain gateway API

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/pre-transaction/supported/chain`

## Request Parameters

None

</RequestParamsWrapper >

<ResponseParamsWrapper>

## Response Parameters

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| name      | String | Chain name        |
| logoUrl   | String | Chain logo URL    |
| shortName | String | Chain short name  |
| chainIndex| String | Chain unique identifier |

</ResponseParamsWrapper>



</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/pre-transaction/supported/chain' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper>
<ResponseCodeExample codeStatus='200'>

```json

{
    "code": "0",
    "data": [
        {
            "name": "Ethereum",
            "logoUrl": "http://www.eth.org/eth.png",
            "shortName": "ETH",
            "chainIndex": "1"
        }
    ],
    "msg": ""
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>


{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get Gas Price

Dynamically obtain estimated gas prices for various chains.

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/pre-transaction/gas-price`

## Request Parameters

| Parameter  | Type   | Required | Description                                                                                   |
|------------|--------|----------|-----------------------------------------------------------------------------------------------|
| chainIndex | String | Yes      | Unique identifier for the chain.<br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain).       |

</RequestParamsWrapper>

<ResponseParamsWrapper>

## Response Parameters

### EVM & Tron

| Parameter        | Type    | Description                       |
|------------------|---------|-----------------------------------|
| normal          | String  | Medium gas price. For EVM, it is in wei. For Tron，it is in SUN    |
| min             | String  | Low gas price. For EVM, it is in wei. For Tron，it is in SUN       |
| max             | String  | High gas price. For EVM, it is in wei. For Tron，it is in SUN      |
| supporteip1559  | Boolean | Whether supports 1559             |
| eip1559Protocol | Object  | 1559 protocol                     |

### eip1559 Protocol

| Parameter           | Type   | Description                          |
|---------------------|--------|--------------------------------------|
| eip1559Protocol     | Object | Structure of 1559 protocol           |
| >suggestBaseFee     | String | Suggested base fee = base fee * 1.25, in wei |
| >baseFee            | String | Base fee, in wei                     |
| >proposePriorityFee | String | Medium priority fee, in wei          |
| >safePriorityFee    | String | Low priority fee, in wei             |
| >fastPriorityFee    | String | High priority fee, in wei            |

### Solana

| Parameter        | Type    | Description       |
|------------------|---------|-------------------|
| priorityFee         | String  | Priority fee per compute unit. Only applicable to Solana |
| >proposePriorityFee | String  | Medium priority fee in microlamports.( it is also called Medium compute unit price ) 80th percentile|
| >safePriorityFee    | String  | Low priority fee in microlamports.( it is also called Low compute unit price ) 60th percentile|
| >fastPriorityFee    | String  | High priority fee in microlamports.( it is also called High compute unit price ) 95th percentile|
| >extremePriorityFee | String  | Extreme High priority fee in microlamports.( it is also called Extreme High compute unit price ) 99th percentile |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

```shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/pre-transaction/gas-price?chainIndex=1' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper>

<ResponseCodeExample codeStatus='200'>

```json
{
    "code": "0",
    "data": [
        {
            "normal" : "21289500000", // Medium gas price
            "min" : "15670000000",    // Low gas price
            "max" : "29149000000",    // High gas price            
            "supportEip1559" : true,  // Whether supports 1559
            "eip1599Protocol": {
                "suggestBaseFee" : "15170000000", // Suggested base fee
                "baseFee" : "15170000000",        // Base fee
                "proposePriorityFee" : "810000000", // Medium priority fee
                "safePriorityFee" : "500000000",    // Low priority fee
                "fastPriorityFee" : "3360000000"    // High priority fee
            },
            "priorityFee":{}
       }     
    ],
    "msg": ""
}

```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>

{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>


# Get Gas Limit

Retrieve estimated Gas Limit consumption through pre-execution of transaction information.

<RequestParamsWrapper>

## Request URL

<RequestTag color="ORANGE">POST</RequestTag> `https://web3.okx.com/api/v6/dex/pre-transaction/gas-limit`

## Request Parameters

| Parameter  | Type   | Required | Description                                                                                    |
|------------|--------|----------|-----------------------------------------------------------------------------------------------|
| chainIndex | String | Yes      | Unique identifier for the chain.<br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain).                                                                  |
| fromAddress| String | Yes      | From address. For `transfer`,`Swap`, `Approve`, it is a wallet address                           |
| toAddress  | String | Yes      | To address. <br/>For `transfer`, it can be a token address or wallet address. <br/> For `Swap`,  it should be OKX DEX router address. <br/>For `Approve`, it is a token address     |
| txAmount   | String | No       | Transaction amount. Default value: `0`. <br/> 1. For **Native token transactions** ( where the `fromToken` is native token. e.g., Ethereum),  the txAmount can be set to the native token quantity, or retrieved from [/swap](./dex-swap) api(e.g., `txAmount = swapResponse.tx.value`). <br/>2.For **non-native token transactions**,  set `txAmount` to `0`. <br/>The valle must use base unit of the native token, e.g., wei for ETH  |
| extJson    | Object | No       | Additional parameters for calldata and other information                                         |

extJson

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| inputData | String | No       | Calldata    |

</RequestParamsWrapper>
<ResponseParamsWrapper>

## Response Parameters

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| gasLimit  | String | Estimated gas limit |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request POST 'https://web3.okx.com/api/v6/dex/pre-transaction/gas-limit' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z' \
--data-raw '{
    "fromAddress": "0x383c8208b4711256753b70729ba0cf0cda55efad",
    "toAddress": "0x4ad041bbc6fa102394773c6d8f6d634320773af4",
    "txAmount": "31600000000000000",
    "chainIndex": "1",
    "extJson": {
        "inputData":"041bbc6fa102394773c6d8f6d634320773af4"
    }
}'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper>

<ResponseCodeExample codeStatus='200'>

```json

{
    "code": "0",
    "data": [
        {
            "gasLimit": "652683"
        }
    ],
    "msg": ""
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>

{/* api-page */}

<ApiLayout   defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200']}>

<ParamsWrapper>
# Simulate Transactions

Simulate a blockchain transaction before executing it to see the expected outcomes and potential risks.<br/>
Transaction simulate API is available to our whitelisted customers only. If you are interested, please contact us dexapi@okx.com.

<RequestParamsWrapper>

## Request URL
<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/pre-transaction/simulate`
## Request Parameters

| Parameter    | Type   | Required | Description                                                                           |
|--------------|--------|----------|---------------------------------------------------------------------------------------|
| fromAddress  | String | Yes      | Source address. For `Swap`, `Approve`, it is a wallet address |
| toAddress    | String | Yes      | Destination address. <br/>For `Swap`,  it should be OKX DEX router address. <br/>For `Approve`, it is a token address |
| chainIndex   | String | Yes      | Unique identifier for the chain.<br/>e.g., `1`: Ethereum<br/>See [Supported Chains](../home/supported-chain) for more. <br/>It supports EVM、SOL、SUI, more chains will be supported soon. |
| txAmount     | String | No       | Transaction amount. Default value: `0`. <br/> 1. For **Native token transactions** ( where the `fromToken` is native token. e.g., Ethereum),  the txAmount can be set to the native token quantity, or retrieved from [/swap](./dex-swap) api(e.g., `txAmount = swapResponse.tx.value`). <br/>2.For **non-native token transactions**,  set `txAmount` to `0`. <br/>The valle must use base unit of the native token, e.g., wei for ETH  |
| extJson      | Object | Yes      | Extended information object containing the following fields: |
| > inputData  | String | Yes      | Call data for the transaction. The encoding rule require `base58`. |
| priorityFee  | String | No       | Priority fee. Only applicable to Solana. |
| gasPrice     | String | No       | Gas price for the transaction. |

</RequestParamsWrapper>


<ResponseParamsWrapper>

## Response Parameters

| Parameter    | Type   | Description                                                        |
|--------------|--------|--------------------------------------------------------------------|
| intention    | String | Transaction purpose. Valid values: "Swap", "Token Approval"               |
| assetChange  | Array  | Details of asset changes resulting from the transaction            |
| > assetType  | String | Asset type. Valid values: "NATIVE", "ERC20", "SPLTOKEN"，"SUITOKEN"|
| > name       | String | Asset name (e.g., "Ethereum")                                      |
| > symbol     | String | Asset symbol (e.g., "ETH")                                         |
| > decimals   | Number | Asset decimal precision                                            |
| > address    | String | Asset contract address                                             |
| > imageUrl   | String | URL to the asset's image                                           |
| > rawValue   | String | Asset amount. Positive values indicate receiving assets, negative values indicate sending assets. |
| gasUsed      | String | Gas consumed by the transaction                          |
| failReason   | String | Human-friendly explanation if the transaction would fail           |
| risks        | Array  | Potential risks identified in the transaction                      |
| > address    | String | Address associated with the risk                                   |
| > addressType| String | Type of address. Valid values: "contract", "eoa"           |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>
  ## Request Example
<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

```shell
curl --location --request POST 'https://web3.okx.com/api/v6/dex/pre-transaction/simulate' \
--header 'OK-ACCESS-KEY: your-access-key' \
--header 'OK-ACCESS-SIGN: your-access-sign' \
--header 'OK-ACCESS-PASSPHRASE: your-passphrase' \
--header 'OK-ACCESS-TIMESTAMP: 2025-05-19T10:00:00.000Z' \
--header 'Content-Type: application/json' \
--data-raw '{
  "fromAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "toAddress": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "chainIndex": "1",
  "txAmount": "0",
  "extJson": {
    "inputData": "0x38ed1739000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000000000000042ab52c000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e0000000000000000000000000000000000000000000000000000000064794b4b0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
  "gasPrice": "12000000000"
}'
```
</RequestCodeExample>

 </RequestCodeExampleWrapper>
  ## Response Example
  <ResponseCodeExampleWrapper >
    <ResponseCodeExample codeStatus='200'>

```json
{
  "code": "0",
  "data": [
    {
      "intention": "SWAP",
      "assetChange": [
        {
          "assetType": "NATIVE",
          "name": "Ether",
          "symbol": "ETH",
          "decimals": 18,
          "address": "",
          "imageUrl": "",
          "rawValue": "-1000000000000000"
        },
        {
          "assetType": "ERC20",
          "name": "USD Coin",
          "symbol": "USDC",
          "decimals": 6,
          "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          "imageUrl": "",
          "rawValue": "1000000000000000"
        }
      ],
      "gasUsed": "180000",
      "failReason": "",
      "risks": []
    }
  ],
  "msg": "success"
}
```


    </ResponseCodeExample>
  </ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>

{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Broadcast Transactions

Broadcast transactions to the specified blockchain. <br/>


<Tip title="Disclaimer">Your end-user's transaction can only be covered by the MEV protection feature if you actually utilise OKX Build's API services for that particular transaction. MEV protection is currently an experimental feature provided by third-parties and OKX Build does not guarantee the effectiveness and quality of such MEV protection.</Tip>
<RequestParamsWrapper>

## Request URL 

<RequestTag color="ORANGE">POST</RequestTag> `https://web3.okx.com/api/v6/dex/pre-transaction/broadcast-transaction`

## Request Parameters

| Parameter   | Type    | Required | Description                                                            |
|------------ |-------- |----------|------------------------------------------------------------------------|
| signedTx              | String  | Yes      | The transaction string after being signed                              |
| chainIndex            | String  | Yes      | Unique identifier for the chain.<br/> e.g., ETH=1. <br/>See more [here](../home/supported-chain). |
| address               | String  | Yes      | Address.                                                                                |
| extraData	            | String  | No	     | Additional parameters for calldata and other information              |
| > enableMevProtection | Boolean | No	     | Enable MEV protection. Not enabled by default. Valid values: `false`:not enabled, `true`:enabled <br/> It supports only `ETH`、`BSC`、`SOL`、`BASE`, more chains will be supported soon.                  |
| > jitoSignedTx	    | String  | No	     | The transaction string after being signed that will send to Jito. The encoding rule require `base58`, applicable to `SOL`. For SOL, `signedTx` and `jitoSignedTx` must be passed at the same time  |



</RequestParamsWrapper>
<ResponseParamsWrapper>

## Response Parameters

 | Parameter | Type   | Description        |
 |-----------|--------|--------------------|
 | orderId   | String | Unique transaction identifier |
 | txHash    | String | Transaction Hash.<br/> It supports only `ETH`、`BSC`、`SOL`、`BASE`, more chains will be supported soon.                |

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell

curl --location --request POST 'https://web3.okx.com/api/v6/dex/pre-transaction/broadcast-transaction' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z' \
--data-raw '{
    "signedTx":"0x08b47112567534ad041bbc6fa102394773c6d8f6d634320773af4da55efa",
    "address": "0x383c8208b4711256753b70729ba0cf0cda55efad",
    "chainIndex": "1",
    "extraData":"{\"enableMevProtection\":true,\"jitoSignedTx\":\"0x123456\"}"
}'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper >

<ResponseCodeExample codeStatus='200'>

```json

{
    "code": "0",
    "data": [
        {
            "orderId": "0x383c8208b4711256753b70729ba0cf0cda55efad",
            "txHash": "0xd394f356a16b618ed839c66c935c9cccc5dde0af832ff9b468677eea38759db5"            
        }
    ],
    "msg": ""
}

```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>

{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>


# Get Transaction Orders

Get the list of orders sent from transaction broadcasting API. This supports querying transactions sorted in descending order by time.

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/post-transaction/orders`

## Request Parameters

| Parameter   | Type    | Required | Description                                         |
|------------ |-------- |----------|----------------------------------------------------|
| address     | String  | Yes      | Address |
| chainIndex  | String  | Yes      | Unique identifier for the chain.<br/>  e.g., `1`: Ethereum. <br/>See more [here](../home/supported-chain).                     |
| txStatus    | String  | No       | Transaction status: <br/> `1`: Pending <br/> `2`: Success <br/> `3`: Failed |
| orderId     | String  | No       | Unique identifier for the transaction order         |
| cursor      | String  | No       | Cursor                                              |
| limit       | String  | No       | Number of records returned, default is the most recent 20, maximum is 100 |


</RequestParamsWrapper>
<ResponseParamsWrapper >

## Response Parameters

| Parameter   | Type    | Description                                          |
|------------ |-------- |-----------------------------------------------------|
| chainIndex  | String  | Unique identifier for the chain                      |
| address     | String  | Address                                              |
| orderId     | String  | Order ID                                             |
| txStatus    | String  | Transaction status: <br/> `1`: Pending <br/> `2`: Success <br/> `3`: Failed |
| failReason  | String  | The reason for failed transaction                    |
| txHash      | String  | Transaction hash                                     |


</ResponseParamsWrapper >


</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/post-transaction/orders?address=0x238193be9e80e68eace3588b45d8cf4a7eae0fa3&chainIndex=1' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {

            "cursor": "1",
            "orders":[
                {
                    "chainIndex": "1",
                    "orderId": "016cf21d020be6c2f071dad9bbd8ec5cb9342fa8",
                    "address": "0x238193be9e80e68eace3588b45d8cf4a7eae0fa3",
                    "txHash": "0xb240e65dd9156b4a450be72f6c9fe41be6f72397025bb465b21a96ee9871a589",
                    "failReason": "",
                    "txstatus": "2"
                },
                {
                    "chainIndex": "1",
                    "orderId": "592051a92a744627022955be929ecb5c9e777705",
                    "address": "0x238193be9e80e68eace3588b45d8cf4a7eae0fa3",
                    "txHash": "0xc401ffcd2a2b4b1db42ce68dfde8e63c0a1e9653484efb2873dbf5d0cbeb227a",
                    "txstatus": "1",
                    "failReason": "",
                }
            ]
        }
    ] 
}


```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>

# Check Transaction History

Transaction History API retrieves onchain transaction records for any wallet address. It supports multiple chains and returns structured data covering transfers, contract interactions, and token activity. Use it to build portfolio trackers, wallet dashboards, and onchain analytics tools.

## Key Capabilities

### 1. Multi-Chain Transaction Query

* Query transaction history across all supported chains by wallet address.
* Filter by asset type, transaction type, or time range.
* Paginated responses for efficient data handling.

### 2. Detailed Transaction Data

* Returns transaction hash, timestamp, status, gas fee, and block number.
* Covers native token transfers, ERC-20/SPL token transfers, and contract calls.
* Supports both real-time and historical data access.

{/* api-page */}

<ApiLayout
  defaultRequestLanguage='shell'
  defaultResponseStatusCode='200'
  supportedRequestLanguageList={['shell']}
  supportedResponseStatusCodeList={['200']}
>

<ParamsWrapper>

# Get Supported Chains

Retrieve information on chains supported by Transaction history API

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/balance/supported/chain`

## Request Parameters

None

</RequestParamsWrapper >

<ResponseParamsWrapper>

## Response Parameters

| Parameter | Type   | Description       |
|-----------|--------|-------------------|
| name      | String | Chain name        |
| logoUrl   | String | Chain logo URL    |
| shortName | String | Chain short name  |
| chainIndex| String | Chain unique identifier |

</ResponseParamsWrapper>



</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/balance/supported/chain' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper>
<ResponseCodeExample codeStatus='200'>

```json

{
    "code": "0",
    "data": [
        {
            "name": "Ethereum",
            "logoUrl": "http://www.eth.org/eth.png",
            "shortName": "ETH",
            "chainIndex": "1"
        }
    ],
    "msg": ""
}
```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>

</CodeExampleWrapper>

</ApiLayout>


{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get History by Address

Query the transaction history under the address dimension for 6 months, sorted in descending chronological order.

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/post-transaction/transactions-by-address`

## Request Parameters

| Parameter            | Type           | Required         | Description                                                                                                           |
|--------------        |--------        |----------        |---------------------------------------------------------------------------------------------------------------        |
| address              | String         | Yes              | Address to query the transaction history for                                                                         |
| chains               | String         | No               | Filter the chains whose transaction history needs to be queried. Multiple chains are separated by ",". A maximum of 50 chains are supported.                                            |
| tokenContractAddress | String         | No               | Token contract address; if empty, query addresses with main chain currency balance;if not pass, query all          |
| begin                | String         | No               | Start time, queries transactions after this time. Unix timestamp, in milliseconds                                      |
| end                  | String         | No               | End time, queries transactions before this time. If both begin and end are not provided, queries transactions before the current time. Unix timestamp, in milliseconds |
| cursor               | String         | No               | Cursor                                                                                                                |
| limit                | String         | No               | Number of records to return, defaults to the most recent 20 records.<br/>Up to a maximum of 20 records for query on single chain.<br/>Up to a maximum of 100 records for query on multiple chain.                |                                                                           |

</RequestParamsWrapper>
<ResponseParamsWrapper >

## Response Parameters

| Parameter               | Type                                    | Description                                                 |
|-----------------        |---------------------------------        |-----------------------------------------------------        |
| transactions            | Array                                   | List of transactions                                                    |
| >chainIndex             | String                                  | Chain ID                                                        |
| >txHash                 | String                                  | Transaction hash                                                    |
| >itype                  | String                                  | Transaction tier type <br/> `0`: Outer main chain coin transfer <br/> `1`: Contract inner main chain coin transfer <br/> `2`: Token transfer      |
| >methodId              | String                                  | Contract Function Call                                                       |
| >nonce                 | String                                  | The nth transaction initiated by the sender address                                  |
| >txTime                 | String                                  | Transaction time in Unix timestamp format, in milliseconds, e.g., 1597026383085          |
| >from                	 | Array  	      | Transaction input                                    |
| >>address   	         | String 	      | Sending/input address, comma-separated for multi-signature transactions |
| >>amount    	         | String 	      | Input amount                                                |
| >to 	                 | Array  	      | Transaction output                                   |
| >>address   	         | String 	      | Receiving/output address, comma-separated for multiple addresses |
| >>amount             	 | String 	      | Output amount  
| >tokenContractAddress          | String                                  | Token contract address                                              |
| >amount                | String                                  | Transaction amount                                                    |
| >symbol                | String                                  | Currency symbol corresponding to the transaction amount                                          |
| >txFee                 | String                                  | Transaction fee                                                      |
| >txStatus               | String                                  | Transaction status: `success` for successful transactions, `fail` for failed transactions, `pending` for pending transactions         |
| >hitBlacklist            | Boolean                                 | `false`: Not in blacklist, `true`: In blacklist                              |
| cursor                   | String                                  | Cursor                                                                   |                                                                                                                                                                                                                                                            

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/post-transaction/transactions-by-address?addresses=0x50c476a139aab23fdaf9bca12614cdd54a4244e4&chains=1' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example
<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "cursor": "1706197403",
            "transactionList": [
                {
                    "chainIndex": "1",
                    "txHash": "0x963767695543cfb7804039c470b110b87adf9ab69ebc002b571523b714b828ca",
                    "methodId": "",
                    "nonce": "",
                    "txTime": "1724213411000",
                    "from": [
                        {
                            "address": 
                                "0xae7ab96520de3a18e5e111b5eaab095312d7fe84"
                                "amount": ""
                        }
                    ],
                    "to": [
                        {
                            "address": 
                                "0x50c476a139aab23fdaf9bca12614cdd54a4244e4"
                                "amount": ""
                        }
                    ],
                    "tokenContractAddress": "0xe13c851c331874028cd8f681052ad3367000fb13",
                    "amount": "1",
                    "symbol": "claim rewards on stethdao.net",
                    "txFee": "",
                    "txStatus": "success",
                    "hitBlacklist": true,
                    "itype": "2"
                }
            ]
        }
    ]
}

```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>



{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get History by Address

Query the transaction history under the address dimension for 6 months, sorted in descending chronological order.

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/post-transaction/transactions-by-address`

## Request Parameters

| Parameter            | Type           | Required         | Description                                                                                                           |
|--------------        |--------        |----------        |---------------------------------------------------------------------------------------------------------------        |
| address              | String         | Yes              | Address to query the transaction history for                                                                         |
| chains               | String         | No               | Filter the chains whose transaction history needs to be queried. Multiple chains are separated by ",". A maximum of 50 chains are supported.                                            |
| tokenContractAddress | String         | No               | Token contract address; if empty, query addresses with main chain currency balance;if not pass, query all          |
| begin                | String         | No               | Start time, queries transactions after this time. Unix timestamp, in milliseconds                                      |
| end                  | String         | No               | End time, queries transactions before this time. If both begin and end are not provided, queries transactions before the current time. Unix timestamp, in milliseconds |
| cursor               | String         | No               | Cursor                                                                                                                |
| limit                | String         | No               | Number of records to return, defaults to the most recent 20 records.<br/>Up to a maximum of 20 records for query on single chain.<br/>Up to a maximum of 100 records for query on multiple chain.                |                                                                           |

</RequestParamsWrapper>
<ResponseParamsWrapper >

## Response Parameters

| Parameter               | Type                                    | Description                                                 |
|-----------------        |---------------------------------        |-----------------------------------------------------        |
| transactions            | Array                                   | List of transactions                                                    |
| >chainIndex             | String                                  | Chain ID                                                        |
| >txHash                 | String                                  | Transaction hash                                                    |
| >itype                  | String                                  | Transaction tier type <br/> `0`: Outer main chain coin transfer <br/> `1`: Contract inner main chain coin transfer <br/> `2`: Token transfer      |
| >methodId              | String                                  | Contract Function Call                                                       |
| >nonce                 | String                                  | The nth transaction initiated by the sender address                                  |
| >txTime                 | String                                  | Transaction time in Unix timestamp format, in milliseconds, e.g., 1597026383085          |
| >from                	 | Array  	      | Transaction input                                    |
| >>address   	         | String 	      | Sending/input address, comma-separated for multi-signature transactions |
| >>amount    	         | String 	      | Input amount                                                |
| >to 	                 | Array  	      | Transaction output                                   |
| >>address   	         | String 	      | Receiving/output address, comma-separated for multiple addresses |
| >>amount             	 | String 	      | Output amount  
| >tokenContractAddress          | String                                  | Token contract address                                              |
| >amount                | String                                  | Transaction amount                                                    |
| >symbol                | String                                  | Currency symbol corresponding to the transaction amount                                          |
| >txFee                 | String                                  | Transaction fee                                                      |
| >txStatus               | String                                  | Transaction status: `success` for successful transactions, `fail` for failed transactions, `pending` for pending transactions         |
| >hitBlacklist            | Boolean                                 | `false`: Not in blacklist, `true`: In blacklist                              |
| cursor                   | String                                  | Cursor                                                                   |                                                                                                                                                                                                                                                            

</ResponseParamsWrapper>

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

``` shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/post-transaction/transactions-by-address?addresses=0x50c476a139aab23fdaf9bca12614cdd54a4244e4&chains=1' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example
<ResponseCodeExampleWrapper >
<ResponseCodeExample codeStatus='200'>

``` json
{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "cursor": "1706197403",
            "transactionList": [
                {
                    "chainIndex": "1",
                    "txHash": "0x963767695543cfb7804039c470b110b87adf9ab69ebc002b571523b714b828ca",
                    "methodId": "",
                    "nonce": "",
                    "txTime": "1724213411000",
                    "from": [
                        {
                            "address": 
                                "0xae7ab96520de3a18e5e111b5eaab095312d7fe84"
                                "amount": ""
                        }
                    ],
                    "to": [
                        {
                            "address": 
                                "0x50c476a139aab23fdaf9bca12614cdd54a4244e4"
                                "amount": ""
                        }
                    ],
                    "tokenContractAddress": "0xe13c851c331874028cd8f681052ad3367000fb13",
                    "amount": "1",
                    "symbol": "claim rewards on stethdao.net",
                    "txFee": "",
                    "txStatus": "success",
                    "hitBlacklist": true,
                    "itype": "2"
                }
            ]
        }
    ]
}

```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>




{/* api-page */}

<ApiLayout defaultRequestLanguage='shell' defaultResponseStatusCode='200' supportedRequestLanguageList={['shell']} supportedResponseStatusCodeList={['200',]}>

<ParamsWrapper>

# Get Specific Transaction

Retrieve details of a transaction based on `txHash` for 6 months. It decomposes a transaction and its internal transactions into sub-transactions based on asset type: <br/> `0`: Outer layer mainnet coin transfer <br/> `1`: Inner layer mainnet coin transfer in a contract <br/> `2`: Token transfer

<Tip title="Note">It decomposes a transaction into sub-transactions based on asset type. For EVM transactions, different sub-transaction types include: <br/> `0`: Outer layer mainnet coin transfer <br/> `1`: Inner layer mainnet coin transfer in a contract <br/> `2`: Token transfer</Tip>

<RequestParamsWrapper>

## Request URL

<RequestTag color="GREEN">GET</RequestTag> `https://web3.okx.com/api/v6/dex/post-transaction/transaction-detail-by-txhash`

## Request Parameters

| Parameter          | Type           | Required         | Description                                                              |
|--------------------|----------------|------------------|--------------------------------------------------------------------------|
| chainIndex         | String         | Yes              | Unique identifier for the chain                                           |
| txHash             | String         | Yes              | Transaction hash                                                           |
| itype              | String         | No               | Layer type for transactions <br/> `0`: Outer layer mainnet coin transfer <br/> `1`: Inner layer mainnet coin transfer <br/> `2`: Token transfer |

</RequestParamsWrapper>

<ResponseParamsWrapper >

## Response Parameters

| Parameter                          | Type           | Description                                                    |
|------------------------------------|----------------|----------------------------------------------------------------|
| chainIndex                         | String         | Unique identifier for the chain                                 |
| height                             | String         | Block height where the transaction occurred                     |
| txTime                             | String         | Transaction time; Unix timestamp in milliseconds                |
| txhash                             | String         | Transaction hash                                                 |
| txStatus                           | String         | Transaction status: <br/> `1`: pending <br/> `2`: success <br/> `3`: fail |
| gasLimit                           | String         | Gas limit                                                        |
| gasUsed                            | String         | Gas used                                                          |
| gasPrice                           | String         | Gas price                                                        |
| txFee                              | String         | Transaction fee.                                                 |
| nonce                              | String         | Nonce                                                             |
| amount                             | String         | Transaction amount                                               |
| symbol                             | String         | Currency symbol for the transaction amount                        |
| methodId                           | String         | Contract method ID                                               |
| fromDetails                        | Array          | Details of transaction inputs                                    |
| >address                           | String         | Sender/input address                                             |
| >vinIndex                          | String         | Index of the input in the current transaction                     |
| >preVoutIndex                      | String         | Index of the output in the previous transaction                   |
| >txhash                            | String         | Transaction hash, used with `preVoutIndex` to uniquely identify the UTXO |
| >isContract                         | Boolean           | Whether the sender address is a contract (true: yes; false: no) |
| >amount                             | String         | Transaction amount                                               |
| toDetails                          | Array          | Details of transaction outputs                                   |
| >address                           | String         | Receiver/output address                                          |
| >voutIndex                         | String         | Output index                                                      |
| >isContract                         | Boolean           | Whether the receiver address is a contract (true: yes; false: no) |
| >amount                             | String         | Transaction amount                                               |
| internalTransactionDetails         | Array          | Internal transaction details                                     |
| >from                             | String         | Sender address for the internal transaction                        |
| >to                               | String         | Receiver address for the internal transaction                      |
| >isFromContract                   | Boolean            | Whether the sender address is a contract (true: yes; false: no) |
| >isToContract                     | Boolean            | Whether the receiver address is a contract (true: yes; false: no) |
| >amount                           | String         | Transaction amount                                               |
| >txStatus                          | String         | Transaction status                                               |
| tokenTransferDetails               | Array          | Token transfer details                                           |
| >from                             | String         | Sender address for token transfer                                 |
| >to                               | String         | Receiver address for token transfer                               |
| >isFromContract                   | Boolean            | Whether the sender address is a contract (true: yes; false: no) |
| >isToContract                     | Boolean            | Whether the receiver address is a contract (true: yes; false: no) |
| >tokenContractAddress             | String         | Token contract address                                           |
| >symbol                           | String         | Token symbol                                                     |
| >amount                           | String         | Token amount                                                     |
| l1OriginHash                       | String         | Hash of the L1 transaction executed                              |

</ResponseParamsWrapper >

</ParamsWrapper>

<CodeExampleWrapper>

## Request Example

<RequestCodeExampleWrapper>
<RequestCodeExample language="shell">

```shell
curl --location --request GET 'https://web3.okx.com/api/v6/dex/post-transaction/transaction-detail-by-txhash?txHash=0x9ab8ccccc9f778ea91ce4c0f15517672c4bd06d166e830da41ba552e744d29a5&chainIndex=42161' \
--header 'Content-Type: application/json' \
--header 'OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418' \
--header 'OK-ACCESS-SIGN: leaV********3uw=' \
--header 'OK-ACCESS-PASSPHRASE: 1****6' \
--header 'OK-ACCESS-TIMESTAMP: 2023-10-18T12:21:41.274Z'
```

</RequestCodeExample>

</RequestCodeExampleWrapper>

## Response Example

<ResponseCodeExampleWrapper >

<ResponseCodeExample codeStatus='200'>

``` json

{
    "code": "0",
    "msg": "success",
    "data": [
        {
            "chainIndex": "42161",
            "height": "245222398",
            "txTime": "1724253417000",
            "txhash": "0x9ab8ccccc9f778ea91ce4c0f15517672c4bd06d166e830da41ba552e744d29a5",
            "gasLimit": "2000000",
            "gasUsed": "2000000",
            "gasPrice": "10000000",
            "txFee":"",
            "nonce": "0",
            "symbol": "ETH",
            "amount": "0",
            "txStatus": "success",
            "methodId": "0xc9f95d32",
            "l1OriginHash": "0xa6a87ba2f18cc32bbae8f3b2253a29a9617ed1eb0940d80443f6e3bf9873dbad",
            "fromDetails": [
                {
                    "address": "0xd297fa914353c44b2e33ebe05f21846f1048cfeb",
                    "vinIndex": "",
                    "preVoutIndex": "",
                    "txHash": "",
                    "isContract": false,
                    "amount": ""
                }
            ],
            "toDetails": [
                {
                    "address": "0x000000000000000000000000000000000000006e",
                    "voutIndex": "",
                    "isContract": false,
                    "amount": ""
                }
            ],
            "internalTransactionDetails": [
                {
                    "from": "0x0000000000000000000000000000000000000000",
                    "to": "0xd297fa914353c44b2e33ebe05f21846f1048cfeb",
                    "isFromContract": false,
                    "isToContract": false,
                    "amount": "0.02",
                    "txStatus": "success"
                },
                {
                    "from": "0xd297fa914353c44b2e33ebe05f21846f1048cfeb",
                    "to": "0x428ab2ba90eba0a4be7af34c9ac451ab061ac010",
                    "isFromContract": false,
                    "isToContract": false,
                    "amount": "0.00998",
                    "txStatus": "success"
                },
                {
                    "from": "0xd297fa914353c44b2e33ebe05f21846f1048cfeb",
                    "to": "0x428ab2ba90eba0a4be7af34c9ac451ab061ac010",
                    "isFromContract": false,
                    "isToContract": false,
                    "amount": "0.009977946366846017",
                    "txStatus": "success"
                }
            ],
            "tokenTransferDetails": []
        }
    ]
}


```

</ResponseCodeExample>

</ResponseCodeExampleWrapper>
</CodeExampleWrapper>

</ApiLayout>

# Error Codes

| Code  | HTTP status | Message                                                                            |
|-------|-------------|-----------------------------------------------------------------------------------------|
| 81001 | 200     | Incorrect parameter                                                                              |





