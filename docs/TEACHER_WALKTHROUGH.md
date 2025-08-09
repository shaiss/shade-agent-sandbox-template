### Shade Agent Template — Teacher Walkthrough Guide

This guide helps you lead a live workshop. It groups files by responsibility and maps user actions to specific files, functions, and line ranges you can point to while teaching. It avoids embedding code; instead, it references where to look.

## Environment setup callouts

- **Contract ID**: `NEXT_PUBLIC_contractId` must be set for all chains
- **Solana**: `SOLANA_PROGRAM_ID`, `SOLANA_PRICE_ACCOUNT` for Solana route
- **RPCs**: public RPCs for Sepolia, IoTeX, Solana are hardcoded in utils and frontend

## File groups (where to look)

- **Backend entrypoint & routing**
  - `src/index.ts` (L1–L54): server boot, CORS, route mounting, SSE log stream

- **Backend API routes**
  - `src/routes/price.ts` (L1–L27): GET `/api/price`
  - `src/routes/transaction.ts` (L1–L106): GET `/api/transaction` (Ethereum Sepolia)
  - `src/routes/iotexTransaction.ts` (L1–L188): GET `/api/iotex-transaction` (IoTeX Testnet)
  - `src/routes/solanaTransaction.ts` (L1–L114): GET `/api/solana-transaction` (Devnet)
  - `src/routes/ethAccount.ts` (L1–L27): GET `/api/eth-account`
  - `src/routes/iotexAccount.ts` (L1–L40): GET `/api/iotex-account?network=testnet|mainnet`
  - `src/routes/solanaAccount.ts` (L1–L35): GET `/api/solana-account?network=devnet|mainnet`
  - `src/routes/agentAccount.ts` (L1–L25): GET `/api/agent-account`
  - `src/routes/nonceControl.ts` (L1–L46): GET `/status`, POST `/toggle`, POST `/reset`

- **Backend utils (core logic)**
  - `src/utils/fetch-eth-price.ts` (L1–L67): price sources and averaging
  - `src/utils/ethereum.ts` (L1–L51): Sepolia adapter, ABI, address
  - `src/utils/ethereumNonceManager.ts` (L1–L59): next nonce selection and reset
  - `src/utils/iotex.ts` (L1–L163): IoTeX adapter (fixed gas + legacy type-0), ABI, addresses
  - `src/utils/solana.ts` (L1–L32): Solana adapters and MPC path
  - `src/utils/nonceManager.ts` (L1–L113): MPC signature request with optional nonce increment handling
  - `src/utils/logStream.ts` (L1–L93): SSE log stream + console hook

- **Frontend (Vite React)**
  - `frontend/src/App.jsx` (L1–L537): main demo UI and flows
  - `frontend/src/ethereum.js` (L1–L127): read-only helpers for contract state and events
  - `frontend/src/networks.js` (L1–L34): RPCs, explorer links, contract addresses
  - `frontend/src/Overlay.jsx` (L1–L23): transient message overlay
  - `frontend/src/MultiChainDemo.jsx` (L1–L306) and `frontend/src/SingleChainDemo.jsx` (L1–L139): alternate demo components (kept for reference)

- **Smart contract**
  - `contracts/PriceOracle.sol` (L1–L33): `updatePrice`, `getPrice`, `transferOwnership`

## Walkthrough by user action

### 1) Server starts and routes are mounted

- Backend server boot and route registration: `src/index.ts`
  - **Console -> SSE hook**: `hookConsole()` (L23–L25); SSE route at `app.get("/api/logs/stream", ...)` (L44–L46)
  - **CORS + health**: `app.use(cors())` (L28–L30), `app.get("/", ...)` (L31–L33)
  - **Route mounts**: `app.route(...)` for all API endpoints (L34–L43)
  - **Server listen**: `serve({ fetch: app.fetch, port })` (L47–L53)

What to show: name each endpoint as you point at the `app.route` lines; students see where to add or change routes.

### 2) On load: fetch market price (OKX + Coinbase)

- Frontend orchestrator: `frontend/src/App.jsx`
  - **Market price fetcher**: `getMarketPrice()` (L44–L52)
  - **Auto-refresh loop**: `useEffect` countdown + refresh (L221–L233)

- Backend endpoint: `src/routes/price.ts`
  - **GET /api/price handler**: `app.get('/')` (L6–L25)
  - Calls price utils: `getEthereumPriceUSD()` (L8–L11, L15–L21)

- Price utils: `src/utils/fetch-eth-price.ts`
  - **OKX**: `getETHPriceFromOKX()` (L1–L18)
  - **Coinbase**: `getETHPriceFromCoinbase()` (L21–L38)
  - **Average + scaling**: `getEthereumPriceUSD()` (L40–L67)

What to say: “The UI calls `/api/price`, which averages OKX and Coinbase. Here are the specific functions and where they live.”

### 3) On load: derive addresses and balances per network

- Frontend orchestration: `frontend/src/App.jsx`
  - **Fetch agent account**: `getAgentAccount()` (L98–L104)
  - **Fetch EVM/IoTeX accounts**: `getNetworkAccounts()` (L135–L145)

- Backend endpoints:
  - Ethereum: `src/routes/ethAccount.ts` → `app.get('/')` derives address, reads balance (L6–L24)
  - IoTeX: `src/routes/iotexAccount.ts` → `app.get('/')` derives address, reads balance (L6–L38)
  - Solana: `src/routes/solanaAccount.ts` → `app.get('/')` derives address, reads balance (L6–L31)

### 4) Click “Sign on Ethereum”

- Frontend action: `frontend/src/App.jsx`
  - **Button handler**: `signOnChain('ethereum')` (L171–L213)
  - Calls backend: `GET /api/transaction`

- Backend flow: `src/routes/transaction.ts`
  - **GET / handler**: `app.get('/')` fetches price, prepares tx, requests MPC sig, finalizes, broadcasts (L18–L75)
  - **Tx builder**: `getPricePayload(ethPrice, contractId)` (L77–L103)
    - Derive address: `Evm.deriveAddressAndPublicKey(...)` (L79–L82)
    - Next nonce: `getNextEthereumNonce(senderAddress)` from `src/utils/ethereumNonceManager.ts` (L12–L53)
    - Encode calldata: `contract.interface.encodeFunctionData('updatePrice', ...)` (L90–L93)
    - Prepare for signing: `Evm.prepareTransactionForSigning({...})` (L94–L101)
  - **MPC signature**: `requestSignature({ path: 'ethereum-1', payload })` from `src/utils/nonceManager.ts` (L29–L105)
  - **Finalize + broadcast**: `Evm.finalizeTransactionSigning(...)` and `Evm.broadcastTx(...)` (L56–L64)

- EVM adapter and config: `src/utils/ethereum.ts`
  - **RPC + contract address**: (L4–L6)
  - **ABI**: (L7–L34)
  - **Adapter instance**: `Evm` (L47–L51)

What to say: “This is the exact chain of calls from button click to on-chain transaction for Sepolia.”

### 5) Click “Sign on IoTeX”

- Frontend action: `frontend/src/App.jsx`
  - **Button handler**: `signOnChain('iotex')` (same function, L171–L213)
  - Calls backend: `GET /api/iotex-transaction` (optionally with `?debug=1`)

- Backend flow: `src/routes/iotexTransaction.ts`
  - **GET / handler**: fetch price, prepare legacy tx with fixed gas, MPC sign, serialize with ethers, broadcast via viem (L19–L161)
  - **Debug path**: structured tx shape without signing (L56–L78)
  - **Tx builder**: `getIoTeXPricePayload(...)` (L164–L186)
    - Derive address: `Evm.deriveAddressAndPublicKey(..., getIoTeXPath('testnet'))` (L166–L169)
    - Encode calldata: `ethers.Interface(iotexContractAbi).encodeFunctionData('updatePrice', ...)` (L171–L176)
    - Prepare for signing via IoTeX adapter: `IoTeX.prepareTransactionForSigning({...})` (L177–L184)
  - **Signature conversion**: `toRSV(signRes)` → ethers signature fields (L100–L106)
  - **Ethers Transaction.from + .serialized**: legacy type-0 (L107–L124)
  - **Broadcast**: `viem` `sendRawTransaction` (L126–L146)

- IoTeX adapter: `src/utils/iotex.ts`
  - **RPCs + addresses**: (L4–L11)
  - **ABI**: (L12–L39)
  - **Custom adapter**: `IoTeXAdapter.prepareTransactionForSigning` (fixed gas + unsigned hash) (L74–L115)
  - **Adapter instances + helpers**: `IoTeX`, `IoTeXMainnet`, `getIoTeXPath/getIoTeXAdapter` (L127–L163)

What to say: “IoTeX uses an EVM-compatible legacy type-0 tx with fixed gas, signed via MPC, then serialized and broadcast directly.”

### 6) Optional: Solana transaction path

- Endpoint: `src/routes/solanaTransaction.ts`
  - **GET / handler**: derive fee payer, fetch price, build instruction with LE u64, request ed25519 sig, attach, broadcast (L32–L111)

- Solana utils: `src/utils/solana.ts`
  - **Adapters + MPC path**: (L7–L32)

What to say: “Same pattern: derive, build instruction, MPC-sign message bytes, attach sig, broadcast.”

### 7) Nonce control demo (teacher toggle)

- Frontend controls: `frontend/src/App.jsx`
  - **Fetch status**: `fetchNonceStatus()` (L106–L112)
  - **Toggle**: `toggleNonceIncrement()` (L114–L127)
  - **Bulk UI toggle**: checkbox within bulk action (L403–L409)

- Backend endpoints: `src/routes/nonceControl.ts`
  - **Status**: `GET /status` (L11–L19)
  - **Toggle**: `POST /toggle` (L21–L34)
  - **Reset**: `POST /reset` (L36–L44)

- MPC nonce manager: `src/utils/nonceManager.ts`
  - **Feature toggle**: `setNonceIncrementEnabled`, `isNonceIncrementEnabled` (L11–L21)
  - **Core**: `requestSignature(...)` with auto-increment and lock (L29–L105)
  - **Reset**: `resetNonceTracking()` (L107–L112)

What to say: “Disable auto-increment to demonstrate NEAR’s replay protection; the second concurrent tx shows a nonce error. Re-enable for smooth parallel multi-chain.”

### 8) Live logs (“Stats for nerds”)

- Backend SSE logs: `src/utils/logStream.ts`
  - **SSE writer**: `attachSSE(c)` (L34–L56)
  - **Console hook**: `hookConsole()` (L68–L90)
  - **Publish helper**: `publish(level, msg)` (L20–L27)
  - **Mounted at**: `src/index.ts` SSE route (L44–L46)

- Frontend subscriber: `frontend/src/App.jsx`
  - **EventSource setup**: `useEffect` that subscribes to `/api/logs/stream` (L235–L247)

What to say: “All console logs stream to the UI. Filter noisy price logs with the checkbox in the panel.”

### 9) Oracle contract + addresses

- On-chain contract: `contracts/PriceOracle.sol`
  - **Functions**: `updatePrice` (L19–L22), `getPrice` (L24–L26), `transferOwnership` (L28–L31)

- Backend EVM config: `src/utils/ethereum.ts`
  - **RPC + address + ABI**: (L4–L34)

- Backend IoTeX config: `src/utils/iotex.ts`
  - **RPC + address + ABI**: (L4–L39)

- Frontend network config: `frontend/src/networks.js`
  - **Sepolia + IoTeX addresses & endpoints**: (L1–L34)

What to say: “Keep addresses aligned across backend and frontend configs.”

### 10) Reading on-chain state and last update info (UI)

- Frontend helpers: `frontend/src/ethereum.js`
  - **Get price**: `getContractPrice(networkId)` (L49–L58)
  - **All prices**: `getAllContractPrices()` (L60–L71)
  - **Last update event**: `getLastUpdateInfo(networkId)` (L73–L104)
  - **Receipt -> timestamp**: `getTimestampFromTxHash(networkId, txHash)` (L106–L116)

- Frontend state: `frontend/src/App.jsx`
  - **Refresh on-chain**: `refreshOnchain()` (L54–L78)
  - **Primary “contract price” resolver**: `getPrice()` (L80–L96)

What to say: “UI shows contract state by reading directly via JSON-RPC and event logs.”

## Live demo script (quick)

1) Open the app. Show market price auto-refresh: `frontend/src/App.jsx` (L221–L233), backend `src/routes/price.ts` (L6–L25), utils (L1–L67 in `src/utils/fetch-eth-price.ts`).
2) Show derived addresses and balances: backend `ethAccount` (L6–L24), `iotexAccount` (L6–L38); front `getNetworkAccounts()` (L135–L145).
3) Click “Sign on Ethereum”: front handler (L171–L213 in `App.jsx`), backend `transaction.ts` flow (L18–L75) + builder (L77–L103), nonce manager (L12–L53 in `ethereumNonceManager.ts`), MPC signature (L29–L105 in `nonceManager.ts`).
4) Click “Sign on IoTeX”: front handler (same), backend `iotexTransaction.ts` (L19–L161) + builder (L164–L186), adapter (L74–L115 in `iotex.ts`).
5) Toggle nonce increment: front toggle (L114–L127), backend status/toggle/reset (L11–L44 in `nonceControl.ts`), explain replay protection.
6) Show live logs: SSE route `src/index.ts` (L44–L46), source `src/utils/logStream.ts` (L34–L90), UI subscriber (L235–L247 in `App.jsx`).

## Tips for teaching

- Start with the high-level dataflow and endpoints in `src/index.ts`, then drill into a single flow (Ethereum), then contrast with IoTeX.
- Emphasize the separation of concerns: routes orchestrate, utils implement chain specifics, UI orchestrates calls and displays state.
- Keep an eye on the SSE “stats for nerds” to narrate what’s happening live during each step.


