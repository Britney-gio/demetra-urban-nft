import { network } from "hardhat";

const { ethers } = await network.create();

const demetraAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const coordinatorAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const demetra = await ethers.getContractAt("DemetraUrban", demetraAddress);

const coordinator = await ethers.getContractAt(
  "VRFCoordinatorV2_5Mock",
  coordinatorAddress,
);

const [owner, essentialUser, goldUser, superGoldUser, recipient] =
  await ethers.getSigners();

// Trasferisco le tre varianti allo stesso destinatario.
const essentialTransferTx = await demetra
  .connect(essentialUser)
  .transferFrom(essentialUser.address, recipient.address, 1n);
await essentialTransferTx.wait();

const goldTransferTx = await demetra
  .connect(goldUser)
  .transferFrom(goldUser.address, recipient.address, 2n);
await goldTransferTx.wait();

const superGoldTransferTx = await demetra
  .connect(superGoldUser)
  .transferFrom(superGoldUser.address, recipient.address, 3n);
await superGoldTransferTx.wait();

console.log("I tre NFT sono stati trasferiti");