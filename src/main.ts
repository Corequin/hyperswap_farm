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

// Error handling and recovery settings
let consecutiveErrors = 0;
let sellOnlyIterationsRemaining = 0;
let isInSellOnlyMode = false;
const MAX_CONSECUTIVE_ERRORS = 3;
const SELL_ONLY_ITERATIONS = 12;

// Reset the error counter when a transaction succeeds
function resetErrorCounter() {
  if (consecutiveErrors > 0) {
    console.log(`Resetting error counter from ${consecutiveErrors} to 0`);
    consecutiveErrors = 0;
  }
}

// Check if the error is a transaction revert error
function isTransactionRevertError(error: any): boolean {
  return (
    error?.code === "CALL_EXCEPTION" && 
    error?.shortMessage?.includes("transaction execution reverted")
  );
}

async function performSwap() {
  try {
    const gasLimit = await getBlockGasLimit(provider);
    console.log(`Block gas limit: ${gasLimit}`);

    const wethBalance = await getTokenBalance(WETH, wallet);
    
    // Determine if we're in sell-only mode
    if (sellOnlyIterationsRemaining > 0) {
      isInSellOnlyMode = true;
      console.log(`In SELL-ONLY mode: ${sellOnlyIterationsRemaining} iterations remaining`);
    } else {
      isInSellOnlyMode = false;
    }

    // Buy tokens if not in sell-only mode
    if (!isInSellOnlyMode) {
      const amountIn = ethers.parseEther("50");

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
      
      // If we get here without an error, reset the error counter
      resetErrorCounter();
    }

    // Sell tokens
    const newTokenBalance = await getTokenBalance(TOKEN, wallet);

    if (newTokenBalance > 0n) {
      // In normal mode, sell half of balance; in sell-only mode, sell everything
      const sellAmount = isInSellOnlyMode ? newTokenBalance : newTokenBalance / 2n;

      console.log(`Vente de tokens... (${isInSellOnlyMode ? 'all' : 'half'})`);
      await sellTokens(TOKEN, WETH, sellAmount, 0n, wallet);
      
      // If we get here without an error, reset the error counter
      resetErrorCounter();
    } else {
      console.log("Pas de tokens à vendre.");
      
      // FIX: If there are no tokens to sell and we're in sell-only mode, still decrement the counter
      if (isInSellOnlyMode && sellOnlyIterationsRemaining > 0) {
        console.log("Skipping sell iteration since there are no tokens to sell");
        sellOnlyIterationsRemaining--;
        console.log(`Sell-only iterations remaining: ${sellOnlyIterationsRemaining}`);
      }
    }
    
    // Only decrement the counter if we've actually sold something
    if (isInSellOnlyMode && sellOnlyIterationsRemaining > 0 && newTokenBalance > 0n) {
      sellOnlyIterationsRemaining--;
      console.log(`Sell-only iterations remaining: ${sellOnlyIterationsRemaining}`);
    }
    
    return true;
  } catch (error: any) {
    if (isTransactionRevertError(error)) {
      consecutiveErrors++;
      console.error(`Transaction revert error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`);
      console.error(error.shortMessage || "Unknown transaction error");
      
      // Check if we need to switch to sell-only mode
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !isInSellOnlyMode) {
        console.log(`\n!!! DETECTED ${MAX_CONSECUTIVE_ERRORS} CONSECUTIVE ERRORS !!!`);
        console.log(`Switching to SELL-ONLY mode for ${SELL_ONLY_ITERATIONS} iterations`);
        sellOnlyIterationsRemaining = SELL_ONLY_ITERATIONS;
        isInSellOnlyMode = true;
        consecutiveErrors = 0; // Reset counter after taking action
      }
    } else {
      console.error("Error:", error);
    }
    return false;
  }
}

async function main() {
  console.log("Démarrage du bot de swap en boucle avec auto-recovery");
  console.log(`Configuration: ${MAX_CONSECUTIVE_ERRORS} erreurs consécutives → ${SELL_ONLY_ITERATIONS} itérations de vente`);

  while (true) {
    console.log(`\n--- Nouvelle session de swap ${isInSellOnlyMode ? '(SELL-ONLY MODE)' : ''} ---`);
    await performSwap();
    
    // Add a small delay between iterations to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

await main();