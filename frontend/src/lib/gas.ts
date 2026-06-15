import type { PublicClient } from 'viem';

/** 1.2x gas multiplier for Celo Sepolia (much cheaper/stable than Arb Sepolia) */
export async function getGasOverrides(publicClient: PublicClient) {
  try {
    const gasPrice = await publicClient.getGasPrice();
    return { gasPrice: (gasPrice * 12n) / 10n };
  } catch {
    return {};
  }
}
