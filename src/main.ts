import WebSocket from "ws";
import {
  AuthRequest,
  Allowance,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseRPCResponse,
  RPCMethod,
  MessageSigner,
  createEIP712AuthMessageSigner,
} from "@erc7824/nitrolite";
import { ethers } from "ethers";
import { Address, WalletClient } from "viem";
import * as dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

async function main(): Promise<void> {
  const SENDER_PK = process.env.PRIVATE_KEY_1;
  const RECEIVER_PK = process.env.PRIVATE_KEY_2;
  if (!SENDER_PK) throw new Error("PRIVATE_KEY_1 env variable isn't set up");
  if (!RECEIVER_PK) throw new Error("PRIVATE_KEY_2 env variable isn't set up");

  const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
  const clearNodeUrl = "wss://clearnet.yellow.com/ws"; //"wss://clearnode.example.com"; //"wss://clearnet.yellow.com/";
  const sender = new ethers.Wallet(SENDER_PK, provider);
  const receiver = new ethers.Wallet(RECEIVER_PK, provider);
  const senderAddress: Address = sender.address as Address;
  const receiverAddress: Address = receiver.address as Address;

  const ws = new WebSocket(clearNodeUrl);

  const randSessionKey: Address = ("0x" +
    randomBytes(32).toString("hex")) as Address; // must generates on front-end and keep in local storage

  const authRequest: AuthRequest = {
    wallet: senderAddress,
    participant: randSessionKey, // session key must be here
    app_name: "Any string",
    expire: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour expiration
    scope: "Any string",
    application: "Any string" as Address,
    allowances: [],
  };
  const authRequestMsg = await createAuthRequestMessage({
    wallet: senderAddress,
    participant: randSessionKey, // session key must be here
    app_name: "Any string",
    expire: "", // 1 hour expiration
    scope: "",
    application: "" as Address,
    allowances: [],
  });

  ws.onopen = async () => {
    console.log("WebSocket connection established");

    ws.send(authRequestMsg);
  };

  ws.onmessage = async (event) => {
    try {
      const message = parseRPCResponse(event.data.toString());
      console.log(JSON.stringify(message, null, 2));
      // Handle auth_challenge response
      switch (message.method) {
        case RPCMethod.AuthChallenge:
          console.log("Received auth challenge");

          // Create EIP-712 message signer function
          const eip712MessageSigner = createEIP712AuthMessageSigner(
            sender, // Your wallet client instance
            {
              // EIP-712 message structure, data should match auth_request
              scope: authRequest.scope,
              application: authRequest.application,
              participant: authRequest.participant,
              expire: authRequest.expire,
              allowances: authRequest.allowances,
            },
            {
              // Domain for EIP-712 signing
              name: "Your Domain",
            }
          );

          // Create and send auth_verify with signed challenge
          const authVerifyMsg = await createAuthVerifyMessage(
            eip712MessageSigner, // Our custom eip712 signer function
            message
          );

          ws.send(authVerifyMsg);
          break;
        // Handle auth_success or auth_failure
        case RPCMethod.AuthVerify:
          if (!message.params.success) {
            console.log("Authentication failed");
            return;
          }
          console.log("Authentication successful");
          // Now you can start using the channel

          window.localStorage.setItem("clearnode_jwt", message.params.jwtToken); // Store JWT token for future use
          break;
        case RPCMethod.Error: {
          console.error("Authentication failed:", message.params.error);
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
