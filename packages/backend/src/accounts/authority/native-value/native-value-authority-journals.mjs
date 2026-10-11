/** Private views over one authenticated account journal. Only the owner sees
 * the Vault record and password. Every mutation still uses its guarded CAS. */
import { copy, immutable } from '@lianum/engine/accounts/journal';

export function createNativeValueAccountJournals({ readRecord, write }) {
  const rows = field => immutable(readRecord().data[field] ?? []);
  function table(field, identity) {
    return Object.freeze({
      rows: () => rows(field),
      async append(value) {
        const retained = copy(value);
        await write(data => ({ ...data, [field]: [...(data[field] ?? []), retained] }));
      },
      async patch(id, fields) {
        const retained = copy(fields);
        await write(data => ({ ...data, [field]: (data[field] ?? []).map(row =>
          row[identity] === id ? { ...row, ...retained } : row) }));
      },
    });
  }
  function profile(field) {
    return {
      profile: () => readRecord().data[field],
      async installProfile(value) { await write(data => ({ ...data, [field]: value })); },
    };
  }
  const quotes = table('deviceReservationQuotes', 'quoteId');
  return Object.freeze({
    deposits: Object.freeze({ ...table('deviceDeposits', 'jobId'), ...profile('devicePrivateD26Profile'),
      workerProfile: () => readRecord().data.deviceNativePrivateWorkerProfile,
      async installWorkerProfile(value) {
        await write(data => ({ ...data, deviceNativePrivateWorkerProfile: value }));
      },
    }),
    reservations: Object.freeze({ ...table('deviceReservations', 'jobId'), ...profile('devicePrivateUProfile'),
      quotes: quotes.rows, appendQuote: quotes.append,
    }),
    withdrawals: Object.freeze({ ...table('deviceExits', 'jobId'), ...profile('devicePrivateW39Profile') }),
    operations: table('operations', 'ownerOperationRef'),
  });
}
