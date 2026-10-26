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
Il mint sarà gratuito, escluso il gas delle transazioni di richiesta e ritiro. I costi del servizio Chainlink VRF sono finanziati da Demetra.
Ogni NFT avrà un tokenId unico. Gli NFT della stessa variante
condivideranno immagine e metadati.

## Premi

- Urban Essential: accesso a contenuti esclusivi sulla produzione
  e sulle tecniche di design delle calzature.
- Urban Gold: sconto del 20% sugli acquisti Demetra.
- Urban Super Gold: diritto a un tour presso l’azienda.

L’accesso ai contenuti Essential e lo sconto Gold seguiranno
il possesso attuale dell’NFT della rispettiva variante.
I premi saranno descritti nei metadati; l'erogazione concreta richiederà le integrazioniindicate negli sviluppi futuri.
Il diritto al tour viene invece registrato per il wallet che ha richiesto il mint e ricevuto l'assegnazione Super Gold. Resta a quel wallet anche dopo il trasferimento del token. 
Sono assegnabili al massimo 5 tour, uno per ogni DURB Super Gold. Il listener previsto segnalerà queste assegnazioni a Demetra.

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

### Chainlink VRF

Chainlink VRF v2.5 fornisce il numero casuale verificabile utilizzato
per assegnare la variante dell’NFT.
L’assegnazione considera le disponibilità rimaste e le aggiorna
dopo ogni estrazione, rispettando il limite di 70 Essential,
25 Gold e 5 Super Gold. Il numero casuale viene conservato
nel contratto ed è consultabile.
È stato scelto il modello subscription, che sarà finanziata
da Demetra con ETH di Sepolia.

La richiesta utilizza:
| Parametro | Funzione |
|---|---|
| Coordinator | Contratto Chainlink che riceve la richiesta e consegna la risposta |
| subscriptionId | Identificativo del conto che paga il servizio |
| keyHash | Identificativo della configurazione VRF e della gas lane |
| requestConfirmations | Conferme da attendere prima della risposta |
| callbackGasLimit | Budget di gas per eseguire la callback |
| NUM_WORDS | Quantità di numeri casuali richiesti, fissata a 1 |
| NATIVE_PAYMENT | Pagamento in ETH dalla subscription, impostato a true |

Ogni requestId viene collegato al wallet e al token prenotato:
questo consente di gestire le risposte anche se arrivano
in ordine diverso dalle richieste.

### IPFS

Immagini e metadati saranno conservati su IPFS (da completare)

## DURB: richiesta, casualità e ritiro

### 1. Richiesta

L’utente chiama requestMint. Il contratto verifica che il wallet
non abbia già richiesto un NFT e che ci siano posti disponibili.
Prenota quindi un tokenId e invia la richiesta al Coordinator VRF.
Il requestId restituito viene associato al wallet e al token.
L’evento AcceptedMintRequest segnala la richiesta accettata.
Se la transazione fallisce, anche la prenotazione viene annullata.

### 2. Assegnazione casuale

Il risultato arriva in una transazione successiva.
La base Chainlink verifica che il chiamante sia il Coordinator
autorizzato e richiama fulfillRandomWords, implementata
nel contratto DemetraUrban.
La callback recupera la richiesta, assegna la variante
e salva il numero casuale. In caso di Super Gold, registra
il diritto al tour ed emette TourAssigned.
In questa fase l’NFT non è ancora creato.

### 3. Ritiro

Il richiedente chiama claimNFT indicando il tokenId prenotato.
Il contratto verifica che il chiamante sia il richiedente originale,
che la variante sia assegnata e che il token non sia già stato ritirato.
Incrementa quindi totalMinted, crea l’NFT con _safeMint
di OpenZeppelin ed emette SuccessfulMint.
Se il ritiro fallisce, vengono annullate le modifiche della transazione,
compreso l’incremento di totalMinted. La prenotazione e la variante
restano registrate, consentendo un nuovo tentativo.

La separazione protegge l’assegnazione VRF da eventuali errori
durante la ricezione dell’NFT. Richiesta e ritiro richiedono
due transazioni dell’utente, entrambe con costo di gas.

### Contatori

- totalRequested: richieste accettate, sia in attesa sia già elaborate.
- totalMinted: NFT effettivamente creati.

Una prenotazione occupa un posto anche prima del ritiro.


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

### Gestione dei destinatari incompatibili

Possibilità di consentire al richiedente di autorizzare il ritiro
verso un destinatario alternativo, qualora il proprio wallet
non sia in grado di ricevere NFT ERC-721.