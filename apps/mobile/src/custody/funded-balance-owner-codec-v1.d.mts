import type { LocalBalanceOpeningV1 } from './balance-note-codec-v1.mjs';
export type LocalFundedNodeV1 = { id: string; chainDomain: string; evidencePolicy: string; actionCommitment: string;
  dependsOn: string[]; payout: { x: string; y: string; value: string; secret: string; randomness: string } };
export type LocalFundedStatementV1 = { profile: 'LIANUM_PAEG_FUNDED_4_V1'; scope: string; policy: string; asset: string;
  operationId: string; inputCommitment: string; inputNullifier: string; reservationIntent: string;
  graphCommitment: string; treeRoot: string; reserveCommitment: string; reserveNullifier: string;
  changeCommitment: string; outputs: readonly string[]; recoveryCommitment: string;
  fundingNotBefore: string; fundingValidUntil: string; settleBefore: string };
export type LocalFundedInputV1 = { scope: string; policy: string; asset: string; operationId: string; budget: string;
  fundingNotBefore: string; fundingValidUntil: string; settleBefore: string;
  reservationNonce: string; reserveSecret: string; graphNonce: string;
  inputNote: LocalBalanceOpeningV1; changeNote: LocalBalanceOpeningV1; recoveryNote: LocalBalanceOpeningV1;
  nodes: LocalFundedNodeV1[]; paddingSalts: string[] };
export type LocalFundedProposalV1 = Pick<LocalFundedInputV1, 'scope' | 'policy' | 'asset' | 'operationId' | 'budget' | 'fundingNotBefore' | 'fundingValidUntil' | 'settleBefore' | 'nodes'>;
export function normalizeLocalFundedProposalV1(raw: unknown): LocalFundedProposalV1;
export function localFundedSpendNullifierV1(scope: string, commitment: string, secret: string): string;
export function localFundedAuthorizationWordsV1(statement: LocalFundedStatementV1): string[];
export function localFundedOwnerFrameV1(statement: LocalFundedStatementV1): Uint8Array;
export function localFundedInvoiceFrameV1(statement: LocalFundedStatementV1,
  node: { chainDomain: string; evidencePolicy: string; actionCommitment: string; payoutCommitment: string }, slot: number): Uint8Array;
export function compileLocalFundedBalanceGraphV1(input: LocalFundedInputV1): {
  authorizationStatement: LocalFundedStatementV1; admissionTag: string;
  ownerWitness: { budget: string; reservationNonce: string; reserveSecret: string;
    inputNote: LocalBalanceOpeningV1; changeNote: LocalBalanceOpeningV1; recoveryNote: LocalBalanceOpeningV1;
    payouts: (LocalBalanceOpeningV1 & { randomness: string })[]; paddingSalts: string[];
    graph: { nonce: string; activeCount: number; treeRoot: string; leaves: string[];
      nodes: { id: string; chainDomain: string; evidencePolicy: string; actionCommitment: string;
        dependsOn: string[]; payoutCommitment: string; index: number; dependencyIndexes: number[];
        dependencyMask: number; salt: string; commitment: string }[] } };
};

export function localNativeTransferActionCommitmentV1(action: import('../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs').DeviceReservationActionV1): string;
