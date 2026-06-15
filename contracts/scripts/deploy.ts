import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");

  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x01C5C0122039549AD1493B8220cABEdD739BC44E"; // testnet USDC
  const TREASURY = process.env.TREASURY_ADDRESS || deployer.address;

  // 1. Deploy Deck (needs game address — set after game deploy)
  const Deck = await ethers.getContractFactory("LiarsBarDeck");
  const deck = await Deck.deploy(ethers.ZeroAddress);
  await deck.waitForDeployment();
  console.log("LiarsBarDeck:", await deck.getAddress());

  // 2. Deploy Revolver (same pattern)
  const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
  const revolver = await Revolver.deploy(ethers.ZeroAddress);
  await revolver.waitForDeployment();
  console.log("LiarsBarRevolver:", await revolver.getAddress());

  // 3. Deploy Game
  const Game = await ethers.getContractFactory("LiarsBarGame");
  const game = await Game.deploy(
    await deck.getAddress(),
    await revolver.getAddress(),
    USDC_ADDRESS,
    TREASURY
  );
  await game.waitForDeployment();
  console.log("LiarsBarGame:", await game.getAddress());

  // 4. Wire game address into Deck and Revolver
  await (await deck.setGameContract(await game.getAddress())).wait();
  await (await revolver.setGameContract(await game.getAddress())).wait();
  console.log("Contracts wired.");

  // 5. Save deployment addresses
  const deployment = {
    network: "celo-sepolia",
    chainId: 11142220,
    deployer: deployer.address,
    contracts: {
      LiarsBarDeck: await deck.getAddress(),
      LiarsBarRevolver: await revolver.getAddress(),
      LiarsBarGame: await game.getAddress(),
    },
    usdc: USDC_ADDRESS,
    treasury: TREASURY,
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "celo-sepolia.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("Deployment saved to deployments/celo-sepolia.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
