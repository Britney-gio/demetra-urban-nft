// Creo script per il deploy del contratto DemetraUrban su Ethereum Sepolia

import { network } from "hardhat";

const { ethers } = await network.create();

const connectedNetwork = await ethers.provider.getNetwork();

if (connectedNetwork.chainId !== 11155111n) {
  throw new Error("Questo script deve essere eseguito su Ethereum Sepolia");
}

const [deployer] = await ethers.getSigners();

console.log("Wallet che esegue il deploy:", deployer.address);

const vrfCoordinator = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";

const subscriptionId =
  19924050860367950088095733789887519139501850933268318346816486419923909849571n;

const keyHash =
  "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

const requestConfirmations = 3;

const callbackGasLimit = 500_000;

const essentialURI =
  "ipfs://bafkreiehhulbhtwwrpofbzjujcu235iouyaoauznzqwpttge74qrsl6equ";

const goldURI =
  "ipfs://bafkreihzomj4vgvcljyob2mxpeedo6hg4a2jcniyxyxmm4djn7wt7u6qoq";

const superGoldURI =
  "ipfs://bafkreid5w6f5yuzz6ueuonrugslfr46ol7jg4cm5omzrw7i46jkbsfiwxm";

const demetra = await ethers.deployContract(
  "DemetraUrban",
  [
    vrfCoordinator,
    subscriptionId,
    keyHash,
    requestConfirmations,
    callbackGasLimit,
    essentialURI,
    goldURI,
    superGoldURI,
  ],
  deployer,
);

console.log("Transazione di deploy:", demetra.deploymentTransaction()?.hash);

await demetra.waitForDeployment();

console.log("Demetra Urban distribuito:", await demetra.getAddress());
