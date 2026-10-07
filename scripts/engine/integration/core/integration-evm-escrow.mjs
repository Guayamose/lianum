import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';

const ANVIL_HASH = '619d6f0ee33d6943a0698ab787296553f6c9614a8231a586f7d0babecc3388ab';
const SOLC_FILE = 'solc-windows-amd64-v0.8.37+commit.f401782d.exe';
const SOLC_HASH = '967743b2d12155f59a0ddf9410afe25c7deaa73f4fe3d33c4dc0739f627d9ec9';
const SOURCE = 'contracts/ExperimentalObserverEscrow.sol';
const FIXTURE = 'contracts/test/NaiveObserverEscrow.sol';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const hex = n => '0x' + BigInt(n).toString(16);
const word = value => {
  const raw = typeof value === 'string' && /^0x[0-9a-f]*$/i.test(value) ? value.slice(2) : BigInt(value).toString(16);
  assert.ok(raw.length <= 64 && /^[0-9a-f]+$/i.test(raw), 'bounded ABI word');
  return raw.padStart(64, '0');
};
const unwords = value => value.slice(2).match(/.{64}/g) ?? [];
const labelHash = label => '0x' + sha256(label);
const ZERO = '0x' + '00'.repeat(32);

async function compile() {
  const compilerPath = await pinnedBinary(SOLC_FILE, SOLC_HASH);
  const sources = Object.fromEntries(await Promise.all([SOURCE, FIXTURE].map(async path => [path, { content: await readFile(join(projectRoot, path), 'utf8') }])));
  const input = { language: 'Solidity', sources, settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } } } };
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const output = await new Promise((done, reject) => {
    const child = spawn(compilerPath, ['--standard-json'], { cwd: projectRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.on('error', reject);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', code => code === 0 ? done(JSON.parse(stdout)) : reject(new Error(`SOLC_EXIT_${code}: ${stderr}`)));
    child.stdin.end(JSON.stringify(input));
  });
  assert.deepEqual((output.errors ?? []).filter(e => e.severity === 'error'), [], 'compiler errors');
  return { input, output };
}

export async function runEvmEscrowIntegration() {
  const compilation = await compile();
  const binary = await pinnedBinary('foundry-v1.8.4-portable/anvil.exe', ANVIL_HASH);
  const cwd = await scratchDirectory('m2-escrow-');
  const port = await unusedLoopbackPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const processHandle = startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'cancun', '--timestamp', '1700000000', '--accounts', '6', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
  const rpc = (method, params) => ownedRuntimeRpc(endpoint, method, params);
  const transactions = [], checks = [], observations = [];
  const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks.push(label); };
  const waitReceipt = async hash => {
    for (let i = 0; i < 100; i++) { const receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) return receipt; await sleep(20); }
    throw new Error('LOCAL_RECEIPT_TIMEOUT');
  };
  const send = async (label, request, ok = true) => {
    const transactionHash = await rpc('eth_sendTransaction', [{ gas: '0x7a1200', ...request }]);
    const receipt = await waitReceipt(transactionHash);
    let revertReason;
    if (!ok) {
      const trace = await rpc('debug_traceTransaction', [transactionHash, { disableMemory: true, disableStack: true, disableStorage: true }]);
      const raw = trace.returnValue.replace(/^0x/, '');
      assert.ok(raw.startsWith('08c379a0'), `${label}: Solidity Error(string) expected`);
      const length = Number(BigInt('0x' + raw.slice(72, 136)));
      revertReason = Buffer.from(raw.slice(136, 136 + 2 * length), 'hex').toString('utf8');
    }
    transactions.push({ label, request, receipt, ...(revertReason ? { revertReason } : {}) });
    check(label, receipt.status, ok ? '0x1' : '0x0');
    return receipt;
  };
  const balance = async address => BigInt(await rpc('eth_getBalance', [address, 'latest']));
  const now = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { processHandle.assertAlive(); try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch {} await sleep(100); }
    assert.ok(ready, 'owned Anvil startup');
    const [owner, solver, observer, relayer, wrongSigner, deliveryRecipient] = await rpc('eth_accounts');
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    const artifact = name => compilation.output.contracts[name === 'ExperimentalObserverEscrow' ? SOURCE : FIXTURE][name];
    const deploy = async name => {
      const art = artifact(name);
      const args = name.endsWith('ObserverEscrow') ? word(observer) + word(2) : '';
      const receipt = await send(`deploy ${name}`, { from: owner, data: '0x' + art.evm.bytecode.object + args });
      return { address: receipt.contractAddress, art };
    };
    const competent = await deploy('ExperimentalObserverEscrow');
    const otherDomain = await deploy('ExperimentalObserverEscrow');
    const naive = await deploy('NaiveObserverEscrow');
    const reverting = await deploy('TestRevertingPayee');
    const reentering = await deploy('TestReenteringPayee');
    const calldata = (contract, method, args = [], dynamicHex) => {
      const selector = contract.art.evm.methodIdentifiers[method];
      assert.ok(selector, `ABI method ${method}`);
      let body = args.map(word).join('');
      if (dynamicHex !== undefined) {
        assert.match(dynamicHex, /^0x([0-9a-f]{2})*$/i);
        const raw = dynamicHex.slice(2);
        body += word((args.length + 1) * 32) + word(raw.length / 2) + raw.padEnd(Math.ceil(raw.length / 64) * 64, '0');
      }
      return '0x' + selector + body;
    };
    const call = async (contract, method, args = []) => rpc('eth_call', [{ to: contract.address, data: calldata(contract, method, args) }, 'latest']);
    const state = async (contract, id) => BigInt('0x' + unwords(await call(contract, 'inputs(bytes32)', [id]))[7]);
    const consumed = async tag => BigInt(await call(competent, 'consumedEffect(bytes32)', [tag])) === 1n;
    const configs = new Map();
    const open = async (contract, label, overrides = {}) => {
      const time = await now();
      const salt = labelHash(label);
      const config = { salt, id: await call(contract, 'deriveInputId(address,bytes32)', [owner, salt]), solver, amount: 100000n, terms: labelHash('explicit-test-quote-terms-v2'), executeBy: time + 1000, claimBy: time + 2000, ...overrides };
      await send(`open ${label}`, { from: owner, to: contract.address, value: hex(config.amount), data: calldata(contract, 'open(bytes32,address,bytes32,uint64,uint64)', [config.salt, config.solver, config.terms, config.executeBy, config.claimBy]) });
      configs.set(contract.address + config.id, config);
      return config;
    };
    const domainFields = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }];
    const certFields = [{ name: 'escrowId', type: 'bytes32' }, { name: 'solver', type: 'address' }, { name: 'amount', type: 'uint128' }, { name: 'terms', type: 'bytes32' }, { name: 'policyVersion', type: 'uint32' }, { name: 'executeBy', type: 'uint64' }, { name: 'claimBy', type: 'uint64' }, { name: 'observedAt', type: 'uint64' }, { name: 'effect0', type: 'bytes32' }, { name: 'effect1', type: 'bytes32' }];
    const sign = async (contract, config, effects, observedAt, overrides = {}, domainOverrides = {}, signer = observer) => {
      const typedData = { types: { EIP712Domain: domainFields, Fulfillment: certFields }, primaryType: 'Fulfillment', domain: { name: 'ExperimentalObserverEscrow', version: '2', chainId: 31337, verifyingContract: contract.address, ...domainOverrides }, message: { escrowId: config.id, solver: config.solver, amount: config.amount.toString(), terms: config.terms, policyVersion: 2, executeBy: config.executeBy, claimBy: config.claimBy, observedAt, effect0: effects[0], effect1: effects[1], ...overrides } };
      return rpc('eth_signTypedData_v4', [signer, JSON.stringify(typedData)]);
    };
    const claimData = (contract, config, effects, observedAt, signature) => calldata(contract, 'claim(bytes32,uint64,bytes32,bytes32,bytes)', [config.id, observedAt, ...effects], signature);
    const claim = (label, contract, config, effects, observedAt, signature, ok = true) => send(label, { from: relayer, to: contract.address, data: claimData(contract, config, effects, observedAt, signature) }, ok);
    const refund = (label, contract, config, ok = true, from = owner) => send(label, { from, to: contract.address, data: calldata(contract, 'refund(bytes32)', [config.id]) }, ok);

    // A competing sender copying the owner's salt creates only their own input.
    const targetSalt = labelHash('main');
    const ownerTargetId = await call(competent, 'deriveInputId(address,bytes32)', [owner, targetSalt]);
    const copiedSaltId = await call(competent, 'deriveInputId(address,bytes32)', [wrongSigner, targetSalt]);
    const copiedExecuteBy = await now() + 1000;
    const copiedClaimBy = copiedExecuteBy + 1000;
    await send('other owner copying target salt opens only own namespace', { from: wrongSigner, to: competent.address, value: hex(100000), data: calldata(competent, 'open(bytes32,address,bytes32,uint64,uint64)', [targetSalt, solver, labelHash('copied-salt-terms'), copiedExecuteBy, copiedClaimBy]) });
    check('copied public salt yields a different owner input id', copiedSaltId !== ownerTargetId, true);
    check('copying salt leaves intended owner id unoccupied', await state(competent, ownerTargetId), 0n);
    const main = await open(competent, 'main');
    await send('same owner cannot open same salt twice', { from: owner, to: competent.address, value: hex(main.amount), data: calldata(competent, 'open(bytes32,address,bytes32,uint64,uint64)', [main.salt, main.solver, main.terms, main.executeBy, main.claimBy]) }, false);
    const duplicate = await open(competent, 'duplicate-native-delivery');
    const replica = await open(otherDomain, 'main', { executeBy: main.executeBy, claimBy: main.claimBy });
    const recipientBefore = await balance(deliveryRecipient);
    const effects = [];
    for (const amountWei of [111n, 222n]) {
      const receipt = await send(`native delivery ${amountWei}`, { from: solver, to: deliveryRecipient, value: hex(amountWei), gas: '0x5208' });
      const canonical = `paeg-m2-native-value-v1\n31337\n${genesis.hash}\n${receipt.transactionHash}\n0`;
      const effectTag = '0x' + sha256(canonical);
      observations.push({ family: 'EVM_ONLY', canonical, effectTag, amountWei: amountWei.toString(), receipt });
      effects.push(effectTag);
    }
    check('native delivery recipient balance increased by 333 wei', await balance(deliveryRecipient) - recipientBefore, 333n);
    const observedAt = await now();
    const signature = await sign(competent, main, effects, observedAt);
    await claim('missing signature rejects', competent, main, effects, observedAt, '0x', false);
    await claim('wrong observer rejects', competent, main, effects, observedAt, await sign(competent, main, effects, observedAt, {}, {}, wrongSigner), false);
    await claim('cross-contract signature replay rejects', otherDomain, replica, effects, observedAt, signature, false);
    await claim('wrong chain domain rejects', competent, main, effects, observedAt, await sign(competent, main, effects, observedAt, {}, { chainId: 31338 }), false);
    await claim('wrong name domain rejects', competent, main, effects, observedAt, await sign(competent, main, effects, observedAt, {}, { name: 'OtherProtocol' }), false);
    await claim('wrong version domain rejects', competent, main, effects, observedAt, await sign(competent, main, effects, observedAt, {}, { version: '3' }), false);
    await claim('cross-escrow signature replay rejects', competent, duplicate, effects, observedAt, signature, false);
    for (const [field, value] of Object.entries({ solver: wrongSigner, amount: '100001', terms: labelHash('different-terms'), policyVersion: 3, executeBy: main.executeBy + 1, claimBy: main.claimBy + 1, observedAt: observedAt - 1, effect0: labelHash('different-effect') })) {
      await claim(`changed signed ${field} rejects`, competent, main, effects, observedAt, await sign(competent, main, effects, observedAt, { [field]: value }), false);
    }
    await claim('invalid signature v rejects', competent, main, effects, observedAt, signature.slice(0, -2) + '00', false);
    const order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    const highS = word(order - BigInt('0x' + signature.slice(66, 130)));
    await claim('malleable high-s signature rejects', competent, main, effects, observedAt, signature.slice(0, 66) + highS + (signature.endsWith('1b') ? '1c' : '1b'), false);
    await claim('zero effect rejects', competent, main, [ZERO, effects[1]], observedAt, await sign(competent, main, [ZERO, effects[1]], observedAt), false);
    await claim('repeated effect within certificate rejects', competent, main, [effects[0], effects[0]], observedAt, await sign(competent, main, [effects[0], effects[0]], observedAt), false);
    await claim('future observation rejects', competent, main, effects, main.executeBy + 1, await sign(competent, main, effects, main.executeBy + 1), false);
    await refund('premature refund rejects', competent, main, false);
    check('rejected claims leave input open', await state(competent, main.id), 1n);
    check('rejected claims leave both effects unconsumed', await Promise.all(effects.map(consumed)), [false, false]);
    const solverBefore = await balance(solver);
    const payReceipt = await claim('valid certificate pays', competent, main, effects, observedAt, signature);
    check('fixed solver receives exact input with gas paid by relayer', await balance(solver) - solverBefore, main.amount);
    check('paid state authoritative on EVM', await state(competent, main.id), 2n);
    check('both effects consumed in EVM registry', await Promise.all(effects.map(consumed)), [true, true]);
    await claim('same certificate same input replay rejects', competent, main, effects, observedAt, signature, false);
    await refund('refund after payout rejects', competent, main, false);
    const solverAfterValid = await balance(solver);
    const blockedReplayReceipt = await claim('fresh authorization cannot reuse native effects for second input', competent, duplicate, effects, observedAt, await sign(competent, duplicate, effects, observedAt), false);
    check('second input rejects specifically at canonical effect consumption', transactions.at(-1).revertReason, 'EFFECT_ALREADY_CONSUMED');
    await claim('swapping consumed effect order rejects', competent, duplicate, [...effects].reverse(), observedAt, await sign(competent, duplicate, [...effects].reverse(), observedAt), false);
    check('blocked double payout leaves solver balance unchanged', await balance(solver), solverAfterValid);
    check('blocked duplicate input remains open for refund', await state(competent, duplicate.id), 1n);

    // Strongly scoped signatures alone do not enforce conservation of deliveries.
    // The same two actual EVM deliveries authorize two fresh naive input IDs.
    const naive0 = await open(naive, 'naive-0');
    const naive1 = await open(naive, 'naive-1');
    const naiveObserved = await now();
    const naiveBefore = await balance(solver);
    const naiveReceipt0 = await claim('naive first input pays', naive, naive0, effects, naiveObserved, await sign(naive, naive0, effects, naiveObserved));
    const naiveReceipt1 = await claim('naive second input wrongly pays for same native effects', naive, naive1, effects, naiveObserved, await sign(naive, naive1, effects, naiveObserved));
    check('naive reused delivery pair produces two actual native payouts', await balance(solver) - naiveBefore, naive0.amount + naive1.amount);
    check('naive paid two independent input states', await Promise.all([state(naive, naive0.id), state(naive, naive1.id)]), [2n, 2n]);

    const rejectPay = await open(competent, 'rejecting-payee', { solver: reverting.address });
    const rejectEffects = [labelHash('reject-delivery-0'), labelHash('reject-delivery-1')];
    const rejectObserved = await now();
    const contractBeforeReject = await balance(competent.address);
    await claim('reverting payee reverts full settlement', competent, rejectPay, rejectEffects, rejectObserved, await sign(competent, rejectPay, rejectEffects, rejectObserved), false);
    check('reverting payee input remains open', await state(competent, rejectPay.id), 1n);
    check('reverting payee does not consume effects', await Promise.all(rejectEffects.map(consumed)), [false, false]);
    check('reverting payee preserves held input', await balance(competent.address), contractBeforeReject);

    const reentry = await open(competent, 'reentry', { solver: reentering.address });
    const reentryEffects = [labelHash('reentry-delivery-0'), labelHash('reentry-delivery-1')];
    const reentryObserved = await now();
    const reentrySig = await sign(competent, reentry, reentryEffects, reentryObserved);
    await send('configure adversarial payee with same claim', { from: owner, to: reentering.address, data: calldata(reentering, 'configure(address,bytes)', [competent.address], claimData(competent, reentry, reentryEffects, reentryObserved, reentrySig)) });
    await claim('reentrant payee receives once', competent, reentry, reentryEffects, reentryObserved, reentrySig);
    check('native callback attempted reentry', BigInt(await call(reentering, 'attempts()')), 1n);
    check('nested settlement rejected', BigInt(await call(reentering, 'reentrySucceeded()')), 0n);
    check('reentrant recipient exact amount once', BigInt(await call(reentering, 'received()')), reentry.amount);

    const expiry = await open(competent, 'expires');
    const expiryEffects = [labelHash('late-delivery-0'), labelHash('late-delivery-1')];
    const expiryObserved = await now();
    const expirySig = await sign(competent, expiry, expiryEffects, expiryObserved);
    const refusingOwnerSalt = labelHash('refusing-owner');
    const refusingOwnerId = await call(competent, 'deriveInputId(address,bytes32)', [reverting.address, refusingOwnerSalt]);
    await send('contract owner funds refund-failure fixture', { from: owner, to: reverting.address, value: hex(100000), data: calldata(reverting, 'openInput(address,bytes32,address,bytes32,uint64,uint64)', [competent.address, refusingOwnerSalt, solver, main.terms, expiry.executeBy, expiry.claimBy]) });
    await rpc('evm_setNextBlockTimestamp', [expiry.claimBy]);
    await claim('claim at exact claimBy rejects', competent, expiry, expiryEffects, expiryObserved, expirySig, false);
    check('expired claim not consumed', await Promise.all(expiryEffects.map(consumed)), [false, false]);
    await refund('non-owner refund rejects', competent, expiry, false, wrongSigner);
    const ownerBeforeRefund = await balance(owner);
    const refundReceipt = await refund('owner refund at or after deadline succeeds', competent, expiry);
    const refundGas = BigInt(refundReceipt.gasUsed) * BigInt(refundReceipt.effectiveGasPrice);
    check('refund returns exact held input less actual owner gas', await balance(owner) - ownerBeforeRefund + refundGas, expiry.amount);
    check('refunded state authoritative on EVM', await state(competent, expiry.id), 3n);
    await claim('payout after refund rejects', competent, expiry, expiryEffects, expiryObserved, expirySig, false);
    await refund('duplicate refund rejects', competent, expiry, false);
    await send('reverting owner refund reverts safely', { from: relayer, to: reverting.address, data: calldata(reverting, 'requestRefund(address,bytes32)', [competent.address, refusingOwnerId]) }, false);
    check('failed refund remains open and held', await state(competent, refusingOwnerId), 1n);
    await refund('duplicate-delivery input recovers after timeout', competent, duplicate);
    await refund('failed solver payment input recovers after timeout', competent, rejectPay);
    await refund('copied-salt owner can only recover own input', competent, { id: copiedSaltId }, true, wrongSigner);
    check('competent escrow conservation: only refusing-owner input still held', await balance(competent.address), 100000n);
    check('native foreign-like deliveries never rolled back', await balance(deliveryRecipient) - recipientBefore, 333n);

    return {
      schemaVersion: 2, recordedAt: new Date().toISOString(), status: 'VERIFIED_LOCAL_EVM_COMPONENT_ONLY',
      runtime: { name: 'Anvil', version: '1.8.4', binarySHA256: ANVIL_HASH, chainId: 31337, hardfork: 'cancun', genesisHash: genesis.hash },
      compiler: { version: '0.8.37+commit.f401782d.Windows.msvc', binarySHA256: SOLC_HASH, officialURL: `https://binaries.soliditylang.org/windows-amd64/${SOLC_FILE}`, inputSHA256: sha256(JSON.stringify(compilation.input)), settings: compilation.input.settings, warnings: compilation.output.errors ?? [], sources: Object.fromEntries(Object.entries(compilation.input.sources).map(([path, source]) => [path, sha256(source.content)])), bytecodeSHA256: Object.fromEntries(['ExperimentalObserverEscrow', 'NaiveObserverEscrow', 'TestRevertingPayee', 'TestReenteringPayee'].map(name => [name, sha256(Buffer.from(artifact(name).evm.bytecode.object, 'hex'))])) },
      contracts: { competent: competent.address, otherDomain: otherDomain.address, naive: naive.address, revertingPayee: reverting.address, reenteringPayee: reentering.address },
      syntheticActors: { owner, solver, observer, relayer, wrongSigner, deliveryRecipient },
      checks: { count: checks.length, passed: checks }, observations, transactions,
      adversarial: { reusedResources: effects, competentPayment: payReceipt.transactionHash, competentDoublePaymentRejected: blockedReplayReceipt.transactionHash, naiveActualPayments: [naiveReceipt0.transactionHash, naiveReceipt1.transactionHash], naiveTotalPayoutWei: (naive0.amount + naive1.amount).toString(), competentTotalPayoutForSamePairWei: main.amount.toString(), assumptions: 'Pinned observer signs two different scoped input certificates for the same canonical delivery pair. Registry prevents that specific over-credit even if observer repeats honest effect identities. A lying observer can still invent or alias effects; not a malicious-observer solution.' },
      isolation: { processId: processHandle.child.pid, freshRandomSyntheticAccounts: true, bindAddress: '127.0.0.1', p2p: false, forkUrl: false, externalRpc: false, userKeysRead: false, ownProcessStoppedInFinally: true, scratchRemovedInFinally: true },
      limits: ['Real local EVM contract execution only; no Solana, Bitcoin verifier, triple-chain MVP acceptance or public-chain consensus test.', 'Transparent competent baseline. Public effect tags, input IDs, payees, amounts and timing leak links; certificates group two effects.', 'Observer truth, canonical tags, semantic dependency and foreign finality are trusted. Synthetic tags in failure fixtures are assertions, not native receipt verification.', 'Consumption authority is this contract only; no universal inter-contract effect registry.', 'Certificate authentication is EIP-712/secp256k1, not a global ZK proof.', 'Single-chain ledger atomicity covers escrow state/payment, not rollback of already confirmed native deliveries.', 'Experimental unaudited code; no production deployment or security claim.'],
    };
  } finally { await stopOwnProcess(processHandle); await removeOwnScratch(cwd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runEvmEscrowIntegration();
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence/m2-evm-escrow-local.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ status: evidence.status, checks: evidence.checks.count, transactions: evidence.transactions.length, evidence: 'evidence/m2-evm-escrow-local.json' }));
  } catch (error) { console.error('M2 EVM escrow integration failed:', error.stack); process.exitCode = 1; }
}
