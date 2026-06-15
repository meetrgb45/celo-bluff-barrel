/** 
 * On Celo Sepolia, MetaMask gas estimation sometimes fails even when the call is valid.
 * Provide a safe explicit gas limit to bypass it.
 */
export async function getGasOverrides(_publicClient?: unknown) {
  return { gas: 500_000n };
}
