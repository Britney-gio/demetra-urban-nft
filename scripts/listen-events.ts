// Creo script per ascoltare gli eventi del contratto  e mostrare a Demetra i dati utili.
import { network } from "hardhat";

const { ethers } = await network.create();

const contractAddress = process.env.DEMETRA_CONTRACT_ADDRESS; // Indirizzo contratto

if (!contractAddress) {
  throw new Error("Imposta la variabile DEMETRA_CONTRACT_ADDRESS");
}

// ABI dagli artifact generati compilando DemetraUrban.
const demetraContract = await ethers.getContractAt(
  "DemetraUrban",
  contractAddress,
);

// Collego il contratto al  provider
const demetra = demetraContract.connect(ethers.provider);

// Segnalo l'assegnazione Gold; lo sconto segue il possesso dopo il claim.
await demetra.on(demetra.filters.GoldAssigned(), (sender, tokenId) => {
  console.log(
    "Urban Gold assegnato: sconto disponibile dopo il ritiro dell'NFT",
  );
  console.log("Wallet:", sender);
  console.log("Token ID:", tokenId.toString());
});

// Segnalo vincita tour, che resta al wallet premiato anche dopo il trasferimento.
await demetra.on(demetra.filters.TourAssigned(), (sender, tokenId) => {
  console.log("SuperGold assegnato e Tour vinto");
  console.log("Tour vinto dal Wallet:", sender);
  console.log("Token ID:", tokenId.toString());
});

// Seguo i cambi di possessore dei soli Gold usando l'evento ereditato da ERC-721.
await demetra.on(demetra.filters.Transfer(), async (from, to, tokenId) => {
  if (from === ethers.ZeroAddress) {
    return;
  }

  try {
    const variant = await demetra.tokenVariant(tokenId);

    // Nell'enum Solidity, Gold corrisponde a 2;
    if (variant === 2n) {
      console.log("Urban Gold trasferito");
      console.log("Da:", from);
      console.log("A:", to);
      console.log("Token ID:", tokenId.toString());
    }
  } catch (error) {
    console.error(
      "Errore nella verifica della variante del token:",
      tokenId.toString(),
      error,
    );
  }
});

// Segnalo la richiesta accettata
await demetra.on(
  demetra.filters.AcceptedMintRequest(),
  (requestId, sender, tokenId) => {
    console.log("Richiesta di mint accettata: in attesa di Chainlink VRF");
    console.log("ID Richiesta:", requestId.toString());
    console.log("Wallet:", sender);
    console.log("Token ID:", tokenId.toString());
  },
);

// Segnalo la creazione dell'NFT
await demetra.on(
  demetra.filters.SuccessfulMint(),
  (tokenId, sender, variant, randomNumber) => {
    console.log("NFT DURB ritirato");
    console.log("Token ID:", tokenId.toString());
    console.log("Wallet:", sender);
    console.log("Variante DURB:", variant.toString());
    console.log(
      "Random number per assegnazione variante:",
      randomNumber.toString(),
    );
  },
);
