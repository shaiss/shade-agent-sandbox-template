const hre = require("hardhat");

async function main() {
  console.log("💸 Transferring IOTX to final ac.proxy.proudbear01.testnet derived address");
  console.log("====================================================================");
  
  const fromAddress = "0x8D45053985C684D4AD9982e04Bc668AD6F83b2B6"; // Original funded wallet
  const toAddress = "0x47C06a158D6609CEb9A1E77c338635bCB5dBa25F";   // ac.proxy.proudbear01.testnet derived
  const transferAmount = hre.ethers.parseEther("1.0"); // Transfer 1 IOTX
  
  // Create wallet from private key
  const wallet = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  
  console.log("📋 Final Transfer Details:");
  console.log("  From (Original Wallet):", fromAddress);
  console.log("  To (ac.proxy.proudbear01.testnet):", toAddress);
  console.log("  Amount:", hre.ethers.formatEther(transferAmount), "IOTX");
  console.log("  Network:", hre.network.name);
  
  // Check balances before transfer
  const fromBalance = await hre.ethers.provider.getBalance(fromAddress);
  const toBalance = await hre.ethers.provider.getBalance(toAddress);
  
  console.log("\n💰 Balances Before Transfer:");
  console.log("  From Address:", hre.ethers.formatEther(fromBalance), "IOTX");
  console.log("  To Address:", hre.ethers.formatEther(toBalance), "IOTX");
  
  // Execute the transfer
  console.log("\n🚀 Executing final transfer...");
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: transferAmount,
  });
  
  console.log("Transaction submitted:", tx.hash);
  console.log("Waiting for confirmation...");
  
  // Wait for confirmation
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
  
  // Check balances after transfer
  const fromBalanceAfter = await hre.ethers.provider.getBalance(fromAddress);
  const toBalanceAfter = await hre.ethers.provider.getBalance(toAddress);
  
  console.log("\n💰 Balances After Transfer:");
  console.log("  From Address:", hre.ethers.formatEther(fromBalanceAfter), "IOTX");
  console.log("  To Address:", hre.ethers.formatEther(toBalanceAfter), "IOTX");
  
  console.log("\n=== Final Setup Summary ===");
  console.log("✅ Contract deployed:", "0xf3F4cb1D1775ab62c8f1CAAe3a5EE369D89DF910");
  console.log("✅ Contract owned by:", toAddress);
  console.log("✅ Derived address funded:", hre.ethers.formatEther(toBalanceAfter), "IOTX");
  console.log("✅ NEAR Account:", "ac.proxy.proudbear01.testnet");
  
  console.log("\n🎉 Complete IoTeX integration ready for testing!");
  console.log("Transaction Hash:", tx.hash);
  console.log("Explorer:", `https://testnet.iotexscan.io/tx/${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Transfer failed:", error);
    process.exit(1);
  });