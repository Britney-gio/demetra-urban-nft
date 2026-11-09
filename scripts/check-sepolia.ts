import { network } from "hardhat";

const { ethers } = await network.create();

const connectedNetwork = await ethers.provider.getNetwork();
const [deployer] = await ethers.getSigners();

const balance = await ethers.provider.getBalance(deployer.address);

console.log("Chain ID:", connectedNetwork.chainId.toString());
console.log("Wallet:", deployer.address);
console.log("Saldo:", ethers.formatEther(balance), "ETH");