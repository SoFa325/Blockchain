const MarketplaceToken = artifacts.require("MarketplaceToken");

module.exports = function (deployer) {
    deployer.deploy(MarketplaceToken, 1000000); // Выпускаем 1 000 000 MDT
};
