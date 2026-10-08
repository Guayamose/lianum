/** Public framing examples only. These fabricated hashes carry no original
 * session, account, custody, proof, signing or economic observation authority. */
import { ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2 }
  from '@lianum/mobile-protocol/original-account-v2';
export function originalAccountFramesV2({ devicePublicKey, action = 'read', now = Date.now() }) {
  const access = { version: 2, profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, origin: 'https://original.example',
    pairingId: '1'.repeat(64), challengeId: '2'.repeat(64), nonce: '3'.repeat(64),
    expiresAt: now + 60_000, devicePublicKey, action };
  const binding = { accountIdentitySHA256: '4'.repeat(64), originalAccountLifetime: '5'.repeat(64), generationId: '6'.repeat(64),
    requestId: 'original_request_0051', kind: 'TOP_UP', ownerOperationRef: '7'.repeat(64), assetId: '8'.repeat(64),
    ownerIdentitySHA256: '9'.repeat(64), keyScopeSHA256: 'a'.repeat(64), processIdentitySHA256: 'b'.repeat(64),
    originalProcessGeneration: 1, observedProcessGeneration: 2, originalReviewSHA256: 'c'.repeat(64), termsSHA256: 'd'.repeat(64),
    requestBindingSHA256: 'e'.repeat(64), assetBindingSHA256: 'f'.repeat(64), journalRevision: 10,
    requestState: 'UNKNOWN', authorityStage: 'UNKNOWN', submission: { transactionHash: 'a1'.repeat(32),
      calldataSHA256: 'b1'.repeat(32), dispatchLatched: true },
    asset: { chainId: '31337', genesis: 'c1'.repeat(32), pool: 'd1'.repeat(20), kind: 'NATIVE',
      token: '0'.repeat(40), symbol: 'ETH', decimals: 18 }, amountAtomic: '100', recipient: 'e1'.repeat(20), role: null,
    custody: 'LINUX_ORIGINAL_OWNER_CUSTODY', publicNetwork: false, mobileNoteCustody: false, economicObservation: false };
  const review = { ...access, profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2, challengeId: '12'.repeat(32),
    nonce: '13'.repeat(32), bootstrapChallengeId: access.challengeId, binding };
  return { access, review };
}
