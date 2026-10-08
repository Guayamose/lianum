export function localNoteHexBytesV1(value: string, width?: number): Uint8Array;
export function localNoteUintBytesV1(value: string, width?: number): Uint8Array;
export type LocalBalanceOpeningV1 = Readonly<{ type: 4; rho: string; x: string; y: string; value: string; secret: string }>;
export function localBalanceCommitmentMessageV1(scope: string, policy: string, note: LocalBalanceOpeningV1): Uint8Array;
export function localBalanceDepositMessageV1(statement: Readonly<{ scope: string; policy: string; epoch: string; amount: string; output: string }>): Uint8Array;
export function localBalanceWithdrawalMessageV1(statement: Readonly<{ scope: string; policy: string; commitment: string; recipient: string; amount: string; epoch: string }>): Uint8Array;
export function localDepositIntentMessageV1(statement: Readonly<{ scope: string; policy: string; validFrom: string; validUntil: string; amount: string; output: string }>): Uint8Array;
