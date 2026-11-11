// Creo Demo su un nodo Hardhat locale: riproduce richiesta, risposta VRF,assegnazione, ritiro e trasferimento per tutte e tre le varianti.
// Uso il mock di Chainlink per ottenere Essential, Gold e Super Gold in una sola esecuzione, senza dipendere da un'estrazione reale.

import { network } from "hardhat";

const { ethers } = await network.create();
// Uso gli indirizzi stampati da deploy-local.ts
const demetraAddress = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
const coordinatorAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";

const demetra = await ethers.getContractAt("DemetraUrban", demetraAddress);

const coordinator = await ethers.getContractAt(
  "VRFCoordinatorV2_5Mock",
  coordinatorAddress,
);

const [, essentialUser, goldUser, superGoldUser, recipient] =
  await ethers.getSigners();

// Demo da eseguire una sola volta su una collezione locale nuova.
if ((await demetra.totalRequested()) !== 0n) {
  throw new Error(
    "La demo richiede una collezione nuova: riavvia il nodo e rifai il deploy locale.",
  );
}

const participants = [
  { signer: essentialUser, tokenId: 1n, randomNumber: 0n }, // Essential
  { signer: goldUser, tokenId: 2n, randomNumber: 69n }, // Gold
  { signer: superGoldUser, tokenId: 3n, randomNumber: 93n }, // Super Gold
];

// Prenoto i token e recupero il requestId dall'evento della transazione.
for (const participant of participants) {
  const requestTx = await demetra.connect(participant.signer).requestMint();
  const receipt = await requestTx.wait();

  if (!receipt) {
    throw new Error("Ricevuta della richiesta non disponibile");
  }

  const requests = await demetra.queryFilter(
    demetra.filters.AcceptedMintRequest(),
    receipt.blockNumber,
    receipt.blockNumber,
  );

  const requestEvent = requests.find(
    (event) => event.transactionHash === receipt.hash,
  );

  if (!requestEvent) {
    throw new Error("Evento AcceptedMintRequest non trovato");
  }

  // Il mock permette di scegliere il numero soltanto per la prova locale.
  const responseTx = await coordinator.fulfillRandomWordsWithOverride(
    requestEvent.args.requestId,
    demetraAddress,
    [participant.randomNumber],
  );
  await responseTx.wait();

  console.log(
    "Richiesta e risposta VRF completate per il token:",
    participant.tokenId.toString(),
  );
}

// Le varianti vengono assegnate nell'ordine dei token prenotati.
const assignmentTx = await demetra.assignVariants(3n);
await assignmentTx.wait();

console.log("Le tre varianti sono state assegnate");

// Ogni richiedente ritira il proprio NFT.
for (const participant of participants) {
  const claimTx = await demetra
    .connect(participant.signer)
    .claimNFT(participant.tokenId);

  await claimTx.wait();
}

console.log("I tre NFT sono stati ritirati");

// Trasferisco tutte le varianti al destinatario.
for (const participant of participants) {
  const transferTx = await demetra
    .connect(participant.signer)
    .transferFrom(
      participant.signer.address,
      recipient.address,
      participant.tokenId,
    );

  await transferTx.wait();
}

console.log("I tre NFT sono stati trasferiti a:", recipient.address);
