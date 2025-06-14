import WebSocket from "ws";
import {
  AuthRequest,
  Allowance,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseRPCResponse,
  RPCMethod,
  MessageSigner,
} from "@erc7824/nitrolite";
import { ethers } from "ethers";
import { Address } from "viem";
import * as dotenv from "dotenv";
import { getTransferSessionTx } from "./examples/getTransferSession";

dotenv.config();

async function main(): Promise<void> {
  /* -------- wallet -------- */
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY isn't set up");

  const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const sender = wallet.address as Address;

  /* -------- signer for auth_verify -------- */
  const messageSigner: MessageSigner = (async (payload) => {
    const digest = ethers.id(JSON.stringify(payload));
    return wallet.signMessage(ethers.getBytes(digest));
  }) as MessageSigner;

  /* -------- pre-signed transfer session -------- */
  const signedSession = await getTransferSessionTx();

  /* -------- auth_request payload -------- */
  const authRequest: AuthRequest = {
    wallet: sender,
    participant: sender,
    app_name: "NitroLite Demo",
    scope: "console",
    allowances: [] as Allowance[],
  };

  /* -------- connect to ClearNode -------- */
  const ws = new WebSocket("wss://clearnode.example.com");

  ws.onopen = async () => {
    const authReqMsg = await createAuthRequestMessage(authRequest);
    ws.send(authReqMsg);
  };

  ws.onmessage = async (event) => {
    /* WebSocket.Data  =>  string for parseRPCResponse */
    const raw =
      typeof event.data === "string"
        ? event.data
        : Buffer.isBuffer(event.data)
        ? event.data.toString()
        : Buffer.from(event.data as ArrayBuffer).toString();

    const msg = parseRPCResponse(raw);

    /* --- handle auth_challenge --- */
    if (msg.method === RPCMethod.AuthChallenge) {
      const authVerifyMsg = await createAuthVerifyMessage(
        messageSigner,
        msg // only two arguments
      );
      ws.send(authVerifyMsg);
      return;
    }

    /* --- on success, send the session --- */
    if (msg.method === RPCMethod.AuthVerify && msg.params.success) {
      console.log("✅ Authenticated – sending session");
      ws.send(signedSession);
    }
  };

  ws.onerror = (err) => console.error("WebSocket error:", err);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
