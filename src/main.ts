import WebSocket from "ws";
import {
  AuthRequest,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseRPCResponse,
  RPCMethod,
  createEIP712AuthMessageSigner,
} from "@erc7824/nitrolite";

import { createWalletClient, http, Address, WalletClient } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import * as dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

async function main(): Promise<void> {
  /* ──────── keys & accounts ──────── */
  const SENDER_PK = process.env.PRIVATE_KEY_1 as `0x${string}`;
  const RECEIVER_PK = process.env.PRIVATE_KEY_2 as `0x${string}`;

  if (!SENDER_PK) throw new Error("PRIVATE_KEY_1 env variable isn't set up");
  if (!RECEIVER_PK) throw new Error("PRIVATE_KEY_2 env variable isn't set up");
  // viem converts a raw private key into an Account object
  const senderAccount = privateKeyToAccount(SENDER_PK);
  const receiverAccount = privateKeyToAccount(RECEIVER_PK);

  /* ──────── wallet client (Polygon mainnet) ──────── */
  const senderClient: WalletClient = createWalletClient({
    account: senderAccount, // the account that will sign
    chain: polygon, // viem chain descriptor
    transport: http("https://polygon-rpc.com"),
  });

  /* ──────── addresses ──────── */
  const senderAddress: Address = senderAccount.address;
  const receiverAddress: Address = receiverAccount.address;

  /* ──────── WebSocket to ClearNode ──────── */
  const clearNodeUrl = "wss://clearnet.yellow.com/ws";
  const ws = new WebSocket(clearNodeUrl);

  /* ──────── session key & auth_request ──────── */
  const randSessionKey: Address = ("0x" +
    randomBytes(20).toString("hex")) as Address;

  const authRequest: AuthRequest = {
    wallet: senderAddress,
    participant: randSessionKey,
    app_name: "Any string",
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
            { name: authRequest.app_name }
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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
