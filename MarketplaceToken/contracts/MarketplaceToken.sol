// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MarketplaceToken is ERC20 {
    address public owner;
    uint256 public constant discountPercent = 5;

    mapping(address => bool) public isPartner;

    constructor(uint256 initialSupply) ERC20("Marketplace Discount Token", "MDT") {
        require(initialSupply > 0, "Initial supply must be greater than zero");
        owner = msg.sender; // Сохраняем адрес создателя контракта
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        require(amount > 0, "Transfer amount must be greater than zero");

        // Начисляем скидку только если отправитель не является партнёром
        if (!isPartner[msg.sender]) {
            uint256 discount = (amount * discountPercent) / 100;
            super.transfer(recipient, amount-discount);
        } else{
            super.transfer(recipient, amount);
        }
        return true;
    }

    function checkBalance(address user) public view returns (uint256) {
        return balanceOf(user);
    }

    function addPartner(address partner) external {
        require(msg.sender == owner, "Only owner can add partners");
        isPartner[partner] = true;
    }

    function removePartner(address partner) external {
        require(msg.sender == owner, "Only owner can remove partners");
        isPartner[partner] = false;
    }
}