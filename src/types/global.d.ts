
import { PublicKey } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: PublicKey }>;
      disconnect: () => Promise<void>;
      publicKey: PublicKey;
      on: (event: string, callback: (args: any) => void) => void;
      signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
    };
  }
}

export {};
