import { ethers } from "ethers";
import {
  createAppSessionMessage,
  MessageSigner,
  CreateAppSessionMessageParams,
} from "@erc7824/nitrolite";

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const RECIPIENT = "0x9706C03AaA84C046df0a6081994533b8F20F9975";
const AMOUNT = "1000000"; // 1 USDC with 6 decimals
const POLYGON_CHAIN_ID = 137;

// Initialize ethers provider and signer (e.g., MetaMask)
const provider = new ethers.providers.Web3Provider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = provider.getSigner();
const senderAddress = await signer.getAddress();

// Step 1: Encode ERC20 transfer data
const iface = new ethers.utils.Interface([
  "function transfer(address to, uint256 amount)",
]);
const transferCalldata = iface.encodeFunctionData("transfer", [
  RECIPIENT,
  AMOUNT,
]);

// Step 2: Prepare NitroLite MessageSigner
const messageSigner: MessageSigner = async (payload) => {
  const message = JSON.stringify(payload);
  const digest = ethers.utils.id(message);
  const signature = await signer.signMessage(ethers.utils.arrayify(digest));
  return signature;
};

// Step 3: Create Application Session Message
const messageParams: CreateAppSessionMessageParams[] = [
  {
    definition: {
      protocol: "nitroliterpc",
      participants: [senderAddress],
      weights: [100],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
    },
    allocations: [
      {
        participant: senderAddress,
        asset: "usdc", // must match how asset is labeled in the ClearNode config
        amount: "1.0",
      },
    ],
    instructions: [
      {
        chain_id: POLYGON_CHAIN_ID,
        to: USDC_ADDRESS,
        data: transferCalldata,
        value: "0",
      },
    ],
  },
];

const signedMessage = await createAppSessionMessage(
  messageSigner,
  messageParams
);
console.log("Signed App Session Message:", signedMessage);

// You would send `signedMessage` to the ClearNode or on-chain forwarder for execution
