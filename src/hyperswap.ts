import type { Wallet } from "ethers";
import type { Provider } from "ethers";
import { ethers } from "ethers";

const ROUTER = "0x4e2960a8cd19b467b82d26d83facb0fae26b094d";
const HYPERSWAP_V3 = "0x0363d9c2d8cea377003984736b47c67685cde42a";

// Interface simplifiée pour les swaps
const routerABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

// Interface ERC20
const erc20ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

// Connexion à la blockchain
async function connectProvider() {
  const provider = new ethers.JsonRpcProvider(
    "https://rpc.hyperliquid.xyz/evm",
  );
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY ?? "", provider);
  return { provider, wallet };
}

// Obtenir la limite de gaz du bloc actuel
async function getBlockGasLimit(provider: Provider) {
  try {
    const block = await provider.getBlock("latest");

    if (!block) {
      throw new Error("Block not found");
    }

    if (block.gasLimit) {
      return BigInt(Number(block.gasLimit) * 0.4);
    }
  } catch (error) {
    console.warn("Erreur lors de la récupération de la limite de gaz:", error);
  }
  return 800000n;
}

// Vérification et approbation des tokens
async function checkAndApproveToken(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  wallet: Wallet,
) {
  const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, wallet);

  try {
    // Vérifier l'allowance actuelle
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      spenderAddress,
    );

    if (currentAllowance >= amount) {
      console.log(`Allowance déjà suffisante: ${currentAllowance}`);
      return null;
    }

    // Obtenir la limite de gaz
    const { provider } = await connectProvider();
    const gasLimit = await getBlockGasLimit(provider);
    const safeGasLimit = gasLimit < 300000n ? gasLimit : 300000n;

    console.log(
      `Approving ${amount} of token ${tokenAddress} for router with gas limit ${safeGasLimit}`,
    );

    const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256, {
      gasLimit: safeGasLimit,
    });

    await tx.wait();
    console.log(`Approval successful: ${tx.hash}`);
    return tx;
  } catch (error) {
    console.error("Erreur d'approbation:", error);
    throw error;
  }
}

// Achat/Vente de tokens (exactInputSingle) - fonction générique pour les deux
async function swapExactInput(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  amountOutMinimum: bigint,
  wallet: Wallet,
) {
  try {
    const router = new ethers.Contract(ROUTER, routerABI, wallet);
    const { provider } = await connectProvider();

    // Obtenir une limite de gaz appropriée
    const gasLimit = await getBlockGasLimit(provider);

    // Vérifier et approuver le router à dépenser les tokens
    await checkAndApproveToken(tokenIn, ROUTER, amountIn, wallet);

    console.log(`Swapping tokens: ${amountIn} of ${tokenIn} -> ${tokenOut}`);

    const params = {
      tokenIn,
      tokenOut,
      // fee: 10000, // 1% pour Hyperliquid
      fee: 100, // 0.01% pour Hyperliquid
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };

    // Vérifier le solde
    const tokenContract = new ethers.Contract(tokenIn, erc20ABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);

    if (balance < amountIn) {
      throw new Error(`Solde insuffisant: ${balance} < ${amountIn}`);
    }

    console.log(`Envoi de la transaction avec gasLimit: ${gasLimit}`);

    const tx = await router.exactInputSingle(params, {
      gasLimit: gasLimit,
    });

    const receipt = await tx.wait();
    console.log(`Swap successful: ${tx.hash}`);
    return receipt;
  } catch (error) {
    console.error("Erreur de swap:", error);
    throw error;
  }
}

// Fonction pour obtenir le token balance
async function getTokenBalance(
  tokenAddress: string,
  wallet: Wallet,
): Promise<bigint> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);
    let decimals = 18;

    try {
      decimals = await tokenContract.decimals();
    } catch (error) {
      console.log(
        "Impossible d'obtenir les décimales, utilisation de 18 par défaut",
      );
    }

    console.log(
      `Balance of ${tokenAddress}: ${ethers.formatUnits(balance, decimals)} (${balance})`,
    );
    return balance;
  } catch (error) {
    console.error(
      `Erreur lors de la vérification du solde de ${tokenAddress}:`,
      error,
    );
    return 0n;
  }
}

export {
  swapExactInput as buyTokens,
  swapExactInput as sellTokens,
  checkAndApproveToken,
  connectProvider,
  getTokenBalance,
  getBlockGasLimit,
};
