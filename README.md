# Demetra Urban — DURB

## Obiettivo del progetto

Demetra Urban è una collezione NFT pensata come regalo promozionale
del brand di calzature sostenibili Demetra, per accompagnare il lancio
della nuova collezione Urban.
Il simbolo DURB unisce il nome Demetra al richiamo alla linea Urban.
Il progetto sperimenta un sistema di fidelizzazione nel quale ogni NFT
offre un premio diverso in base alla variante assegnata casualmente.

## Varianti e rarità

La collezione prevede un massimo di 100 NFT:

| Variante | Rarità | Quantità massima |
|---|---|---:|
| Urban Essential | Comune | 70 |
| Urban Gold | Rara | 25 |
| Urban Super Gold | Molto rara | 5 |

Ogni wallet potrà effettuare una sola richiesta di mint accettata.
Trasferire il proprio NFT non consentirà di richiederne un altro.
Il mint sarà gratuito, escluso il gas della transazione.
I costi del servizio Chainlink VRF saranno finanziati separatamente.
Ogni NFT avrà un tokenId unico. Gli NFT della stessa variante
condivideranno immagine e metadati.

## Premi

- Urban Essential: accesso a contenuti esclusivi sulla produzione
  e sulle tecniche di design delle calzature.
- Urban Gold: sconto del 20% sugli acquisti Demetra.
- Urban Super Gold: diritto a un tour presso l’azienda.

L’accesso ai contenuti Essential e lo sconto Gold seguiranno
il possesso attuale dell’NFT della rispettiva variante.
Il diritto al tour resterà invece al wallet che ha mintato
l’Urban Super Gold, anche dopo il trasferimento del token.

## Scelte tecniche

### Hardhat

Hardhat viene utilizzato per compilare i contratti Solidity,
eseguire i test e gestire il deploy sulla rete di test Sepolia.
Test e script saranno scritti in TypeScript con Mocha, Chai ed Ethers.js.

### OpenZeppelin Contracts

Il contratto eredita dall’implementazione ERC-721 di OpenZeppelin,
riutilizzando la gestione standard di proprietà, autorizzazioni
e trasferimenti.
Questa scelta riduce il codice da riscrivere e permette di concentrarsi
sulle regole specifiche di Demetra.

### Chainlink VRF e IPFS


## Implementazioni future

### Urban Essential — Contenuti esclusivi

Realizzazione di video e animazioni dedicati ai processi di produzione,
ai materiali sostenibili e alle tecniche di design delle calzature.
Una piattaforma dedicata verificherà il possesso di almeno un
Urban Essential e richiederà una firma per dimostrare il controllo
del wallet prima di consentire l’accesso.

### Urban Gold — Utilizzo dello sconto

Integrazione con il negozio per applicare lo sconto del 20%.
Al momento dell’acquisto, il sistema verificherà sulla blockchain
che il cliente possieda almeno un Urban Gold. Una firma permetterà
di dimostrare il controllo del wallet.
Lo sconto sarà riutilizzabile finché il requisito di possesso
sarà rispettato.

### Urban Super Gold — Gestione del tour

Realizzazione di un modulo attraverso cui il vincitore potrà
comunicare a Demetra i propri recapiti e organizzare il tour.
Il sistema verificherà il diritto registrato nel contratto e,
tramite una firma, il controllo del wallet premiato.
Non sarà necessario possedere ancora l’NFT, perché il diritto
resterà al wallet che lo ha mintato.
I recapiti saranno raccolti fuori dalla blockchain.
La prenotazione e la gestione dell’utilizzo del premio saranno
poi gestite dal reparto commerciale dell'azienda.