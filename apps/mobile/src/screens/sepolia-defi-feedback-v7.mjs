const messages=Object.freeze({
  SEPOLIA_DEFI_PROPOSAL_TOKEN_FUNDS_REQUIRED:"The test funding account does not have enough of this investment’s USDC. No investment has been authorized. The service must replenish the correct test token before you continue.",
  MOBILE_PAGED_NOTE_EPOCH_TOO_SHORT:"There is little time left in the current network window. Preparation has not started. Wait at most three minutes and reauthorize the same entry or withdrawal.",
  SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED:"The investment is not yet available: you need to connect the fund reserve. Do not authorize or send another transaction to resolve it.",
  SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW:"The service needs to renew its temporary authorization before preparing this investment. No other transfer has been authorized.",
  SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT:"The quote exceeds the maximum allowed for this operation. Update the proposal or reduce the amount.",
  SEPOLIA_DEFI_PROPOSAL_MINIMUM_OUTPUT:"The quote does not cover the minimum USDC you have requested. Update the proposal before authorizing.",
  SEPOLIA_DEFI_PROPOSAL_LIQUIDITY:"The protocol does not have enough liquidity for this withdrawal. Your shares are still in their original custody.",
  SEPOLIA_DEFI_PROPOSAL_SHARE_LIMIT:"The amount exceeds the limit of this test connection. It reduces the stakes of the proposal.",
  MOBILE_SEPOLIA_DEFI_SOURCE_EXPIRED:"The investment budget permit has expired. You can consult the shares and their withdrawal; no other investment is authorized with this permit.",
  MOBILE_SEPOLIA_DEFI_PRIVATE_BUDGET_REQUIRED:"This investment needs test ETH on your private budget balance. Enable that balance before continuing.",
  MOBILE_SEPOLIA_DEFI_FUNDING_PENDING:"The test entry is still pending. Check the same entry before preparing another one.",
  PAGED_DEVICE_NOTE_EPOCH_REPROOF_REQUIRED:"The preparation of the entry has expired. The entry has not been completed. Check the same entry to prepare a new authorization.",
  MOBILE_SEPOLIA_DEFI_FUNDING_ALREADY_PENDING:"The balance or your deposit is already ready. Check your status; you do not need to repeat it.",
  MOBILE_SEPOLIA_DEFI_EXISTING_OPERATION:"This account retains an investment prepared. It continues the same operation to maintain its budget and reception.",
  MOBILE_SEPOLIA_DEFI_ALREADY_AUTHORIZED:"The investment already has an authorization on the server. Please check its progress without reauthorizing it.",
  MOBILE_SEPOLIA_DEFI_ORIGINAL_SEND_PENDING:"The server retains the original operation pending confirmation. Please check its progress before authorizing or sending another one.",
  MOBILE_SEPOLIA_DEFI_PREPARATION_EXPIRED:"The saved investment request has passed its original authorization deadline. Its budget and history are preserved; do not repeat the deposit. Recovery must check that original request before preparing another investment.",
  MOBILE_SEPOLIA_DEFI_EXECUTION_WINDOW:"The deadline for this test connection is too short. The service must renew its authorization before preparing the investment.",
  MOBILE_AUTHENTICATION_CANCELLED:"You can check the same operation anytime you want.",
  MOBILE_SEPOLIA_DEFI_RECIPIENT:"Enter a valid Ethereum address to receive USDC in Sepolia.",
  NATIVE_ADDRESS_INVALID:"The address is not valid for Ethereum. Check the full address before continuing.",
  DEVICE_DEFI_OPERATION_FLOW_INVALID:"Review the amount and its decimals before preparing the proposal.",
});
export function deviceSepoliaDefiFeedbackV7(error,proposal=false){
  return error instanceof Error&&messages[error.message]||(proposal
    ?"It has not been possible to prepare the proposal; no investment or withdrawal has been authorized."
    :"The answer is not confirmed. Check this same operation before authorizing or sending another one.");
}
