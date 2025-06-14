import WebSocket from "ws"; // Node.js
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  parseRPCResponse,
  RPCMethod,
} from "@erc7824/nitrolite";
import { ethers } from "ethers";
type Address = `0x${string}`;

// Create and send auth_request

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY isn't set up");

  const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const sender: Address = wallet.address as Address;

  const authRequestMsg = await createAuthRequestMessage({
    wallet: sender,
    participant: sender, // session key must be here
    app_name: "Any string",
    expire: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
    scope: "Any string",
    application: sender,
    allowances: [],
  });

  // After WebSocket connection is established
  ws.onopen = async () => {
    console.log("WebSocket connection established");

    ws.send(authRequestMsg);
  };

  // Handle incoming messages
  ws.onmessage = async (event) => {
    try {
      const message = parseRPCResponse(event.data);

      // Handle auth_challenge response
      switch (message.method) {
        case RPCMethod.AuthChallenge:
          console.log("Received auth challenge");

          // Create EIP-712 message signer function
          const eip712MessageSigner = createEIP712AuthMessageSigner(
            wallet, // Your wallet client instance
            {
              // EIP-712 message structure, data should match auth_request
              scope: authRequestMsg.scope,
              application: authRequestMsg.application,
              participant: authRequestMsg.participant,
              expire: authRequestMsg.expire,
              allowances: authRequestMsg.allowances,
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
