const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying Final PriceOracle for ac.proxy.proudbear01.testnet");
  console.log("==========================================================");
  
  const correctDerivedAddress = "0x47C06a158D6609CEb9A1E77c338635bCB5dBa25F";
  
  const wallet = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  
  console.log("📋 Deployment Details:");
  console.log("  NEAR Account: ac.proxy.proudbear01.testnet");
  console.log("  Derived IoTeX Address:", correctDerivedAddress);
  console.log("  Deploying with wallet:", wallet.address);
  
  // Deploy the contract
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle", wallet);
  console.log("Deploying PriceOracle...");
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  
  const contractAddress = await priceOracle.getAddress();
  console.log("✅ PriceOracle deployed to:", contractAddress);
  
  // Transfer ownership to the correct derived address
  console.log("🔄 Transferring ownership to ac.proxy.proudbear01.testnet derived address...");
  const transferTx = await priceOracle.transferOwnership(correctDerivedAddress);
  await transferTx.wait();
  
  // Verify the transfer
  const newOwner = await priceOracle.owner();
  console.log("✅ New owner:", newOwner);
  
  if (newOwner.toLowerCase() === correctDerivedAddress.toLowerCase()) {
    console.log("🎉 Success! Contract deployed and ownership transferred");
    
    console.log("\n=== Final Contract Details ===");
    console.log("Contract Address:", contractAddress);
    console.log("Owner (ac.proxy.proudbear01.testnet):", newOwner);
    console.log("Explorer:", `https://testnet.iotexscan.io/address/${contractAddress}`);
    
    console.log("\n📝 Configuration Updates Needed:");
    console.log("1. Update src/utils/iotex.ts:");
    console.log(`   export const iotexContractAddress = "${contractAddress}";`);
    
    console.log("\n💰 Funding Required:");
    console.log("Send ~0.1 IOTX to:", correctDerivedAddress);
    console.log("Explorer:", `https://testnet.iotexscan.io/address/${correctDerivedAddress}`);
    
    return contractAddress;
  } else {
    console.log("❌ Ownership transfer failed");
    return null;
  }
}

main()
  .then((contractAddress) => {
    if (contractAddress) {
      console.log(`\n🎉 Final deployment completed!`);
      console.log(`Contract: ${contractAddress}`);
      console.log(`Ready for ac.proxy.proudbear01.testnet Shade Agent!`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });