// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract DemetraUrban is ERC721, VRFConsumerBaseV2Plus {
    uint256 public constant MAX_SUPPLY = 100;
    uint256 public constant ESSENTIAL_SUPPLY = 70;
    uint256 public constant GOLD_SUPPLY = 25;
    uint256 public constant SUPERGOLD_SUPPLY = 5;

    uint32 public constant NUM_WORDS = 1; // Quantità di numeri casuali richiesti a Chainlink VRF
    bool public constant NATIVE_PAYMENT = true; // Pagamento VRF con la valuta nativa

    uint256 public totalRequested; // Richieste di mint totali, sia completate sia in attesa
    uint256 public totalMinted; // Totale degli NFT creati
    uint256 public nextTokenToAssign = 1;

    uint256 public subscriptionId; // ID della sottoscrizione VRF
    bytes32 public keyHash; // Identifica gas lane VRF
    uint16 public requestConfirmations; // conferme richieste prima della risposta VRF
    uint32 public callbackGasLimit; // Gas disponibile per la callback VRF
    address public immutable initialVrfCoordinator;

    // URI IPFS dei metadati, uno per variante.
    string public essentialURI;
    string public goldURI;
    string public superGoldURI;

    enum Variant {
        Undefined, // Valore predefinito quando la variante non è ancora assegnata
        Essential,
        Gold,
        SuperGold
    }

    mapping(address => bool) public hasRequestedMint;
    mapping(uint256 => Variant) public tokenVariant;
    mapping(uint256 => uint256) public tokenRandomNumber;
    mapping(uint256 => bool) public randomnessReady;
    mapping(address => bool) public hasTourAccess;
    mapping(uint256 => address) public requestToSender; // Wallet associato alla richiesta mint e VRF
    mapping(uint256 => uint256) public requestToTokenId; // tokenId associato alla richiesta mint e VRF
    mapping(Variant => uint256) public remainingSupply;
    mapping(uint256 => bool) public requestFulfilled;
    mapping(uint256 => address) public tokenRequester;

    event GoldAssigned(address indexed sender, uint256 indexed tokenId);

    event TourAssigned(address indexed sender, uint256 indexed tokenId);

    event AcceptedMintRequest(
        uint256 indexed requestId,
        address indexed sender,
        uint256 indexed tokenId
    );

    event RandomnessReceived(
        uint256 indexed requestId,
        uint256 indexed tokenId,
        uint256 randomNumber
    );

    event VariantAssigned(
        uint256 indexed tokenId,
        address indexed sender,
        Variant indexed variant
    );

    event SuccessfulMint(
        uint256 indexed tokenId,
        address indexed sender,
        Variant indexed variant,
        uint256 randomNumber
    );

    error MintAlreadyRequested(address wallet);
    error MaxSupplyReached();
    error NotTokenRequester(uint256 tokenId);
    error VariantNotAssigned(uint256 tokenId);
    error NFTAlreadyClaimed(uint256 tokenId);
    error InvalidBatchSize();
    error EmptyMetadataURI();
    error CoordinatorChanged();

    constructor(
        address vrfCoordinator,
        uint256 vrfSubscriptionId,
        bytes32 vrfKeyHash,
        uint16 vrfRequestConfirmations,
        uint32 vrfCallbackGasLimit,
        string memory essentialMetadataURI,
        string memory goldMetadataURI,
        string memory superGoldMetadataURI
    )
        VRFConsumerBaseV2Plus(vrfCoordinator)
        ERC721("Demetra Urban", "DURB")
    {
        if (
            bytes(essentialMetadataURI).length == 0 ||
            bytes(goldMetadataURI).length == 0 ||
            bytes(superGoldMetadataURI).length == 0
        ) {
            revert EmptyMetadataURI();
        }

        initialVrfCoordinator = vrfCoordinator;
        subscriptionId = vrfSubscriptionId;
        keyHash = vrfKeyHash;
        requestConfirmations = vrfRequestConfirmations;
        callbackGasLimit = vrfCallbackGasLimit;

        remainingSupply[Variant.Essential] = ESSENTIAL_SUPPLY;
        remainingSupply[Variant.Gold] = GOLD_SUPPLY;
        remainingSupply[Variant.SuperGold] = SUPERGOLD_SUPPLY;

        essentialURI = essentialMetadataURI;
        goldURI = goldMetadataURI;
        superGoldURI = superGoldMetadataURI;
    }

    function requestMint() external {
        if (address(s_vrfCoordinator) != initialVrfCoordinator) {
            revert CoordinatorChanged();
        }
        if (hasRequestedMint[msg.sender]) {
            revert MintAlreadyRequested(msg.sender);
        }
        if (totalRequested >= MAX_SUPPLY) {
            revert MaxSupplyReached();
        }
        hasRequestedMint[msg.sender] = true;
        totalRequested++;

        uint256 tokenId = totalRequested; // tokenId prenotato prima di assegnazione casuale e del claim

        uint256 requestId = _requestRandomness();

        requestToSender[requestId] = msg.sender;
        requestToTokenId[requestId] = tokenId;
        tokenRequester[tokenId] = msg.sender;

        emit AcceptedMintRequest(requestId, msg.sender, tokenId);
    }

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomNumbers
    ) internal override {
        // Anche se il Coordinator configurato cambia, accettiamo solo quello iniziale.
        if (msg.sender != initialVrfCoordinator) {
            revert OnlyCoordinatorCanFulfill(msg.sender, initialVrfCoordinator);
        }

        if (
            requestToSender[requestId] == address(0) ||
            requestFulfilled[requestId] ||
            randomNumbers.length == 0
        ) {
            return;
        }

        uint256 tokenId = requestToTokenId[requestId];
        uint256 randomNumber = randomNumbers[0];

        // Salva la risposta senza assegnare ancora la variante.
        requestFulfilled[requestId] = true;
        tokenRandomNumber[tokenId] = randomNumber;
        randomnessReady[tokenId] = true;

        emit RandomnessReceived(requestId, tokenId, randomNumber);
    }

    function assignVariants(uint256 maxTokens) external {
        if (maxTokens == 0 || maxTokens > MAX_SUPPLY) {
            revert InvalidBatchSize();
        }

        uint256 processed;

        // Elaboro solo token consecutivi, nell'ordine di prenotazione.
        while (
            processed < maxTokens &&
            nextTokenToAssign <= totalRequested
        ) {
            uint256 tokenId = nextTokenToAssign;

            // Una risposta mancante blocca l'assegnazione dei token successivi.
            if (!randomnessReady[tokenId]) {
                break;
            }

            Variant assignedVariant = _selectVariant(tokenRandomNumber[tokenId]);
            address sender = tokenRequester[tokenId];

            remainingSupply[assignedVariant]--;
            tokenVariant[tokenId] = assignedVariant;

            if (assignedVariant == Variant.SuperGold) {
                // Il tour resta al richiedente e non segue il trasferimento.
                hasTourAccess[sender] = true;
            }

            nextTokenToAssign++;
            processed++;

            emit VariantAssigned(tokenId, sender, assignedVariant);

            if (assignedVariant == Variant.Gold) {
                emit GoldAssigned(sender, tokenId);
            } else if (assignedVariant == Variant.SuperGold) {
                emit TourAssigned(sender, tokenId);
            }
        }
    }

    function claimNFT(uint256 tokenId) external {
        if (tokenRequester[tokenId] != msg.sender) {
            revert NotTokenRequester(tokenId);
        }

        if (tokenVariant[tokenId] == Variant.Undefined) {
            revert VariantNotAssigned(tokenId);
        }

        if (_ownerOf(tokenId) != address(0)) {
            revert NFTAlreadyClaimed(tokenId);
        }

        totalMinted++;

        // Un fallimento del mint annulla anche l'incremento di totalMinted.
        _safeMint(msg.sender, tokenId);

        emit SuccessfulMint(
            tokenId,
            msg.sender,
            tokenVariant[tokenId],
            tokenRandomNumber[tokenId]
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Variant variant = tokenVariant[tokenId];

        if (variant == Variant.Essential) {
            return essentialURI;
        } else if (variant == Variant.Gold) {
            return goldURI;
        } else if (variant == Variant.SuperGold) {
            return superGoldURI;
        } else {
            revert VariantNotAssigned(tokenId);
        }
    }

    function _requestRandomness() private returns (uint256) {
        VRFV2PlusClient.RandomWordsRequest memory request;
        request.subId = subscriptionId;
        request.keyHash = keyHash;
        request.requestConfirmations = requestConfirmations;
        request.callbackGasLimit = callbackGasLimit;
        request.numWords = NUM_WORDS;
        request.extraArgs = VRFV2PlusClient._argsToBytes(
            VRFV2PlusClient.ExtraArgsV1({nativePayment: NATIVE_PAYMENT})
        );

        return s_vrfCoordinator.requestRandomWords(request);
    }

    function _selectVariant(uint256 randomNumber) private view returns (Variant) {
        uint256 essentialRemaining = remainingSupply[Variant.Essential];
        uint256 essentialPlusGold  = essentialRemaining + remainingSupply[Variant.Gold];
        uint256 totalRemaining = essentialPlusGold + remainingSupply[Variant.SuperGold];

        // Gli intervalli si riducono man mano che vengono assegnate le varianti.
        uint256 randomIndex = randomNumber % totalRemaining;

        if (randomIndex < essentialRemaining) {
            return Variant.Essential;
        }
        if (randomIndex < essentialPlusGold) {
            return Variant.Gold;
        }
        return Variant.SuperGold;
    }
}
