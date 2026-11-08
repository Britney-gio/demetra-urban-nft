import { network } from "hardhat";

const { ethers } = await network.create();
const [owner] = await ethers.getSigners();
const baseFee = ethers.parseEther("0.0001");
const gasPrice = 1_000_000_000n;
const weiPerUnitLink = ethers.parseEther("0.01");

const coordinator = await ethers.deployContract(
  "VRFCoordinatorV2_5Mock",
  [baseFee, gasPrice, weiPerUnitLink],
  owner,
);

await coordinator.waitForDeployment();

console.log("Mock VRF distribuito:", await coordinator.getAddress());

const createSubscriptionTx = await coordinator.createSubscription();
await createSubscriptionTx.wait();

const subscriptionIds = await coordinator.getActiveSubscriptionIds(0, 1);
const subscriptionId = subscriptionIds[0]!;

// Finanzia il saldo nativo della subscription con ETH simulati.
const fundSubscriptionTx = await coordinator.fundSubscriptionWithNative(
  subscriptionId,
  { value: ethers.parseEther("100") },
);
await fundSubscriptionTx.wait();

console.log("Subscription locale creata e finanziata:", subscriptionId.toString());

const demetra = await ethers.deployContract(
  "DemetraUrban",
  [
    await coordinator.getAddress(),
    subscriptionId,
    ethers.ZeroHash,
    3,
    300_000,
    "ipfs://test-essential",
    "ipfs://test-gold",
    "ipfs://test-super-gold",
  ],
  owner,
);

await demetra.waitForDeployment();

// Autorizza Demetra a usare i fondi della subscription.
const addConsumerTx = await coordinator.addConsumer(
  subscriptionId,
  await demetra.getAddress(),
);
await addConsumerTx.wait();

console.log("Demetra Urban distribuito:", await demetra.getAddress());