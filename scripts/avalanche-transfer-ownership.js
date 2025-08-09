const hre = require("hardhat");

// Usage:
//   NEW_OWNER=0x... npx hardhat run scripts/avalanche-transfer-ownership.js --network fuji
// or
//   npx hardhat run scripts/avalanche-transfer-ownership.js --network fuji 0x...
async function main() {
  let newOwner = process.argv.find((a) => a.startsWith("0x"));
  if (!newOwner) newOwner = process.env.NEW_OWNER;
  if (!newOwner || !newOwner.startsWith("0x") || newOwner.length !== 42) {
    console.error("Provide NEW_OWNER (0x...) via env or as last arg");
    process.exit(1);
  }

  const contractAddress = "0xE06Afdf580021DD475cd280D4ae4BB519314a995"; // Fuji deployed PriceOracle
  const wallet = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  console.log("Deployer:", wallet.address);
  console.log("Transferring ownership of", contractAddress, "to", newOwner);

  const abi = [
    "function owner() view returns (address)",
    "function transferOwnership(address newOwner) external"
  ];

  const contract = new hre.ethers.Contract(contractAddress, abi, wallet);
  const current = await contract.owner();
  console.log("Current owner:", current);
  if (current.toLowerCase() === newOwner.toLowerCase()) {
    console.log("Already owned by target address. Nothing to do.");
    return;
  }

  const tx = await contract.transferOwnership(newOwner);
  console.log("Submitted:", tx.hash);
  const rcpt = await tx.wait();
  console.log("Confirmed in block:", rcpt.blockNumber);
  const updated = await contract.owner();
  console.log("New owner:", updated);
}

main().catch((e) => { console.error(e); process.exit(1); });