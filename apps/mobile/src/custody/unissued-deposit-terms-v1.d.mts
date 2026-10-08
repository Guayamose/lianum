export type LocalDepositChoiceV1 = Readonly<{ relation: 'D26'; epoch: string }>
  | Readonly<{ relation: 'D27'; validFrom: string; validUntil: string }>;
export type LocalDepositStatementV1 = Readonly<{ scope: string; policy: string; amount: string; output: string }>
  & (Readonly<{ epoch: string }> | Readonly<{ validFrom: string; validUntil: string }>);
export type LocalUnissuedDepositNoteV1 = Readonly<{ scope: string; policy: string; pool: string; recipient: string;
  commitment: string; amount: string; status: 'UNISSUED'; availableBalance: null; nativeEffectsEstablished: false }>;
export function normalizeLocalDepositChoiceV1(input: LocalDepositChoiceV1): LocalDepositChoiceV1;
export function localUnissuedDepositStatementV1(note: LocalUnissuedDepositNoteV1, input: LocalDepositChoiceV1): LocalDepositStatementV1;
export function localUnissuedDepositFrameV1(note: LocalUnissuedDepositNoteV1, input: LocalDepositChoiceV1): Uint8Array;
