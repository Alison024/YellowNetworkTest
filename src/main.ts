import WebSocket from "ws";
import {
  AuthRequest,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseRPCResponse,
  RPCMethod,
  createEIP712AuthMessageSigner,
  createAppSessionMessage,
  MessageSigner,
} from "@erc7824/nitrolite";

import {
  createWalletClient,
  http,
  Address,
  WalletClient,
  keccak256,
  toBytes,
  PrivateKeyAccount,
} from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "crypto";

import * as dotenv from "dotenv";
import { ethers, Wallet } from "ethers";

dotenv.config();

let senderAccount: PrivateKeyAccount;
let receiverAccount: PrivateKeyAccount;
let participant: Wallet;

/* ──────── wallet client (Polygon mainnet) ──────── */
let senderClient: WalletClient;

/* ──────── addresses ──────── */
let senderAddress: Address;
let receiverAddress: Address;

/* ──────── WebSocket to ClearNode ──────── */
let clearNodeUrl: string;
let ws: WebSocket;

const APP_NAME = "Sentia";

async function main(): Promise<void> {
  /* ──────── keys & accounts ──────── */
  const SENDER_PK = process.env.PRIVATE_KEY_1 as `0x${string}`;
  const RECEIVER_PK = process.env.PRIVATE_KEY_2 as `0x${string}`;

  if (!SENDER_PK) throw new Error("PRIVATE_KEY_1 env variable isn't set up");
  if (!RECEIVER_PK) throw new Error("PRIVATE_KEY_2 env variable isn't set up");
  // viem converts a raw private key into an Account object
  senderAccount = privateKeyToAccount(SENDER_PK);
  receiverAccount = privateKeyToAccount(RECEIVER_PK);
  participant = ethers.Wallet.createRandom();

  /* ──────── wallet client (Polygon mainnet) ──────── */
  senderClient = createWalletClient({
    account: senderAccount, // the account that will sign
    chain: polygon, // viem chain descriptor
    transport: http("https://polygon-rpc.com"),
  });

  /* ──────── addresses ──────── */
  senderAddress = senderAccount.address;
  receiverAddress = receiverAccount.address;

  /* ──────── WebSocket to ClearNode ──────── */
  clearNodeUrl = "wss://clearnet.yellow.com/ws";
  ws = new WebSocket(clearNodeUrl);

  const authRequest: AuthRequest = {
    wallet: senderAddress,
    participant: participant.address as Address,
    app_name: APP_NAME,
    expire: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 h
    scope: "Any string",
    application: "0x0000000000000000000000000000000000000000", // example
    allowances: [],
  };

  // raw JSON-RPC message to start auth flow
  const authRequestMsg = await createAuthRequestMessage(authRequest);

  /* ──────── websocket event handlers ──────── */
  ws.onopen = () => {
    console.log("WebSocket connection established");
    ws.send(authRequestMsg);
  };

  ws.onmessage = async (event) => {
    try {
      const message = parseRPCResponse(event.data.toString());
      console.log(JSON.stringify(message, null, 2));

      switch (message.method) {
        /* ── step 1: challenge arrives ── */
        case RPCMethod.AuthChallenge: {
          console.log("Received auth challenge");
          // build EIP-712 signer backed by viem’s walletClient
          const eip712MessageSigner = createEIP712AuthMessageSigner(
            senderClient,
            {
              scope: authRequest.scope!, //  ⬅️  “I promise this is defined”
              application: authRequest.application!,
              participant: authRequest.participant!,
              expire: authRequest.expire!,
              allowances: [],
            },
            { name: APP_NAME }
          );
          // craft auth_verify
          const authVerifyMsg = await createAuthVerifyMessage(
            eip712MessageSigner,
            message // the challenge payload
          );
          ws.send(authVerifyMsg);
          break;
        }

        /* ── step 2: server responds to verify ── */
        case RPCMethod.AuthVerify: {
          if (!message.params.success) {
            console.error("Authentication failed");
            return;
          }
          console.log("Authentication successful");
          // Store the JWT however you prefer (e.g. fs or DB); Node.js has no window
          console.log("JWT:", message.params.jwtToken);
          break;
        }

        /* ── generic error ── */
        case RPCMethod.Error: {
          console.error("RPC error:");
          break;
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  };
}

async function executeTransfer() {
  const appDefinition = {
    protocol: "nitroliterpc",
    participants: [senderAddress, receiverAddress],
    weights: [50, 50],
    quorum: 100,
    challenge: 0,
    nonce: Date.now(),
  };
  const allocations = [
    {
      participant: senderAccount,
      asset: "usdc",
      amount: "0.01",
    },
    {
      participant: receiverAddress,
      asset: "usdc",
      amount: "0",
    },
  ];

  // const signedMessage = await createAppSessionMessage(messageSigner, [
  //   {
  //     definition: appDefinition,
  //     allocations,
  //   },
  // ]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
