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

| Variante         | Rarità     | Quantità massima |
| ---------------- | ---------- | ---------------: |
| Urban Essential  | Comune     |               70 |
| Urban Gold       | Rara       |               25 |
| Urban Super Gold | Molto rara |                5 |

Ogni wallet potrà effettuare una sola richiesta di mint accettata.
Trasferire il proprio NFT non consentirà di richiederne un altro.

Il mint sarà gratuito, escluso il gas delle transazioni di richiesta e ritiro.
L’assegnazione delle varianti richiede una transazione aggiuntiva,
pagata da chi la esegue. I costi del servizio Chainlink VRF sono finanziati
da Demetra.

## Premi

- Urban Essential: accesso a contenuti esclusivi sulla produzione
  e sulle tecniche di design delle calzature.
- Urban Gold: sconto del 20% sugli acquisti Demetra.
- Urban Super Gold: diritto a un tour presso l’azienda.

L’accesso ai contenuti Essential e lo sconto Gold seguiranno
il possesso attuale dell’NFT della rispettiva variante.
I premi saranno descritti nei metadati; l’erogazione concreta richiederà
le integrazioni indicate negli sviluppi futuri.

Il diritto al tour viene invece registrato per il wallet che ha richiesto
il mint e ricevuto l’assegnazione Super Gold.
Resta a quel wallet anche dopo il trasferimento del token.
Sono assegnabili al massimo 5 tour, uno per ogni assegnazione Super Gold.
Il listener implementato segnala queste assegnazioni a Demetra nel terminale.

## Scelte tecniche

### Hardhat

Hardhat viene utilizzato per compilare i contratti Solidity,
eseguire i test e gestire il deploy sulla rete di test Sepolia.

I test e gli script sono scritti in TypeScript. Mocha esegue i casi di test,
Chai verifica i risultati ed Ethers.js permette di interagire con il contratto.

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

È stato scelto il modello subscription.
La sottoscrizione sarà finanziata da Demetra con ETH di Sepolia.

La richiesta utilizza:

| Parametro              | Funzione                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| `Coordinator`            | Contratto Chainlink che riceve la richiesta e consegna la risposta |
| `subscriptionId`       | Identificativo del conto che paga il servizio                      |
| `keyHash`              | Identificativo della configurazione VRF e della gas lane           |
| `requestConfirmations` | Conferme richieste prima della risposta                            |
| `callbackGasLimit`     | Budget di gas per eseguire la callback                             |
| `NUM_WORDS`            | Quantità di numeri casuali richiesti, fissata a `1`                |
| `NATIVE_PAYMENT`       | Pagamento in ETH dalla subscription, impostato a `true`            |

Ogni `requestId` viene collegato al wallet e al token prenotato:
questo consente di gestire le risposte anche se arrivano
in ordine diverso dalle richieste.

La ricezione del numero casuale è separata dall’assegnazione della variante.
Le risposte vengono salvate quando arrivano, mentre le varianti vengono
assegnate seguendo l’ordine dei `tokenId` prenotati. In questo modo,
l’ordine di arrivo delle risposte non cambia l’ordine delle assegnazioni.

### IPFS

Le tre immagini e i tre JSON dei metadati sono pubblicati su IPFS
tramite Pinata. La loro visualizzazione è stata verificata attraverso
i collegamenti forniti dal servizio.

Ogni JSON contiene nome, descrizione, immagine, variante, rarità,
provenienza dei materiali, produzione artigianale, storia del design
e descrizione del premio.

Gli indirizzi IPFS dei JSON vengono forniti al costruttore durante
il deploy e non sono modificabili attraverso funzioni del contratto.
Il costruttore rifiuta URI vuoti.

## DURB: richiesta, casualità, assegnazione e ritiro

### 1. Richiesta

L’utente chiama `requestMint`. Il contratto verifica che il wallet
non abbia già richiesto un NFT, che ci siano posti disponibili
e che il Coordinator configurato coincida con quello iniziale
fissato al deploy.

Prenota quindi un `tokenId` e invia la richiesta al Coordinator VRF.
Il `requestId` restituito viene associato al wallet e al token.
L’evento `AcceptedMintRequest` segnala la richiesta accettata.
Se la transazione fallisce, anche la prenotazione viene annullata.

### 2. Ricezione della casualità

Il risultato arriva in una transazione successiva.
La base Chainlink verifica che il chiamante sia il Coordinator
attualmente configurato. Il nostro contratto controlla inoltre
che coincida con `initialVrfCoordinator`, fissato al deploy
e non modificabile.

`fulfillRandomWords` salva il numero casuale e segna la richiesta
come soddisfatta, senza assegnare ancora la variante.
Il mapping `randomnessReady` indica che la risposta è disponibile,
anche quando il numero ricevuto è zero.
L’evento `RandomnessReceived` segnala la ricezione.

### 3. Assegnazione ordinata

Chiunque può chiamare `assignVariants(maxTokens)`, pagando il gas
della transazione. Il parametro `maxTokens` accetta valori da `1` a `100`
e indica il numero massimo di token da elaborare nella stessa transazione.

Il contratto elabora i token nell’ordine di prenotazione, partendo da
`nextTokenToAssign`. Se la risposta VRF del prossimo token non è ancora
disponibile, si ferma senza saltarlo.

Per ogni token con casualità disponibile, assegna la variante
in base al numero salvato e alle quantità rimaste.
Aggiorna le disponibilità ed emette `VariantAssigned`.
Per `Variant.Gold` emette anche `GoldAssigned`;
per `Variant.SuperGold` registra il diritto al tour
ed emette `TourAssigned`.

Il `tokenId` identifica l’NFT e va da 1 a 100: non determina
la variante. Anche il primo NFT può essere Super Gold.

La variante viene scelta tramite `randomIndex`, calcolato come
`numero casuale % totale delle disponibilità rimaste`.
Alla prima assegnazione gli indici 0–69 corrispondono a Essential,
70–94 a Gold e 95–99 a Super Gold.

Dopo ogni assegnazione, gli intervalli vengono aggiornati in base
alle quantità rimaste. Gli indici vengono riutilizzati:
non sono identificativi degli NFT né posti che restano occupati.
Completando tutte le 100 assegnazioni si ottengono esattamente
70 Essential, 25 Gold e 5 Super Gold.

`maxTokens` limita quanti token elaborare nella singola transazione,
con un valore compreso tra `1` e `100`.
Se manca la risposta del prossimo token, l’elaborazione si ferma.
L’NFT non è ancora creato.

### 4. Ritiro

Il richiedente chiama `claimNFT` indicando il `tokenId` prenotato.
Il contratto verifica che il chiamante sia il richiedente originale,
che la variante sia assegnata e che il token non sia già stato ritirato.

Incrementa quindi `totalMinted`, crea l’NFT con `_safeMint`
di OpenZeppelin ed emette `SuccessfulMint`.
Se il ritiro fallisce, vengono annullate le modifiche della transazione,
compreso l’incremento di `totalMinted`. La prenotazione e la variante
restano registrate, consentendo un nuovo tentativo.

La separazione protegge la ricezione VRF e l’assegnazione da eventuali
errori durante la ricezione dell’NFT. Richiesta e ritiro richiedono
due transazioni dell’utente. L’assegnazione richiede una transazione
separata, eseguibile anche da Demetra.

### Contatori

- `totalRequested`: richieste accettate, sia in attesa sia già elaborate.
- `totalMinted`: NFT effettivamente creati.
- `nextTokenToAssign`: prossimo token da elaborare nell’assegnazione ordinata.

Una prenotazione occupa un posto anche prima del ritiro.

## Listener degli eventi

Lo script `scripts/listen-events.ts` ascolta gli eventi del contratto
e mostra nel terminale le informazioni utili a Demetra.
L’indirizzo viene letto dalla variabile d’ambiente
`DEMETRA_CONTRACT_ADDRESS`.

Sono monitorati `AcceptedMintRequest`, `GoldAssigned`, `TourAssigned`,
`SuccessfulMint` e `Transfer`. Per `Transfer` vengono esclusi i mint
e mostrati i cambi di possessore degli NFT di tutte le varianti.
Il trasferimento di un Super Gold non trasferisce il diritto al tour.

`GoldAssigned` segnala il richiedente che ha ottenuto la variante:
per verificare lo sconto occorre comunque controllare il possessore attuale.

Sono monitorati anche `RandomnessReceived`, che segnala la ricezione
della casualità, e `VariantAssigned`, che segnala l’assegnazione
della variante prima del ritiro.

## Limiti del prototipo

### Una richiesta per indirizzo, non per persona

Una persona può utilizzare più wallet e ottenere più prenotazioni,
consumando posti disponibili e fondi della subscription VRF.
Il contratto limita le richieste per indirizzo, senza identificare
la persona che lo controlla.

### Sostituzione del Coordinator

La libreria Chainlink permette al proprietario del contratto
o al Coordinator attuale di sostituire il Coordinator configurato.
Il nostro contratto rifiuta nuove richieste se il Coordinator è diverso
da quello iniziale e rifiuta risposte provenienti dal sostituto.

Questa protezione impedisce al sostituto di fornire numeri arbitrari
per le assegnazioni, ma la sostituzione può interrompere il servizio.

### Attesa delle risposte VRF

L’assegnazione segue l’ordine di prenotazione per impedire
che l’ordine di arrivo delle risposte influenzi la variante
assegnata a ciascun utente. Infatti, ogni assegnazione modifica
le quantità disponibili per quelle successive.

Questa scelta privilegia la correttezza dell’assegnazione:
se una risposta precedente manca o la callback fallisce,
anche le assegnazioni successive restano bloccate.
Non sono previsti salti o nuove estrazioni.

Occorre quindi finanziare la subscription e configurare correttamente
i parametri VRF, in particolare il gas della callback.

## Test locali

La suite di `DemetraUrban` comprende 26 test, tutti superati.
I test usano il mock di Chainlink VRF con una sottoscrizione finanziata
in ETH simulati. Il mock permette di scegliere i numeri restituiti
e di far arrivare le risposte in un ordine diverso da quello delle richieste.

La suite verifica il flusso dalla richiesta al ritiro, il limite di una
richiesta per wallet e la distribuzione delle 100 assegnazioni:
70 Essential, 25 Gold e 5 Super Gold. Copre inoltre trasferimenti,
metadati, risposte VRF non autorizzate o duplicate e tentativi di doppio ritiro.

Per ripetere i controlli, eseguire dalla cartella del progetto:

```powershell
npm run compile
npm run typecheck
npx hardhat test mocha test/DemetraUrban.ts
```

Risultato atteso: `26 passing`.

I test verificano che il contratto emetta gli eventi attesi.
La ricezione di tutti e sette i tipi di evento monitorati è stata
verificata anche attraverso il listener su un nodo Hardhat locale,
inclusi i trasferimenti di tutte e tre le varianti.

La revisione manuale della sicurezza non costituisce un audit indipendente.

## Demo locale e verifica dei listener

La demo permette di osservare l’intero flusso attraverso tre NFT:
Essential, Gold e Super Gold. Utilizza una blockchain Hardhat locale
e il mock di Chainlink VRF, senza spendere fondi reali.

Tutti i comandi vanno eseguiti dalla cartella del progetto.

### 1. Avviare il nodo locale

Nel primo terminale:

```powershell
npx hardhat node --network hardhatMainnet
```

Lasciare il terminale aperto durante tutta la prova.

### 2. Distribuire i contratti

Nel terzo terminale:

```powershell
npx hardhat run scripts/deploy-local.ts --network localhost
```

Lo script distribuisce il mock VRF, crea e finanzia una subscription
con ETH simulati, distribuisce `DemetraUrban` e lo registra come consumer.

Copiare gli indirizzi stampati nelle variabili `demetraAddress`
e `coordinatorAddress` di `scripts/demo-local.ts`.

### 3. Avviare il listener

Nel secondo terminale, sostituire `INDIRIZZO_DEMETRA` con l’indirizzo
del contratto appena distribuito:

```powershell
$env:DEMETRA_CONTRACT_ADDRESS = "INDIRIZZO_DEMETRA"
npx hardhat run scripts/listen-events.ts --network localhost
```

Il listener resta attivo in attesa degli eventi.
La variabile d’ambiente vale per il terminale in cui viene impostata.

### 4. Eseguire la demo

Nel terzo terminale:

```powershell
npx hardhat run scripts/demo-local.ts --network localhost
```

Lo script esegue:

- Tre richieste di mint da wallet diversi.
- Le risposte del mock con i numeri `0`, `69` e `93`.
- L’assegnazione ordinata di Essential, Gold e Super Gold.
- Il ritiro dei tre NFT.
- Il trasferimento di tutti gli NFT a un altro wallet.

I `requestId` vengono recuperati dagli eventi delle singole transazioni.
I numeri sono scelti soltanto per verificare le tre varianti nella demo:
su Sepolia saranno forniti da Chainlink VRF.

Nel secondo terminale vengono mostrate le richieste, la ricezione
della casualità, le assegnazioni, i premi, i ritiri e i trasferimenti.
Il diritto al tour resta al richiedente premiato anche dopo il trasferimento.

### Ripetere la prova

La demo richiede una collezione senza richieste precedenti
e interrompe l’esecuzione se `totalRequested` è diverso da zero.

Per ripeterla dall’inizio, fermare il listener e il nodo con `Ctrl+C`,
riavviare il nodo e ripetere il deploy.
Aggiornare gli indirizzi negli script e nel terminale del listener
con quelli restituiti dal nuovo deploy.

Il listener mostra gli eventi ricevuti mentre è attivo:
lo script non implementa il recupero degli eventi storici.


## Deploy e verifica su Sepolia

- **Contratto:** [`0xbB79DC9cD92c2D169F77FAa847839840153728fD`](https://sepolia.etherscan.io/address/0xbB79DC9cD92c2D169F77FAa847839840153728fD#code)
- **Rete:** Ethereum Sepolia
- **Configurazione VRF:** Chainlink VRF v2.5, pagamento in ETH di Sepolia e limite di 500.000 gas per la callback.

Su Sepolia ho completato il flusso di richiesta, risposta di Chainlink,
assegnazione e ritiro per tre NFT: due Urban Essential e un Urban Gold.
Ho verificato proprietari e metadati IPFS, un trasferimento diretto
e un trasferimento del Gold eseguito da un wallet autorizzato tramite
`approve` e `transferFrom`. L'approvazione si è azzerata al cambio
di proprietà.

La variante Urban Super Gold e l'evento `TourAssigned` sono stati
verificati nella demo locale con il mock Chainlink.

### Transazioni di riferimento su Sepolia

| Operazione | Risultato verificato | Etherscan |
| --- | --- | --- |
| Deploy definitivo | Il contratto è stato distribuito con `callbackGasLimit` pari a `500_000`. | [Deploy](https://sepolia.etherscan.io/tx/0x3ba9b202c8eaab49762ce6dc53abd0fe4d87099ed62e8107fccd93aaf930aab8) |
| Trasferimento diretto — token #1 | Il wallet principale ha trasferito Urban Essential all’Account 2. | [Trasferimento diretto](https://sepolia.etherscan.io/tx/0xbad7ec4d4c1322876388b04a8596433f46ef7bc9900d82af484151259e839ec9) |
| Richiesta di mint — token #3 | L’Account 3 ha prenotato il token con `requestMint`. Il contratto ha emesso `AcceptedMintRequest`. | [Richiesta di mint](https://sepolia.etherscan.io/tx/0xda0bf401736577ac7ce999efd4501e5c4754fe8e3be9f8a30b0300769d6bc59b) |
| Risposta VRF — token #3 | Chainlink ha consegnato il numero casuale. Il contratto lo ha salvato ed emesso `RandomnessReceived`. | [Risposta VRF](https://sepolia.etherscan.io/tx/0x512239838673247e2b2b3cb7b4224606a2248f3c9ba41acb62d61c374050e152) |
| Assegnazione — token #3 | `assignVariants` ha assegnato Urban Gold ed emesso `VariantAssigned` e `GoldAssigned`. | [Assegnazione](https://sepolia.etherscan.io/tx/0x4d1f26dc768fb987f2cb5fcb0846f34c4fce69de752ce08326fcdfc9069c967c) |
| Ritiro — token #3 | L’Account 3 ha chiamato `claimNFT(3)`. Il contratto ha creato l’NFT nel suo wallet ed emesso `SuccessfulMint`. | [Ritiro](https://sepolia.etherscan.io/tx/0xcec679ce41f9dd0302caa8420f4668d708653543e8455039a7644ae61ed5cdc6) |
| Approvazione — token #3 | Con `approve`, l’Account 3 ha autorizzato l’Account 2 a trasferire il singolo NFT senza cedergli la proprietà. | [Approvazione](https://sepolia.etherscan.io/tx/0x5f669bfe5fc876dc6b323d28d45bb4d91510161ee5f3f921c3be03aec9fb46c6) |
| Trasferimento autorizzato — token #3 | L’Account 2 ha firmato `transferFrom`, spostando Urban Gold dall’Account 3 al wallet principale. L’approvazione si è azzerata al cambio di proprietà. | [Trasferimento autorizzato](https://sepolia.etherscan.io/tx/0xf8329b21f3934c4da09af1989e90b33d9280178fbf4391c8880c7cc5a06fa5a6) |

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
resterà al wallet che ha richiesto il mint e ottenuto Super Gold.
I recapiti saranno raccolti fuori dalla blockchain.
La prenotazione e la gestione dell’utilizzo del premio saranno
poi gestite dal reparto commerciale dell’azienda.

### Gestione dei destinatari incompatibili

Possibilità di consentire al richiedente di autorizzare il ritiro
verso un destinatario alternativo, qualora il proprio wallet
non sia in grado di ricevere NFT ERC-721.
