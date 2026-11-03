import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create({
  network: "hardhatMainnet",
  chainType: "l1",
});

// Prepara l'ambiente iniziale, ripristinabile tra un test e l'altro.
async function deployDemetraFixture() {
  const [owner, user, otherUser] = await ethers.getSigners();

  // Costi simulati; la conversione ETH/LINK non serve al pagamento nativo.
  const baseFee = ethers.parseEther("0.0001");
  const gasPrice = 1_000_000_000n;
  const weiPerUnitLink = ethers.parseEther("0.01");

  // Distribuisce il Coordinator simulato sulla blockchain locale.
  const coordinator = await ethers.deployContract(
    "VRFCoordinatorV2_5Mock",
    [baseFee, gasPrice, weiPerUnitLink],
    owner,
  );

  await coordinator.waitForDeployment();

  // Crea la subscription e recupera l'ID senza presumere che sia 1.
  const createSubscriptionTx = await coordinator.createSubscription();
  await createSubscriptionTx.wait();

  const subscriptionIds = await coordinator.getActiveSubscriptionIds(0, 1);
  const subscriptionId = subscriptionIds[0];

  // Finanzia il saldo nativo della subscription con ETH locali.
  const fundSubscriptionTx = await coordinator.fundSubscriptionWithNative(
    subscriptionId,
    { value: ethers.parseEther("100") },
  );

  await fundSubscriptionTx.wait();

  // Configurazione di prova: gas lane e URI non sono quelli di Sepolia.
  const keyHash = ethers.ZeroHash;
  const requestConfirmations = 3;
  const callbackGasLimit = 300_000;

  const essentialURI = "ipfs://test-essential";
  const goldURI = "ipfs://test-gold";
  const superGoldURI = "ipfs://test-super-gold";

  const demetra = await ethers.deployContract(
    "DemetraUrban",
    [
      await coordinator.getAddress(),
      subscriptionId,
      keyHash,
      requestConfirmations,
      callbackGasLimit,
      essentialURI,
      goldURI,
      superGoldURI,
    ],
    owner,
  );

  await demetra.waitForDeployment();

  // Autorizza Demetra a usare la subscription per le richieste VRF.
  const addConsumerTx = await coordinator.addConsumer(
    subscriptionId,
    await demetra.getAddress(),
  );

  await addConsumerTx.wait();

  return {
    owner,
    user,
    otherUser,
    coordinator,
    subscriptionId,
    demetra,
    essentialURI,
    goldURI,
    superGoldURI,
  };
}

describe("DemetraUrban", function () {
  it("Imposta nome e simbolo della collezione correttamente", async function () {
    // Carica la preparazione iniziale o ne ripristina lo snapshot.
    const { demetra } = await networkHelpers.loadFixture(deployDemetraFixture);

    expect(await demetra.name()).to.equal("Demetra Urban");
    expect(await demetra.symbol()).to.equal("DURB");
  });
});