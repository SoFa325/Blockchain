// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13; // Указываем версию компилятора

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MarketplaceToken is ERC20 {
    address public owner;
    uint256 public constant discountPercent = 5; // 5% скидки

    mapping(address => uint256) public discounts; // Сохранение скидок пользователей

    constructor(uint256 initialSupply) ERC20("Marketplace Discount Token", "MDT") {
        require(initialSupply > 0, "Initial supply must be greater than zero"); // Проверяем, что initialSupply > 0
        owner = msg.sender;
        _mint(msg.sender, initialSupply * 10 ** decimals()); // Создаем токены с учетом 18 знаков
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        require(amount > 0, "Transfer amount must be greater than zero"); // Проверка корректности перевода

        uint256 discount = (amount * discountPercent) / 100;
        discounts[recipient] += discount; // Добавляем скидку получателю

        super.transfer(recipient, amount);
        return true;
    }

    function getDiscount(address user) public view returns (uint256) {
        return discounts[user]; // Возвращаем текущую скидку пользователя
    }

    function checkBalance(address user) public view returns (uint256) {
    return balanceOf(user);
}
}
