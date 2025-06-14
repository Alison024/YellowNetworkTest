import { ethers } from "ethers";
import {
  createAppSessionMessage,
  MessageSigner,
  CreateAppSessionRequest,
} from "@erc7824/nitrolite";
import { Address } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

export async function getTransferSessionTx(): Promise<string> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY isn't set up");

  const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const sender: Address = wallet.address as Address;
  const recipient: Address = "" as Address;
  const usdc: Address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address;
  const amount = "1000000"; // 1 USDC (6 dec)

  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const calldata = iface.encodeFunctionData("transfer", [recipient, amount]);

  const signer: MessageSigner = (async (payload) => {
    const digest = ethers.id(JSON.stringify(payload));
    return wallet.signMessage(ethers.getBytes(digest));
  }) as MessageSigner;

  const params: CreateAppSessionRequest[] = [
    {
      definition: {
        protocol: "nitroliterpc",
        participants: [sender, "server"],
        weights: [50, 50],
        quorum: 100,
        challenge: 0,
        allocate_amount: 12,
        nonce: Date.now(),
      },
      allocations: [
        {
          participant: sender,
          asset: "usdc",
          amount: "1.0",
        },
      ],
    },
  ];

  const signedSession = await createAppSessionMessage(signer, params);
  //   console.log("Signed session:", signedSession);
  return signedSession;
}
