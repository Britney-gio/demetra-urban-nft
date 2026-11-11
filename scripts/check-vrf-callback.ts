// Diagnostica del primo deploy su Sepolia: la callback VRF era fallita con un callbackGasLimit di 300.000. Questo script è stato creato per simulare la callback di Chainlink e verificare il limite di gas necessario per il nuovo deploy.

// La simulazione falliva a 325.000 gas e riusciva a 400.000. Ho quindi scelto un limite di 500.000 per il nuovo deploy, dove la risposta reale di Chainlink è andata a buon fine.

import { network } from "hardhat";

const { ethers } = await network.create();

const abi = new ethers.Interface([
  "function rawFulfillRandomWords(uint256 requestId, uint256[] randomWords)",
  "error OnlyCoordinatorCanFulfill(address have, address want)",
]);

const requestId =
  31893248179394629427090777525364174002728311561134275317842977088967603463498n;

const data = abi.encodeFunctionData("rawFulfillRandomWords", [
  requestId,
  [1n], // Valore di prova: non è il risultato VRF originale.
]);

try {
  await ethers.provider.send("eth_call", [
    {
      from: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
      to: "0xE4D3459fc4153EC0692A35DEE39ACc32d3c3FDa1",
      data,
      gas: ethers.toQuantity(400_000),
    },
    ethers.toQuantity(12_110_517), // Blocco prima del fulfillment.
  ]);

  console.log("Simulazione riuscita");
} catch (error) {
  const err = error as {
    code?: number;
    message?: string;
    data?: unknown;
  };

  const message = err.message?.replace(/https?:\/\/[^\s"'<>]+/g, "[URL RPC]");

  console.log("Codice:", err.code ?? "sconosciuto");
  console.log("Messaggio:", message ?? "non disponibile");

  if (typeof err.data === "string" && err.data.startsWith("0x")) {
    console.log("Dati di errore:", err.data);

    try {
      const decoded = abi.parseError(err.data);
      if (decoded) console.log("Errore decodificato:", decoded.name);
    } catch {
      // Il selettore non è presente nell'ABI di diagnostica.
    }
  }
}
