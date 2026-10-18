// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract DemetraUrban is ERC721 {
    uint256 public constant MAX_SUPPLY = 100;

    enum Variant {
        Undefined,
        Essential,
        Gold,
        SuperGold
    }

    uint256 public constant ESSENTIAL_SUPPLY = 70;
    uint256 public constant GOLD_SUPPLY = 25;
    uint256 public constant SUPERGOLD_SUPPLY = 5;

    mapping(address => bool) public hasRequestedMint;
    uint256 public totalRequested; // Richieste di mint totali, sia completate sia in attesa
    uint256 public totalMinted; // Totale degli NFT creati
    mapping(uint256 => Variant) public tokenVariant;
    mapping(uint256 => uint256) public tokenRandomNumber; 
    mapping(address => bool) public hasTourAccess;
    mapping(uint256 => address) public requestToSender; // Wallet associato alla richiesta mint e VRF
    mapping(uint256 => uint256) public requestToTokenId; // tokenId associato alla richiesta mint e VRF
    mapping(Variant => uint256) public remainingSupply;

    event TourAssigned(
        address indexed winner, 
        uint256 indexed tokenId
    ); // assegnazione del tour ai vincitori

    event AcceptedMintRequest(
        uint256 indexed requestId,
        address indexed sender,
        uint256 indexed tokenId
    ); // accettazione della richiesta di mint (NFT non ancora creato)

    error MintAlreadyRequested(address wallet);
    error MaxSupplyReached();

    event SuccessfulMint(
        uint256 indexed tokenId,
        address indexed sender,
        Variant indexed variant,
        uint256 randomNumber
    ); // mint completato con successo (NFT creato)

    
    constructor() ERC721("Demetra Urban", "DURB") {
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


}
