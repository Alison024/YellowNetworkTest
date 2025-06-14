import {
  MessageSigner,
  RequestData,
  ResponsePayload,
} from "@erc7824/nitrolite";
import { ethers } from "ethers";
import { Hex } from "viem";
import * as dotenv from "dotenv";
dotenv.config();

const messageSigner = async (
  payload: RequestData | ResponsePayload
): Promise<Hex> => {
  try {
    const wallet = new ethers.Wallet("0xYourPrivateKey");
    const messageBytes = ethers.utils.arrayify(
      ethers.utils.id(JSON.stringify(payload))
    );
    const flatSignature = await wallet._signingKey().signDigest(messageBytes);
    const signature = ethers.utils.joinSignature(flatSignature);
    return signature as Hex;
  } catch (error) {
    console.error("Error signing message:", error);
    throw error;
  }
};
