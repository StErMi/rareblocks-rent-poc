// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";

// Fix this contract later on
// https://twitter.com/dillonraphael/status/1452616572896518156

contract RareBlocks is ERC721, ERC721Enumerable, Pausable, Ownable {
    using Counters for Counters.Counter;
    using Strings for uint256;

    string _baseTokenURI = "https://rareblocks.xyz/api/metadata/";
    uint256 private _price = 0.08 ether;

    uint256 RESERVED_FOUNDING_MEMBERS = 15;
    uint256 ACCESS_PASS_SUPPLY = 500;

    bool public preMintIsActive = false;
    bool public openMintIsActive = false;

    Counters.Counter private _tokenIdCounter;

    event Mint(address indexed _address, uint256 tokenId);

    mapping(address => uint8) private _allowList;

    constructor() ERC721("RareBlocks Access Pass", "RAREBLOCKS") {
        for (uint256 i = 0; i < RESERVED_FOUNDING_MEMBERS; i++) {
            _safeMint(msg.sender);
        }
    }

    function setAllowList(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            _allowList[addresses[i]] = 3;
        }
    }

    function setPreMintActive(bool _preMintIsActive) external onlyOwner {
        preMintIsActive = _preMintIsActive;
    }

    function setOpenMintActive(bool _openMintIsActive) external onlyOwner {
        openMintIsActive = _openMintIsActive;
    }

    function preMint(address _to, uint8 numberOfTokens) public payable whenNotPaused {
        require(preMintIsActive, "Premint is not active");
        require(_price * numberOfTokens <= msg.value, "Ether value sent is not correct");
        require(_tokenIdCounter.current() + numberOfTokens <= ACCESS_PASS_SUPPLY, "Can't mint over supply limit");
        require(numberOfTokens <= _allowList[_to], "Exceeded max available to purchase");

        _allowList[_to] -= numberOfTokens;

        for (uint256 i = 0; i < numberOfTokens; i++) {
            _tokenIdCounter.increment();
            _safeMint(_to, _tokenIdCounter.current());
            emit Mint(_to, _tokenIdCounter.current());
        }
    }

    function mint(address _to, uint8 numberOfTokens) public payable whenNotPaused {
        require(openMintIsActive, "Open mint is not active");
        require(_price * numberOfTokens <= msg.value, "Ether value sent is not correct");
        require(_tokenIdCounter.current() + numberOfTokens <= ACCESS_PASS_SUPPLY, "Can't mint over supply limit");
        require(numberOfTokens <= 3, "Cannot mint more than 3 time");

        for (uint256 i = 0; i < numberOfTokens; i++) {
            _tokenIdCounter.increment();
            _safeMint(_to, _tokenIdCounter.current());
            emit Mint(_to, _tokenIdCounter.current());
        }
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isAllowedToMint(address _address) external view returns (bool) {
        if (!preMintIsActive && !openMintIsActive) {
            return false;
        } else if (preMintIsActive && !openMintIsActive) {
            if (_allowList[_address] > 0) {
                return true;
            } else {
                return false;
            }
        } else if (preMintIsActive && openMintIsActive) {
            return true;
        } else if (openMintIsActive) {
            return true;
        } else {
            return false;
        }
    }

    function getPrice() external view returns (uint256) {
        return _price;
    }

    function getTokenCount() external view returns (uint256) {
        return _tokenIdCounter.current();
    }

    function getAccessPassSupply() external view returns (uint256) {
        return ACCESS_PASS_SUPPLY;
    }

    function setPrice(uint256 price) public onlyOwner {
        _price = price;
    }

    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        payable(msg.sender).transfer(balance);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function pause() public onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() public onlyOwner whenPaused {
        _unpause();
    }

    function _safeMint(address to) public onlyOwner {
        _tokenIdCounter.increment();

        _safeMint(to, _tokenIdCounter.current());
    }

    function setBaseURI(string memory baseURI) public onlyOwner {
        _baseTokenURI = baseURI;
    }

    function hasAccessPassToken(address wallet) public view returns (bool) {
        return balanceOf(wallet) > 0;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    // The following functions are overrides required by Solidity.
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
