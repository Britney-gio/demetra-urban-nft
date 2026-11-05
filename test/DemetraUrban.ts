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

it("Prenota il primo NFT senza crearlo", async function () {
  const { demetra, user } = await networkHelpers.loadFixture(
    deployDemetraFixture,
  );

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  expect(await demetra.totalRequested()).to.equal(1n);
  expect(await demetra.hasRequestedMint(user.address)).to.equal(true);
  expect(await demetra.tokenRequester(1n)).to.equal(user.address);

  expect(await demetra.totalMinted()).to.equal(0n);
  expect(await demetra.tokenVariant(1n)).to.equal(0n);
  expect(await demetra.balanceOf(user.address)).to.equal(0n);
});

it("Rifiuta una seconda richiesta dallo stesso wallet", async function () {
  const { demetra, user } = await networkHelpers.loadFixture(
    deployDemetraFixture,
  );

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  await expect(demetra.connect(user).requestMint())
    .to.be.revertedWithCustomError(demetra, "MintAlreadyRequested")
    .withArgs(user.address);

  expect(await demetra.totalRequested()).to.equal(1n);
  expect(await demetra.tokenRequester(2n)).to.equal(ethers.ZeroAddress);
});

it("Salva la casualità ricevuta senza assegnare la variante", async function () {
  const { demetra, coordinator, user } = await networkHelpers.loadFixture(
    deployDemetraFixture,
  );

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  await expect(
    coordinator.fulfillRandomWordsWithOverride(
      requestId,
      await demetra.getAddress(),
      [0n],
    ),
  )
    .to.emit(demetra, "RandomnessReceived")
    .withArgs(requestId, 1n, 0n);

  expect(await demetra.requestFulfilled(requestId)).to.equal(true);
  expect(await demetra.randomnessReady(1n)).to.equal(true);
  expect(await demetra.tokenRandomNumber(1n)).to.equal(0n);

  expect(await demetra.tokenVariant(1n)).to.equal(0n);
  expect(await demetra.nextTokenToAssign()).to.equal(1n);
  expect(await demetra.totalMinted()).to.equal(0n);
});

it("Assegna Essential al primo token usando la casualità ricevuta", async function () {
  const { demetra, coordinator, user, otherUser } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [0n],
  );
  await fulfillmentTx.wait();

  await expect(demetra.connect(otherUser).assignVariants(1n))
    .to.emit(demetra, "VariantAssigned")
    .withArgs(1n, user.address, 1n);

  expect(await demetra.tokenVariant(1n)).to.equal(1n);
  expect(await demetra.remainingSupply(1n)).to.equal(69n);
  expect(await demetra.remainingSupply(2n)).to.equal(25n);
  expect(await demetra.remainingSupply(3n)).to.equal(5n);
  expect(await demetra.nextTokenToAssign()).to.equal(2n);
  expect(await demetra.totalMinted()).to.equal(0n);
});

it("Assegna Gold al primo token usando la casualità ricevuta", async function () {
  const { demetra, coordinator, user, otherUser } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [70n],
  );
  await fulfillmentTx.wait();

  await expect(demetra.connect(otherUser).assignVariants(1n))
    .to.emit(demetra, "VariantAssigned")
    .withArgs(1n, user.address, 2n)
    .and.to.emit(demetra, "GoldAssigned")
    .withArgs(user.address, 1n);

  expect(await demetra.tokenVariant(1n)).to.equal(2n);
  expect(await demetra.remainingSupply(1n)).to.equal(70n);
  expect(await demetra.remainingSupply(2n)).to.equal(24n);
  expect(await demetra.remainingSupply(3n)).to.equal(5n);
  expect(await demetra.hasTourAccess(user.address)).to.equal(false);
  expect(await demetra.nextTokenToAssign()).to.equal(2n);
  expect(await demetra.totalMinted()).to.equal(0n);
});

it("Assegna SuperGold al primo token usando la casualità ricevuta", async function () {
  const { demetra, coordinator, user, otherUser } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [95n],
  );
  await fulfillmentTx.wait();

  await expect(demetra.connect(otherUser).assignVariants(1n))
    .to.emit(demetra, "VariantAssigned")
    .withArgs(1n, user.address, 3n)
    .and.to.emit(demetra, "TourAssigned")
    .withArgs(user.address, 1n);

  expect(await demetra.tokenVariant(1n)).to.equal(3n);
  expect(await demetra.remainingSupply(1n)).to.equal(70n);
  expect(await demetra.remainingSupply(2n)).to.equal(25n);
  expect(await demetra.remainingSupply(3n)).to.equal(4n);
  expect(await demetra.hasTourAccess(user.address)).to.equal(true);
  expect(await demetra.nextTokenToAssign()).to.equal(2n);
  expect(await demetra.totalMinted()).to.equal(0n);
});

it("Consente al richiedente di ritirare l'NFT assegnato", async function () {
  const { demetra, coordinator, user, essentialURI } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [0n],
  );
  await fulfillmentTx.wait();

  const assignmentTx = await demetra.assignVariants(1n);
  await assignmentTx.wait();

  await expect(demetra.connect(user).claimNFT(1n))
    .to.emit(demetra, "SuccessfulMint")
    .withArgs(1n, user.address, 1n, 0n)
    .and.to.emit(demetra, "Transfer")
    .withArgs(ethers.ZeroAddress, user.address, 1n);

  expect(await demetra.ownerOf(1n)).to.equal(user.address);
  expect(await demetra.balanceOf(user.address)).to.equal(1n);
  expect(await demetra.totalMinted()).to.equal(1n);
  expect(await demetra.totalRequested()).to.equal(1n);
  expect(await demetra.tokenURI(1n)).to.equal(essentialURI);
  expect(await demetra.remainingSupply(1n)).to.equal(69n);
});

it("Rifiuta il claim prima dell'assegnazione Super Gold", async function () {
  const { demetra, coordinator, user } = await networkHelpers.loadFixture(
    deployDemetraFixture,
  );

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [95n],
  );
  await fulfillmentTx.wait();

  await expect(demetra.connect(user).claimNFT(1n))
    .to.be.revertedWithCustomError(demetra, "VariantNotAssigned")
    .withArgs(1n);

  expect(await demetra.randomnessReady(1n)).to.equal(true);
  expect(await demetra.tokenRandomNumber(1n)).to.equal(95n);
  expect(await demetra.tokenVariant(1n)).to.equal(0n);
  expect(await demetra.hasTourAccess(user.address)).to.equal(false);
  expect(await demetra.remainingSupply(3n)).to.equal(5n);
  expect(await demetra.totalMinted()).to.equal(0n);
  expect(await demetra.balanceOf(user.address)).to.equal(0n);
});

it("Impedisce a un altro wallet di ritirare il Gold già assegnato", async function () {
  const { demetra, coordinator, user, otherUser } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [70n],
  );
  await fulfillmentTx.wait();

  const assignmentTx = await demetra.assignVariants(1n);
  await assignmentTx.wait();

  await expect(demetra.connect(otherUser).claimNFT(1n))
    .to.be.revertedWithCustomError(demetra, "NotTokenRequester")
    .withArgs(1n);

  expect(await demetra.tokenRequester(1n)).to.equal(user.address);
  expect(await demetra.tokenVariant(1n)).to.equal(2n);
  expect(await demetra.totalMinted()).to.equal(0n);
  expect(await demetra.balanceOf(otherUser.address)).to.equal(0n);

  // Il tentativo non autorizzato non impedisce il ritiro al richiedente, testiamo :
  const claimTx = await demetra.connect(user).claimNFT(1n);
  await claimTx.wait();

  expect(await demetra.ownerOf(1n)).to.equal(user.address);
  expect(await demetra.totalMinted()).to.equal(1n);
  expect(await demetra.remainingSupply(2n)).to.equal(24n);
});

it("Impedisce di ritirare due volte lo stesso NFT Gold", async function () {
  const { demetra, coordinator, user } =
    await networkHelpers.loadFixture(deployDemetraFixture);

  const requestTx = await demetra.connect(user).requestMint();
  await requestTx.wait();

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  const requestId = requests[0]!.args.requestId;

  const fulfillmentTx = await coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await demetra.getAddress(),
    [73n],
  );
  await fulfillmentTx.wait();

  const assignmentTx = await demetra.assignVariants(1n);
  await assignmentTx.wait();

  const claimTx = await demetra.connect(user).claimNFT(1n);
  await claimTx.wait();

  await expect(demetra.connect(user).claimNFT(1n))
    .to.be.revertedWithCustomError(demetra, "NFTAlreadyClaimed")
    .withArgs(1n);

  expect(await demetra.ownerOf(1n)).to.equal(user.address);
  expect(await demetra.balanceOf(user.address)).to.equal(1n);
  expect(await demetra.totalMinted()).to.equal(1n);
  expect(await demetra.remainingSupply(2n)).to.equal(24n);
});