const GameItems = artifacts.require('GameItems');

module.exports = async function (deployer) {
  const initialHolder = tronWeb.defaultAddress.base58;
  await deployer.deploy(GameItems, initialHolder);
};
