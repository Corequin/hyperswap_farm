import { ethers } from "ethers";
import {
  buyTokens,
  sellTokens,
  connectProvider,
  getTokenBalance,
  getBlockGasLimit,
} from "./hyperswap.ts";

// 0x99afaabfd5df27b1ea3be2d53f82eb7ab4bab65a3b6fba7101b86bda7105e0b0
const WETH = "0x5555555555555555555555555555555555555555";
const TOKEN = "0xdd493377C2AC801639439Dcc1C3c95474Aec6A40";
// const TOKEN = "0xBc950cE54928b5905b67245075875A534e58c5De";

const { provider, wallet } = await connectProvider();
console.log(`Connected with address: ${wallet.address}`);

async function performSwap() {
  try {
    const gasLimit = await getBlockGasLimit(provider);
    console.log(`Block gas limit: ${gasLimit}`);

    const wethBalance = await getTokenBalance(WETH, wallet);

    // ------------------
    // Ici tu peux changer "false" en "true" pour acheter et vendre
    // Si tu le mets en true, le bot ne fera que vendre les tokens
    const onlySell = false;
    // ------------------

    if (!onlySell) {
      const amountIn = ethers.parseEther("100");

      console.log("Achat de tokens...");
      await buyTokens(
        WETH,
        TOKEN,
        amountIn > wethBalance ? wethBalance : amountIn,
        0n,
        wallet,
      );

      console.log("Attente pour synchronisation...");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const newTokenBalance = await getTokenBalance(TOKEN, wallet);

    if (newTokenBalance > 0n) {
      const sellAmount = newTokenBalance / 2n;

      console.log("Vente de tokens...");

      await sellTokens(TOKEN, WETH, sellAmount, 0n, wallet);
    } else {
      console.log("Pas de tokens à vendre.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function main() {
  console.log("Démarrage du bot de swap en boucle");

  while (true) {
    console.log("\n--- Nouvelle session de swap ---");
    await performSwap();
  }
}

await main();
