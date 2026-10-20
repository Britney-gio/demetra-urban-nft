// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";

contract DemetraUrban is ERC721, VRFConsumerBaseV2Plus {
    uint256 public constant MAX_SUPPLY = 100;
    uint256 public totalRequested; // Richieste di mint totali, sia completate sia in attesa
    uint256 public totalMinted; // Totale degli NFT creati

    enum Variant {
        Undefined, // Valore predefinito per i token non ancora creati
        Essential,
        Gold,
        SuperGold
    }

    uint256 public constant ESSENTIAL_SUPPLY = 70;
    uint256 public constant GOLD_SUPPLY = 25;
    uint256 public constant SUPERGOLD_SUPPLY = 5;

    mapping(address => bool) public hasRequestedMint;   
    mapping(uint256 => Variant) public tokenVariant;
    mapping(uint256 => uint256) public tokenRandomNumber; 
    mapping(address => bool) public hasTourAccess;
    mapping(uint256 => address) public requestToSender; // Wallet associato alla richiesta mint e VRF
    mapping(uint256 => uint256) public requestToTokenId; // tokenId associato alla richiesta mint e VRF
    mapping(Variant => uint256) public remainingSupply;
    mapping(uint256 => bool) public requestFulfilled;

    event TourAssigned(
        address indexed sender, 
        uint256 indexed tokenId
    ); // assegnazione del tour ai vincitori

    event AcceptedMintRequest(
        uint256 indexed requestId,
        address indexed sender,
        uint256 indexed tokenId
    ); // accettazione della richiesta di mint (NFT non ancora creato)

    event SuccessfulMint(
        uint256 indexed tokenId,
        address indexed sender,
        Variant indexed variant,
        uint256 randomNumber
    ); // mint completato con successo (NFT creato)

    error MintAlreadyRequested(address wallet);
    error MaxSupplyReached();  

    constructor(address vrfCoordinator) 
        VRFConsumerBaseV2Plus(vrfCoordinator) 
        ERC721("Demetra Urban", "DURB") {
        remainingSupply[Variant.Essential] = ESSENTIAL_SUPPLY;
        remainingSupply[Variant.Gold] = GOLD_SUPPLY;
        remainingSupply[Variant.SuperGold] = SUPERGOLD_SUPPLY;
    } 

    function requestMint() external {
        if (hasRequestedMint[msg.sender]) {
            revert MintAlreadyRequested(msg.sender);
        }
        if (totalRequested >= MAX_SUPPLY) {
            revert MaxSupplyReached();
        }
        hasRequestedMint[msg.sender] = true;
        totalRequested++;

        uint256 tokenId = totalRequested;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomNumbers) internal override {
        address sender = requestToSender[requestId]; 
        
        if (sender == address(0)) {
            return;
        }
        
        if (requestFulfilled[requestId]) {
            return;
        }

        if (randomNumbers.length == 0) {
            return;
        }

        uint256 randomNumber = randomNumbers[0]; 
        uint256 tokenId = requestToTokenId[requestId];

        uint256 totalRemaining = remainingSupply[Variant.Essential] + remainingSupply[Variant.Gold] + remainingSupply[Variant.SuperGold]; 

        if (totalRemaining == 0) {
            return;
        }

        uint256 randomIndex = randomNumber % totalRemaining;
        Variant assignedVariant;

        if(randomIndex < remainingSupply[Variant.Essential]) {
            assignedVariant = Variant.Essential;
        } else if(randomIndex < remainingSupply[Variant.Essential] + remainingSupply[Variant.Gold]) {
            assignedVariant = Variant.Gold;
        } else {
            assignedVariant = Variant.SuperGold;
        }
        requestFulfilled[requestId] = true;
        remainingSupply[assignedVariant]--;
        tokenVariant[tokenId] = assignedVariant;
        tokenRandomNumber[tokenId] = randomNumber;

        if(assignedVariant == Variant.SuperGold) {
            hasTourAccess[sender] = true;
            emit TourAssigned(sender, tokenId);
        }
    }
}
