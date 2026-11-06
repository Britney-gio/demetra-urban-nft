import { expect } from "chai";
import type { Signer } from "ethers";
import { describe, it } from "mocha";
import { network } from "hardhat";

// La rete Hardhat è simulata: nessuna transazione viene inviata a Sepolia.
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

  // Demetra paga le risposte VRF con il saldo nativo della subscription.
  const fundSubscriptionTx = await coordinator.fundSubscriptionWithNative(
    subscriptionId,
    { value: ethers.parseEther("100") },
  );

  await fundSubscriptionTx.wait();

  // Valori locali: il mock non richiede una gas lane reale né accesso a IPFS.
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

type DemetraFixture = Awaited<ReturnType<typeof deployDemetraFixture>>;

const VARIANT = {
  Undefined: 0n,
  Essential: 1n,
  Gold: 2n,
  SuperGold: 3n,
} as const;

// Questi numeri selezionano le varianti solo quando tutte le scorte sono intatte.
const FIRST_DRAW = {
  Essential: 0n,
  Gold: 70n,
  SuperGold: 95n,
} as const;

// Ogni test riparte dallo snapshot creato dopo la configurazione iniziale.
function loadDemetra() {
  return networkHelpers.loadFixture(deployDemetraFixture);
}

async function requestNFT(
  demetra: DemetraFixture["demetra"],
  signer: Signer,
) {
  await (await demetra.connect(signer).requestMint()).wait();
}

async function getOnlyRequestId(demetra: DemetraFixture["demetra"]) {
  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
  );
  expect(requests).to.have.lengthOf(1);
  return requests[0]!.args.requestId;
}

async function deliverRandomness(
  { demetra, coordinator }: Pick<DemetraFixture, "demetra" | "coordinator">,
  requestId: bigint,
  randomNumber: bigint,
) {
  await (
    await coordinator.fulfillRandomWordsWithOverride(
      requestId,
      await demetra.getAddress(),
      [randomNumber],
    )
  ).wait();
}

// Ci fermiamo alla risposta VRF se il test deve osservare lo stato prima dell'assegnazione.
async function deliverFirstResponse(
  fixture: DemetraFixture,
  randomNumber: bigint,
) {
  await deliverRandomness(
    fixture,
    await getOnlyRequestId(fixture.demetra),
    randomNumber,
  );
}

async function assignFirstToken(fixture: DemetraFixture, randomNumber: bigint) {
  await deliverFirstResponse(fixture, randomNumber);
  await (await fixture.demetra.assignVariants(1n)).wait();
}

// Nei test sui trasferimenti il mint è solo preparazione: il comportamento
// del claim viene verificato nei test dedicati.
async function mintFirstToken(
  fixture: DemetraFixture,
  signer: Signer,
  randomNumber: bigint,
) {
  await requestNFT(fixture.demetra, signer);
  await assignFirstToken(fixture, randomNumber);
  await (await fixture.demetra.connect(signer).claimNFT(1n)).wait();
}

describe("DemetraUrban", function () {

  describe("Configurazione e standard", function () {
    it("Imposta nome e simbolo della collezione correttamente", async function () {
      const { demetra } = await loadDemetra();

      expect(await demetra.name()).to.equal("Demetra Urban");
      expect(await demetra.symbol()).to.equal("DURB");
    });

    it("Dichiara il supporto per ERC-721 e per i metadati ERC-721", async function () {
      const { demetra } = await loadDemetra();

      expect(await demetra.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await demetra.supportsInterface("0x5b5e139f")).to.equal(true);
      expect(await demetra.supportsInterface("0xffffffff")).to.equal(false);
    });

    it("Rifiuta il deploy se uno degli URI è vuoto", async function () {
      const {
        demetra, coordinator, subscriptionId, owner,
        essentialURI, goldURI, superGoldURI,
      } = await loadDemetra();

      const coordinatorAddress = await coordinator.getAddress();

      const invalidURIs = [
        ["", goldURI, superGoldURI],
        [essentialURI, "", superGoldURI],
        [essentialURI, goldURI, ""],
      ];

      for (const uris of invalidURIs) {
        await expect(
          ethers.deployContract(
            "DemetraUrban",
            [coordinatorAddress, subscriptionId, ethers.ZeroHash, 3, 300_000, ...uris],
            owner,
          ),
        ).to.be.revertedWithCustomError(demetra, "EmptyMetadataURI");
      }
    });

    it("Rifiuta il deploy con il Coordinator all'indirizzo zero", async function () {
      const { demetra, subscriptionId, owner, essentialURI, goldURI, superGoldURI } = await loadDemetra();

      await expect(
        ethers.deployContract(
          "DemetraUrban",
          [
            ethers.ZeroAddress,
            subscriptionId,
            ethers.ZeroHash,
            3,
            300_000,
            essentialURI,
            goldURI,
            superGoldURI,
          ],
          owner,
        ),
      ).to.be.revertedWithCustomError(demetra, "ZeroAddress");
    });
  });

  describe("Prenotazioni e disponibilità", function () {
    it("Prenota il primo NFT senza crearlo", async function () {
      const { demetra, user } = await loadDemetra();

      await requestNFT(demetra, user);

      expect(await demetra.totalRequested()).to.equal(1n);
      expect(await demetra.hasRequestedMint(user.address)).to.equal(true);
      expect(await demetra.tokenRequester(1n)).to.equal(user.address);

      expect(await demetra.totalMinted()).to.equal(0n);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Undefined);
      expect(await demetra.balanceOf(user.address)).to.equal(0n);
    });

    it("Rifiuta una seconda richiesta dallo stesso wallet", async function () {
      const { demetra, user } = await loadDemetra();

      await requestNFT(demetra, user);

      await expect(demetra.connect(user).requestMint())
        .to.be.revertedWithCustomError(demetra, "MintAlreadyRequested")
        .withArgs(user.address);

      expect(await demetra.totalRequested()).to.equal(1n);
      expect(await demetra.tokenRequester(2n)).to.equal(ethers.ZeroAddress);
    });

    it("Limita le richieste a 100 e assegna esattamente 70 Essential, 25 Gold e 5 Super Gold", async function () {
      this.timeout(120_000);

      const { demetra, coordinator } = await loadDemetra();

      const clients = [];

      for (let i = 0; i < 101; i++) {
        const client = ethers.Wallet.createRandom().connect(ethers.provider);

        await networkHelpers.setBalance(client.address, ethers.parseEther("1"));

        clients.push(client);
      }

      for (const client of clients.slice(0, 100)) {
        await requestNFT(demetra, client);
      }

      expect(await demetra.totalRequested()).to.equal(100n);

      const extraClient = clients[100]!;

      await expect(
        demetra.connect(extraClient).requestMint(),
      ).to.be.revertedWithCustomError(demetra, "MaxSupplyReached");

      expect(await demetra.hasRequestedMint(extraClient.address)).to.equal(false);
      expect(await demetra.totalRequested()).to.equal(100n);

      const requests = await demetra.queryFilter(
        demetra.filters.AcceptedMintRequest(),
      );

      expect(requests.length).to.equal(100);

      // Con zero il contratto esaurisce sempre la prima variante ancora disponibile.
      for (const request of requests) {
        await deliverRandomness(
          { demetra, coordinator },
          request.args.requestId,
          0n,
        );
      }

      // Elabora più token nella stessa transazione, in gruppi da 10.
      for (let i = 0; i < 10; i++) {
        const assignmentTx = await demetra.assignVariants(10n);
        await assignmentTx.wait();
      }

      const counts = [0, 0, 0, 0];

      for (let i = 1; i <= 100; i++) {
        const tokenId = BigInt(i);
        const variant = Number(await demetra.tokenVariant(tokenId));

        expect(variant).to.be.oneOf([1, 2, 3]);
        counts[variant] = counts[variant]! + 1;

        const expectedVariant =
          i <= 70 ? VARIANT.Essential : i <= 95 ? VARIANT.Gold : VARIANT.SuperGold;

        expect(await demetra.tokenVariant(tokenId)).to.equal(expectedVariant);
        expect(await demetra.tokenRequester(tokenId)).to.equal(
          clients[i - 1]!.address,
        );
        expect(await demetra.hasTourAccess(clients[i - 1]!.address)).to.equal(
          i > 95,
        );
      }

      expect(counts).to.deep.equal([0, 70, 25, 5]);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(0n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(0n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(0n);
      expect(await demetra.nextTokenToAssign()).to.equal(101n);
      expect(await demetra.totalRequested()).to.equal(100n);
      expect(await demetra.totalMinted()).to.equal(0n);

      await expect(demetra.assignVariants(10n)).to.not.emit(
        demetra,
        "VariantAssigned",
      );
    });

    it("Non consuma una prenotazione se il Coordinator rifiuta la richiesta", async function () {
      const { demetra, coordinator, subscriptionId, user } = await loadDemetra();

      const demetraAddress = await demetra.getAddress();

      await (
        await coordinator.removeConsumer(subscriptionId, demetraAddress)
      ).wait();

      await expect(demetra.connect(user).requestMint())
        .to.be.revertedWithCustomError(coordinator, "InvalidConsumer")
        .withArgs(subscriptionId, demetraAddress);

      expect(await demetra.totalRequested()).to.equal(0n);
      expect(await demetra.hasRequestedMint(user.address)).to.equal(false);
      expect(await demetra.tokenRequester(1n)).to.equal(ethers.ZeroAddress);

      // Ripristinata l'autorizzazione, lo stesso wallet può riprovare.
      await (
        await coordinator.addConsumer(subscriptionId, demetraAddress)
      ).wait();
      await requestNFT(demetra, user);

      expect(await demetra.totalRequested()).to.equal(1n);
      expect(await demetra.tokenRequester(1n)).to.equal(user.address);
    });
  });

  describe("Risposte VRF e Coordinator", function () {
    it("Salva la casualità ricevuta senza assegnare la variante", async function () {
      const { demetra, coordinator, user } = await loadDemetra();

      await requestNFT(demetra, user);

      const requestId = await getOnlyRequestId(demetra);

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

      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Undefined);
      expect(await demetra.nextTokenToAssign()).to.equal(1n);
      expect(await demetra.totalMinted()).to.equal(0n);
    });

    it("Rifiuta una risposta VRF inviata da un wallet non autorizzato", async function () {
      const { demetra, coordinator, user, otherUser } = await loadDemetra();

      await requestNFT(demetra, user);

      const requestId = await getOnlyRequestId(demetra);

      // Il wallet non autorizzato conosce l'ID della richiesta e prova a inviare un numero scelto.
      await expect(
        demetra.connect(otherUser).rawFulfillRandomWords(requestId, [95n]),
      )
        .to.be.revertedWithCustomError(demetra, "OnlyCoordinatorCanFulfill")
        .withArgs(otherUser.address, await coordinator.getAddress());

      expect(await demetra.requestFulfilled(requestId)).to.equal(false);
      expect(await demetra.randomnessReady(1n)).to.equal(false);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Undefined);
    });

    it("Blocca richieste e risposte dopo la sostituzione del Coordinator", async function () {
      const { demetra, coordinator, owner, user, otherUser } = await loadDemetra();

      await requestNFT(demetra, user);

      const requestId = await getOnlyRequestId(demetra);
      const initialCoordinator = await coordinator.getAddress();

      await (
        await demetra.connect(owner).setCoordinator(otherUser.address)
      ).wait();

      expect(await demetra.s_vrfCoordinator()).to.equal(otherUser.address);

      // Il sostituto prova a rispondere a una richiesta già aperta.
      await expect(
        demetra.connect(otherUser).rawFulfillRandomWords(requestId, [95n]),
      )
        .to.be.revertedWithCustomError(demetra, "OnlyCoordinatorCanFulfill")
        .withArgs(otherUser.address, initialCoordinator);

      // Usiamo un wallet che non ha ancora prenotato.
      await expect(demetra.connect(owner).requestMint())
        .to.be.revertedWithCustomError(demetra, "CoordinatorChanged");

      expect(await demetra.totalRequested()).to.equal(1n);
      expect(await demetra.hasRequestedMint(owner.address)).to.equal(false);
      expect(await demetra.requestFulfilled(requestId)).to.equal(false);
      expect(await demetra.randomnessReady(1n)).to.equal(false);
    });

    it("Ignora una risposta duplicata senza sovrascrivere la casualità", async function () {
      const { demetra, coordinator, user } = await loadDemetra();

      await requestNFT(demetra, user);

      const requestId = await getOnlyRequestId(demetra);
      const coordinatorAddress = await coordinator.getAddress();

      await expect(
        coordinator.fulfillRandomWordsWithOverride(
          requestId,
          await demetra.getAddress(),
          [0n],
        ),
      )
        .to.emit(demetra, "RandomnessReceived")
        .withArgs(requestId, 1n, 0n);

      // Simula una seconda risposta dal Coordinator senza passare dal mock.
      await networkHelpers.impersonateAccount(coordinatorAddress);

      try {
        const coordinatorSigner = await ethers.getSigner(coordinatorAddress);

        await expect(
          demetra.connect(coordinatorSigner).rawFulfillRandomWords(requestId, [95n]),
        ).to.not.emit(demetra, "RandomnessReceived");
      } finally {
        await networkHelpers.stopImpersonatingAccount(coordinatorAddress);
      }

      expect(await demetra.requestFulfilled(requestId)).to.equal(true);
      expect(await demetra.randomnessReady(1n)).to.equal(true);
      expect(await demetra.tokenRandomNumber(1n)).to.equal(0n);

      // L'assegnazione usa ancora la prima risposta: 0 seleziona Essential.
      await expect(demetra.assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(1n, user.address, VARIANT.Essential);
    });
  });

  describe("Assegnazione delle varianti", function () {
    it("Assegna Essential al primo token usando la casualità ricevuta", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, otherUser } = fixture;

      await requestNFT(demetra, user);
      await deliverFirstResponse(fixture, FIRST_DRAW.Essential);

      await expect(demetra.connect(otherUser).assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(1n, user.address, VARIANT.Essential);

      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(25n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
      expect(await demetra.nextTokenToAssign()).to.equal(2n);
      expect(await demetra.totalMinted()).to.equal(0n);
    });

    it("Assegna Gold al primo token usando la casualità ricevuta", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, otherUser } = fixture;

      await requestNFT(demetra, user);
      await deliverFirstResponse(fixture, FIRST_DRAW.Gold);

      await expect(demetra.connect(otherUser).assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(1n, user.address, VARIANT.Gold)
        .and.to.emit(demetra, "GoldAssigned")
        .withArgs(user.address, 1n);

      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Gold);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(70n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(24n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
      expect(await demetra.hasTourAccess(user.address)).to.equal(false);
      expect(await demetra.nextTokenToAssign()).to.equal(2n);
      expect(await demetra.totalMinted()).to.equal(0n);
    });

    it("Assegna SuperGold al primo token usando la casualità ricevuta", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, otherUser } = fixture;

      await requestNFT(demetra, user);
      await deliverFirstResponse(fixture, FIRST_DRAW.SuperGold);

      await expect(demetra.connect(otherUser).assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(1n, user.address, VARIANT.SuperGold)
        .and.to.emit(demetra, "TourAssigned")
        .withArgs(user.address, 1n);

      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.SuperGold);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(70n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(25n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(4n);
      expect(await demetra.hasTourAccess(user.address)).to.equal(true);
      expect(await demetra.nextTokenToAssign()).to.equal(2n);
      expect(await demetra.totalMinted()).to.equal(0n);
    });

    it("Gestisce risposte VRF fuori ordine e assegnazioni in più chiamate", async function () {
      const { demetra, coordinator, owner, user, otherUser } = await loadDemetra();

      for (const signer of [owner, user, otherUser]) {
        await requestNFT(demetra, signer);
      }

      const requests = await demetra.queryFilter(
        demetra.filters.AcceptedMintRequest(),
      );

      const requestId1 = requests[0]!.args.requestId;
      const requestId2 = requests[1]!.args.requestId;
      const requestId3 = requests[2]!.args.requestId;

      // 69 e 94 sono i confini Gold e Super Gold dopo le assegnazioni precedenti.
      // Le risposte dei token 3 e 2 non permettono di saltare il token 1.
      await deliverRandomness({ demetra, coordinator }, requestId3, 94n);

      await expect(demetra.assignVariants(3n)).to.not.emit(
        demetra,
        "VariantAssigned",
      );

      expect(await demetra.randomnessReady(3n)).to.equal(true);
      expect(await demetra.nextTokenToAssign()).to.equal(1n);

      await deliverRandomness({ demetra, coordinator }, requestId2, 69n);

      await expect(demetra.assignVariants(3n)).to.not.emit(
        demetra,
        "VariantAssigned",
      );

      expect(await demetra.randomnessReady(1n)).to.equal(false);
      expect(await demetra.randomnessReady(2n)).to.equal(true);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Undefined);
      expect(await demetra.tokenVariant(2n)).to.equal(VARIANT.Undefined);
      expect(await demetra.tokenVariant(3n)).to.equal(VARIANT.Undefined);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(70n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(25n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
      expect(await demetra.hasTourAccess(otherUser.address)).to.equal(false);

      await deliverRandomness({ demetra, coordinator }, requestId1, 0n);

      // Prima chiamata: assegna soltanto il token 1 a Essential.
      await expect(demetra.assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(1n, owner.address, VARIANT.Essential);

      expect(await demetra.nextTokenToAssign()).to.equal(2n);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);
      expect(await demetra.tokenVariant(2n)).to.equal(VARIANT.Undefined);
      expect(await demetra.tokenVariant(3n)).to.equal(VARIANT.Undefined);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(25n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);

      // Seconda chiamata: riparte dal token 2 e assegna Gold.
      await expect(demetra.assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(2n, user.address, VARIANT.Gold)
        .and.to.emit(demetra, "GoldAssigned")
        .withArgs(user.address, 2n);

      expect(await demetra.nextTokenToAssign()).to.equal(3n);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);
      expect(await demetra.tokenVariant(2n)).to.equal(VARIANT.Gold);
      expect(await demetra.tokenVariant(3n)).to.equal(VARIANT.Undefined);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(24n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
      expect(await demetra.hasTourAccess(user.address)).to.equal(false);
      expect(await demetra.hasTourAccess(otherUser.address)).to.equal(false);

      // Terza chiamata: assegna Super Gold e registra il tour.
      await expect(demetra.assignVariants(1n))
        .to.emit(demetra, "VariantAssigned")
        .withArgs(3n, otherUser.address, VARIANT.SuperGold)
        .and.to.emit(demetra, "TourAssigned")
        .withArgs(otherUser.address, 3n);

      expect(await demetra.tokenVariant(3n)).to.equal(VARIANT.SuperGold);
      expect(await demetra.hasTourAccess(owner.address)).to.equal(false);
      expect(await demetra.hasTourAccess(otherUser.address)).to.equal(true);

      expect(await demetra.tokenRandomNumber(1n)).to.equal(0n);
      expect(await demetra.tokenRandomNumber(2n)).to.equal(69n);
      expect(await demetra.tokenRandomNumber(3n)).to.equal(94n);

      expect(await demetra.requestFulfilled(requestId1)).to.equal(true);
      expect(await demetra.requestFulfilled(requestId2)).to.equal(true);
      expect(await demetra.requestFulfilled(requestId3)).to.equal(true);

      // Una chiamata aggiuntiva non riassegna i token già elaborati.
      await expect(demetra.assignVariants(3n)).to.not.emit(
        demetra,
        "VariantAssigned",
      );

      expect(await demetra.nextTokenToAssign()).to.equal(4n);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);
      expect(await demetra.tokenVariant(2n)).to.equal(VARIANT.Gold);
      expect(await demetra.tokenVariant(3n)).to.equal(VARIANT.SuperGold);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(24n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(4n);
      expect(await demetra.totalRequested()).to.equal(3n);
      expect(await demetra.totalMinted()).to.equal(0n);
    });

    it("Rifiuta quantità di assegnazione fuori dai limiti", async function () {
      const { demetra } = await loadDemetra();

      await expect(demetra.assignVariants(0n)).to.be.revertedWithCustomError(
        demetra,
        "InvalidBatchSize",
      );

      await expect(demetra.assignVariants(101n)).to.be.revertedWithCustomError(
        demetra,
        "InvalidBatchSize",
      );

      expect(await demetra.nextTokenToAssign()).to.equal(1n);
      expect(await demetra.totalRequested()).to.equal(0n);
      expect(await demetra.totalMinted()).to.equal(0n);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(70n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(25n);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
    });
  });

  describe("Ritiro e destinatari", function () {
    it("Consente al richiedente di ritirare l'NFT assegnato", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, essentialURI } = fixture;

      await requestNFT(demetra, user);
      await assignFirstToken(fixture, FIRST_DRAW.Essential);

      await expect(demetra.connect(user).claimNFT(1n))
        .to.emit(demetra, "SuccessfulMint")
        .withArgs(1n, user.address, VARIANT.Essential, 0n)
        .and.to.emit(demetra, "Transfer")
        .withArgs(ethers.ZeroAddress, user.address, 1n);

      expect(await demetra.ownerOf(1n)).to.equal(user.address);
      expect(await demetra.balanceOf(user.address)).to.equal(1n);
      expect(await demetra.totalMinted()).to.equal(1n);
      expect(await demetra.totalRequested()).to.equal(1n);
      expect(await demetra.tokenURI(1n)).to.equal(essentialURI);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
    });

    it("Rifiuta il claim prima dell'assegnazione Super Gold", async function () {
      const fixture = await loadDemetra();
      const { demetra, user } = fixture;

      await requestNFT(demetra, user);
      await deliverFirstResponse(fixture, FIRST_DRAW.SuperGold);

      await expect(demetra.connect(user).claimNFT(1n))
        .to.be.revertedWithCustomError(demetra, "VariantNotAssigned")
        .withArgs(1n);

      expect(await demetra.randomnessReady(1n)).to.equal(true);
      expect(await demetra.tokenRandomNumber(1n)).to.equal(95n);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Undefined);
      expect(await demetra.hasTourAccess(user.address)).to.equal(false);
      expect(await demetra.remainingSupply(VARIANT.SuperGold)).to.equal(5n);
      expect(await demetra.totalMinted()).to.equal(0n);
      expect(await demetra.balanceOf(user.address)).to.equal(0n);
    });

    it("Impedisce a un altro wallet di ritirare il Gold già assegnato", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, otherUser } = fixture;

      await requestNFT(demetra, user);
      await assignFirstToken(fixture, FIRST_DRAW.Gold);

      await expect(demetra.connect(otherUser).claimNFT(1n))
        .to.be.revertedWithCustomError(demetra, "NotTokenRequester")
        .withArgs(1n);

      expect(await demetra.tokenRequester(1n)).to.equal(user.address);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Gold);
      expect(await demetra.totalMinted()).to.equal(0n);
      expect(await demetra.balanceOf(otherUser.address)).to.equal(0n);

      // Il tentativo respinto non blocca il ritiro del richiedente.
      const claimTx = await demetra.connect(user).claimNFT(1n);
      await claimTx.wait();

      expect(await demetra.ownerOf(1n)).to.equal(user.address);
      expect(await demetra.totalMinted()).to.equal(1n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(24n);
    });

    it("Impedisce di ritirare due volte lo stesso NFT Gold", async function () {
      const fixture = await loadDemetra();
      const { demetra, user } = fixture;

      await requestNFT(demetra, user);
      await assignFirstToken(fixture, 73n);

      const claimTx = await demetra.connect(user).claimNFT(1n);
      await claimTx.wait();

      await expect(demetra.connect(user).claimNFT(1n))
        .to.be.revertedWithCustomError(demetra, "NFTAlreadyClaimed")
        .withArgs(1n);

      expect(await demetra.ownerOf(1n)).to.equal(user.address);
      expect(await demetra.balanceOf(user.address)).to.equal(1n);
      expect(await demetra.totalMinted()).to.equal(1n);
      expect(await demetra.remainingSupply(VARIANT.Gold)).to.equal(24n);
    });

    it("Annulla il mint se il richiedente non può ricevere NFT", async function () {
      const fixture = await loadDemetra();
      const { demetra } = fixture;

      const receiver = await ethers.deployContract("IncompatibleClaimReceiver", [
        await demetra.getAddress(),
      ]);
      await receiver.waitForDeployment();

      const receiverAddress = await receiver.getAddress();
      await (await receiver.requestMint()).wait();
      await assignFirstToken(fixture, FIRST_DRAW.Essential);

      await expect(receiver.claimNFT(1n))
        .to.be.revertedWithCustomError(demetra, "ERC721InvalidReceiver")
        .withArgs(receiverAddress);

      expect(await demetra.totalMinted()).to.equal(0n);
      expect(await demetra.balanceOf(receiverAddress)).to.equal(0n);
      expect(await demetra.tokenRequester(1n)).to.equal(receiverAddress);
      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);
      expect(await demetra.remainingSupply(VARIANT.Essential)).to.equal(69n);
    });

    it("Blocca il doppio claim tentato nella callback del destinatario", async function () {
      const fixture = await loadDemetra();
      const { demetra } = fixture;

      const receiver = await ethers.deployContract("ReentrantClaimReceiver", [
        await demetra.getAddress(),
      ]);
      await receiver.waitForDeployment();

      const receiverAddress = await receiver.getAddress();
      await (await receiver.requestMint()).wait();
      await assignFirstToken(fixture, FIRST_DRAW.Essential);

      await expect(receiver.claimNFT(1n))
        .to.emit(demetra, "SuccessfulMint")
        .withArgs(1n, receiverAddress, 1n, 0n);

      expect(await receiver.attemptedReentry()).to.equal(true);
      expect(await receiver.reentrySucceeded()).to.equal(false);
      expect(await receiver.reentryError()).to.equal(
        demetra.interface.getError("NFTAlreadyClaimed")!.selector,
      );

      expect(await demetra.ownerOf(1n)).to.equal(receiverAddress);
      expect(await demetra.balanceOf(receiverAddress)).to.equal(1n);
      expect(await demetra.totalMinted()).to.equal(1n);
    });
  });

  describe("Trasferimenti, premi e metadati", function () {
    it("Trasferisce un Gold solo con autorizzazione e mantiene il limite di mint", async function () {
      const fixture = await loadDemetra();
      const { demetra, owner, user, otherUser, goldURI } = fixture;

      await mintFirstToken(fixture, user, FIRST_DRAW.Gold);

      await expect(
        demetra.connect(otherUser).transferFrom(user.address, owner.address, 1n),
      )
        .to.be.revertedWithCustomError(demetra, "ERC721InsufficientApproval")
        .withArgs(otherUser.address, 1n);

      expect(await demetra.ownerOf(1n)).to.equal(user.address);

      await (await demetra.connect(user).approve(otherUser.address, 1n)).wait();

      await expect(
        demetra.connect(otherUser).transferFrom(user.address, owner.address, 1n),
      )
        .to.emit(demetra, "Transfer")
        .withArgs(user.address, owner.address, 1n);

      expect(await demetra.ownerOf(1n)).to.equal(owner.address);
      expect(await demetra.balanceOf(user.address)).to.equal(0n);
      expect(await demetra.balanceOf(owner.address)).to.equal(1n);
      expect(await demetra.tokenURI(1n)).to.equal(goldURI);

      await expect(demetra.connect(user).requestMint())
        .to.be.revertedWithCustomError(demetra, "MintAlreadyRequested")
        .withArgs(user.address);

      expect(await demetra.totalRequested()).to.equal(1n);
    });

    it("Mantiene il diritto al tour al richiedente dopo il trasferimento", async function () {
      const fixture = await loadDemetra();
      const { demetra, user, otherUser, superGoldURI } = fixture;

      await mintFirstToken(fixture, user, FIRST_DRAW.SuperGold);

      await expect(
        demetra.connect(user).transferFrom(user.address, otherUser.address, 1n),
      )
        .to.emit(demetra, "Transfer")
        .withArgs(user.address, otherUser.address, 1n);

      expect(await demetra.ownerOf(1n)).to.equal(otherUser.address);
      expect(await demetra.tokenURI(1n)).to.equal(superGoldURI);
      expect(await demetra.hasTourAccess(user.address)).to.equal(true);
      expect(await demetra.hasTourAccess(otherUser.address)).to.equal(false);
    });

    it("Rifiuta tokenURI per un token assegnato ma non ancora ritirato", async function () {
      const fixture = await loadDemetra();
      const { demetra, user } = fixture;

      await requestNFT(demetra, user);
      await assignFirstToken(fixture, FIRST_DRAW.Essential);

      expect(await demetra.tokenVariant(1n)).to.equal(VARIANT.Essential);

      await expect(demetra.tokenURI(1n))
        .to.be.revertedWithCustomError(demetra, "ERC721NonexistentToken")
        .withArgs(1n);
    });
  });
});
