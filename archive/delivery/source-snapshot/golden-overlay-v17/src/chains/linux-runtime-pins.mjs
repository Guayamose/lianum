// Official Linux x86_64 artifacts verified in docs/LINUX-RUNTIMES-014.md.
// Binary content is checked again before each native execution.
export const linuxRuntimePins = Object.freeze({
  anvil: ['foundry-v1.8.4/anvil', 'be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176'],
  bitcoin: ['bitcoin-v31.1/bitcoin-31.1/bin/bitcoind', '986e63b3c8770f08d0059820ad3dd085d1ab9e1bea23946c243f858a06888a08'],
  cli: ['bitcoin-v31.1/bitcoin-31.1/bin/bitcoin-cli', '4e3a0fde23ec768a61cdd193602be937b29b6e8f21bcb614af87a2786bf86034'],
  solc: ['solc-linux-amd64-v0.8.37+commit.f401782d', '5de843c2c93563cc66425c99a4fb13fdbf32b4c4ae07469480faaf126e14404a'],
});
