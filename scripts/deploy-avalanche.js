const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying PriceOracle to Avalanche Fuji (C-Chain)");
  const wallet = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  console.log("Deployer:", wallet.address);

  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle", wallet);
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  const contractAddress = await priceOracle.getAddress();
  console.log("✅ PriceOracle deployed:", contractAddress);

  // Print ownership and instructions to transfer
  const owner = await priceOracle.owner();
  console.log("Current owner:", owner);
  console.log("If not the NEAR-derived address, transfer ownership once you have it:");
  console.log("await priceOracle.transferOwnership('<NEAR_DERIVED_EVM_ADDRESS>')");

  return contractAddress;
}

main()
  .then((addr) => {
    console.log("Done:", addr);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });