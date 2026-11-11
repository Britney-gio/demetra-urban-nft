// Creo questo controllo di sola lettura prima del deploy: verifica che l'RPC punti a Sepolia (chain ID 11155111) e mostra l'indirizzo e il saldo del wallet configurato. Non invia transazioni né spende gas.

import { network } from "hardhat";

const { ethers } = await network.create();

const connectedNetwork = await ethers.provider.getNetwork();
const [deployer] = await ethers.getSigners();

const balance = await ethers.provider.getBalance(deployer.address);

console.log("Chain ID:", connectedNetwork.chainId.toString());
console.log("Wallet:", deployer.address);
console.log("Saldo:", ethers.formatEther(balance), "ETH");