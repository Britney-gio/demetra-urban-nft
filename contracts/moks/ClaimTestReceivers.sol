// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

// Creo contratti di supporto per testare il ritiro degli NFT tramite claimNFT.
// Il primo non può ricevere l'NFT: verifichiamo che il ritiro fallisca senza perdere la variante già assegnata.
// Il secondo tenta un nuovo ritiro dello stesso token durante _safeMint: verifichiamo che il doppio ritiro sia bloccato e che il primo riesca.


// Ai contratti di prova basta conoscere queste due funzioni di Demetra.
interface IDemetraClaim {
    function requestMint() external;
    function claimNFT(uint256 tokenId) external;
}

contract IncompatibleClaimReceiver {
    IDemetraClaim public immutable demetra;

    constructor(address demetraAddress) {
        demetra = IDemetraClaim(demetraAddress);
    }

    // Per Demetra, il richiedente è questo contratto:
    // è lui a chiamare requestMint, anche se il test ha avviato la chiamata.
    function requestMint() external {
        demetra.requestMint();
    }

    function claimNFT(uint256 tokenId) external {
        demetra.claimNFT(tokenId);
    }

    // Manca apposta onERC721Received: il ritiro tramite _safeMint fallirà.
}

contract ReentrantClaimReceiver is IncompatibleClaimReceiver {
    bool public attemptedReentry;
    bool public reentrySucceeded;
    bytes4 public reentryError;

    constructor(address demetraAddress)
        IncompatibleClaimReceiver(demetraAddress)
    {}

    // Demetra chiama questa funzione durante _safeMint.
    // Ci serve solo tokenId, quindi lasciamo senza nome gli altri parametri.
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        require(msg.sender == address(demetra));

        // Proviamo a rientrare una sola volta, anche se il secondo claim riuscisse.
        if (!attemptedReentry) {
            attemptedReentry = true;

            try demetra.claimNFT(tokenId) {
                reentrySucceeded = true;
            } catch (bytes memory reason) {
                // I primi 4 byte identificano l'errore ricevuto.
                reentryError = bytes4(reason);
            }
        }

        // Accettiamo l'NFT, così il claim originale può completarsi.
        return this.onERC721Received.selector;
    }
}