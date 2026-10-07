// M3 transparent EVM-only semantic settlement experiment. Never a foreign-chain adapter.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';
import { TERMS_FIELDS, RESULT_FIELDS, typedResult, typedInvalidation, quoteOutput, termsFromEvmWorkflow, evmDomain, recipientCommitment, requestCommitment, observeNativeEvmTransfer } from '../src/settlement.mjs';

const ANVIL_HASH = '619d6f0ee33d6943a0698ab787296553f6c9614a8231a586f7d0babecc3388ab';
const SOLC_FILE = 'solc-windows-amd64-v0.8.37+commit.f401782d.exe';
const SOLC_HASH = '967743b2d12155f59a0ddf9410afe25c7deaa73f4fe3d33c4dc0739f627d9ec9';
const SOURCE = 'contracts/SemanticObserverEscrow.sol';
const M2_SOURCE = 'contracts/ExperimentalObserverEscrow.sol';
const FIXTURE = 'contracts/test/NaiveObserverEscrow.sol';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const hex = n => '0x' + BigInt(n).toString(16);
const word = value => {
  const raw = typeof value === 'string' && /^0x[0-9a-f]*$/i.test(value) ? value.slice(2) : BigInt(value).toString(16);
  assert.ok(raw.length <= 64 && /^[0-9a-f]+$/i.test(raw), 'bounded ABI word');
  return raw.padStart(64, '0');
};
const labelHash = label => '0x' + sha256(label);
const ZERO = '0x' + '00'.repeat(32);

// Only static scalar/tuple arguments and explicit bytes blobs are needed here.
// This encodes ABI data; hashing/signing use standard runtime primitives.
function encodeArgs(args) {
  const staticWords = value => Array.isArray(value) ? value.flat(Infinity).map(word).join('') : word(value);
  const isBytes = value => value && !Array.isArray(value) && typeof value === 'object' && Object.hasOwn(value, 'bytes');
  const headBytes = args.reduce((sum, value) => sum + (isBytes(value) ? 32 : staticWords(value).length / 2), 0);
  let head = '', tail = '';
  for (const value of args) {
    if (!isBytes(value)) { head += staticWords(value); continue; }
    assert.match(value.bytes, /^0x([0-9a-f]{2})*$/i);
    const raw = value.bytes.slice(2);
    head += word(headBytes + tail.length / 2);
    tail += word(raw.length / 2) + raw.padEnd(Math.ceil(raw.length / 64) * 64, '0');
  }
  return head + tail;
}

async function compile() {
  const compilerPath = await pinnedBinary(SOLC_FILE, SOLC_HASH);
  const sources = Object.fromEntries(await Promise.all([SOURCE, M2_SOURCE, FIXTURE].map(async path => [path, { content: await readFile(join(projectRoot, path), 'utf8') }])));
  const input = { language: 'Solidity', sources, settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.methodIdentifiers'] } } } };
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const output = await new Promise((done, reject) => {
    const child = spawn(compilerPath, ['--standard-json'], { cwd: projectRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.on('error', reject);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`SOLC_EXIT_${code}: ${stderr}`));
      try { done(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
  assert.deepEqual((output.errors ?? []).filter(e => e.severity === 'error'), [], 'compiler errors');
  return { input, output };
}

export async function runEvmSemanticIntegration() {
  const adapterSourceHash = sha256(await readFile(join(projectRoot, 'src/settlement.mjs')));
  const compilation = await compile();
  const binary = await pinnedBinary('foundry-v1.8.4-portable/anvil.exe', ANVIL_HASH);
  const cwd = await scratchDirectory('m3-semantic-');
  const port = await unusedLoopbackPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const handle = startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'cancun', '--timestamp', '1700000000', '--accounts', '7', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
  const rpc = (method, params) => ownedRuntimeRpc(endpoint, method, params);
  const transactions = [], observations = [], checks = [], authorizations = [], rejectedObservations = [], signedResults = [], signedInvalidations = [];
  const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks.push(label); };
  const now = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const balance = async who => BigInt(await rpc('eth_getBalance', [who, 'latest']));
  const hash = data => rpc('web3_sha3', [data]);
  const waitReceipt = async tx => {
    for (let i = 0; i < 100; i++) { const receipt = await rpc('eth_getTransactionReceipt', [tx]); if (receipt) return receipt; await sleep(20); }
    throw new Error('LOCAL_RECEIPT_TIMEOUT');
  };
  const send = async (label, request, expectedReason) => {
    const txHash = await rpc('eth_sendTransaction', [{ gas: '0x7a1200', ...request }]);
    const receipt = await waitReceipt(txHash);
    const ok = expectedReason === undefined;
    check(label, receipt.status, ok ? '0x1' : '0x0');
    let revertReason;
    if (!ok) {
      const trace = await rpc('debug_traceTransaction', [txHash, { disableMemory: true, disableStack: true, disableStorage: true }]);
      const raw = trace.returnValue.replace(/^0x/, '');
      assert.ok(raw.startsWith('08c379a0'), `${label}: expected Error(string)`);
      const length = Number(BigInt('0x' + raw.slice(72, 136)));
      revertReason = Buffer.from(raw.slice(136, 136 + length * 2), 'hex').toString('utf8');
      check(label + ': exact revert reason', revertReason, expectedReason);
    }
    transactions.push({ label, request, receipt, ...(revertReason ? { revertReason } : {}) });
    return receipt;
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { handle.assertAlive(); try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch {} await sleep(100); }
    assert.ok(ready, 'fresh owned Anvil ready');
    const [owner, solver, observer, relayer, recipientA, recipientB, wrongActor] = await rpc('eth_accounts');
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    const artifact = name => compilation.output.contracts[name === 'SemanticObserverEscrow' ? SOURCE : FIXTURE][name];
    const deploy = async name => {
      const art = artifact(name);
      const args = name === 'SemanticObserverEscrow' ? encodeArgs([observer, 3]) : '';
      const receipt = await send(`deploy ${name}`, { from: owner, data: '0x' + art.evm.bytecode.object + args });
      return { address: receipt.contractAddress, art };
    };
    const contract = await deploy('SemanticObserverEscrow');
    const reverting = await deploy('TestRevertingPayee');
    const reentering = await deploy('TestReenteringPayee');
    const functionName = (target, prefix) => {
      const methods = Object.keys(target.art.evm.methodIdentifiers).filter(name => name.startsWith(prefix + '('));
      assert.equal(methods.length, 1, `unique method ${prefix}`);
      return methods[0];
    };
    const calldata = (target, name, args = []) => '0x' + target.art.evm.methodIdentifiers[functionName(target, name)] + encodeArgs(args);
    const call = (target, name, args = []) => rpc('eth_call', [{ to: target.address, data: calldata(target, name, args) }, 'latest']);
    const fields = (schema, data) => schema.map(field => data[field.name]);
    const state = async config => Number(BigInt(await call(contract, 'inputState', [config.id])));
    const consumed = async tag => BigInt(await call(contract, 'consumedEffect', [tag])) === 1n;
    const domain = evmDomain(31337, genesis.hash);
    const inputAmount = '1000000';
    const baseTime = await now();
    const resultHeights = new Map();
    const open = async (label, options = {}) => {
      const salt = labelHash('M3/' + label);
      const workflow = { version: 3, profile: 'NATIVE_EVM_RELATION_TEST_ONLY', clientSalt: salt, owner, solver: options.payee ?? solver,
        authority: { chainId: '31337', genesisHash: genesis.hash, contract: contract.address, policyVersion: 3 },
        roles: { sol: { recipient: recipientA }, btc: { recipient: recipientB } },
        quote: { version: 1, inputAmount, protocolFee: '25000', solMin: '2500000', solMax: '3500000', solPriceNumerator: '1', solPriceDenominator: '10', btcPriceNumerator: '4', btcPriceDenominator: '1', btcMin: '150000', solFeeCap: '1000000000000000', btcFeeCap: '1000000000000000', rounding: 'ceil-sol-cost-floor-btc-output-solver-keeps-dust', ...options.quote },
        executeBy: baseTime + 1000, claimBy: baseTime + 2000 };
      const terms = termsFromEvmWorkflow(workflow);
      const id = await call(contract, 'deriveInputId', [owner, salt]);
      const config = { label, id, salt, payee: workflow.solver, terms, amount: inputAmount, executeBy: workflow.executeBy, claimBy: workflow.claimBy };
      const receipt = await send(`lock authorized native EVM input: ${label}`, { from: owner, to: contract.address, value: hex(config.amount), data: calldata(contract, 'open', [salt, config.payee, fields(TERMS_FIELDS, terms), config.executeBy, config.claimBy]) });
      check(`native owner authorized actual EVM input transaction: ${label}`, receipt.from, owner);
      config.lockReceipt = receipt;
      config.openedAt = Number(BigInt((await rpc('eth_getBlockByNumber', [receipt.blockNumber, false])).timestamp));
      config.termsHash = await call(contract, 'inputTermsHash', [id]);
      config.lockDigest = await call(contract, 'lockDigest', [id]);
      check(`actual funded input amount: ${label}`, BigInt(await call(contract, 'inputAmount', [id])), BigInt(config.amount));
      check(`terms hash recomputed independently: ${label}`, config.termsHash, await hash('0x' + encodeArgs([fields(TERMS_FIELDS, terms)])));
      const lockTag = await hash('0x' + Buffer.from('PAEG_SEMANTIC_LOCK_V3').toString('hex'));
      check(`lock digest binds actual chain, contract, input and terms: ${label}`, config.lockDigest, await hash('0x' + encodeArgs([lockTag, 31337, contract.address, id, owner, config.payee, config.amount, config.termsHash, config.openedAt, config.executeBy, config.claimBy])));
      authorizations.push({ label, workflow, terms, escrowId: id, termsHash: config.termsHash, lockDigest: config.lockDigest, ownerOpenReceipt: receipt, classification: 'EXPLICIT_NATIVE_EVM_WORKFLOW_AUTHORIZED_BY_OWNER_OPEN_TRANSACTION', onchainAuthority: 'Native owner transaction signs actual terms, input value and workflow hash; no M2 Ed25519 authorization is reused' });
      return config;
    };
    const digestResult = (config, result) => call(contract, 'resultDigest', [config.id, fields(RESULT_FIELDS, result)]);
    const signResult = async (config, result, { signer = observer, domainOverrides = {}, messageOverrides = {} } = {}) => {
      const data = typedResult({ chainId: 31337, contract: contract.address, escrowId: config.id, termsHash: config.termsHash, policyVersion: 3, result });
      Object.assign(data.domain, domainOverrides);
      Object.assign(data.message, messageOverrides);
      const signature = await rpc('eth_signTypedData_v4', [signer, JSON.stringify(data)]);
      signedResults.push({ input: config.label, result, typedData: data, signature, classification: 'TRUSTED_OBSERVER_ASSERTION_NOT_ZK' });
      return signature;
    };
    const claimData = (config, a, b, sigA, sigB) => calldata(contract, 'claim', [config.id, fields(RESULT_FIELDS, a), fields(RESULT_FIELDS, b), { bytes: sigA }, { bytes: sigB }]);
    const claim = async (label, config, a, b, expectedReason, signatures) => {
      const [sigA, sigB] = signatures ?? [await signResult(config, a), await signResult(config, b)];
      return send(label, { from: relayer, to: contract.address, data: claimData(config, a, b, sigA, sigB) }, expectedReason);
    };
    const native = async (label, config, stage, amount, predecessor, options = {}) => {
      const recipient = stage === 1 ? recipientA : recipientB;
      const requestData = requestCommitment({ escrowId: config.id, stage, predecessor, amount, recipient });
      const receipt = await send(`native EVM output ${label}`, { from: solver, to: options.actualRecipient ?? recipient, value: hex(options.actualAmount ?? amount), data: options.actualData ?? requestData, gas: '0x186a0' });
      const parentHeight = stage === 1 ? Number(BigInt(config.lockReceipt.blockNumber)) : resultHeights.get(predecessor);
      assert.ok(Number.isSafeInteger(parentHeight), 'known actual predecessor block height');
      const expected = { txHash: receipt.transactionHash, chainId: 31337, genesisHash: genesis.hash, from: solver, to: recipient, amount, maxFee: stage === 1 ? config.terms.solFeeCap : config.terms.btcFeeCap, requestData, minimumBlock: parentHeight + 1 };
      if (options.reject) {
        await assert.rejects(() => observeNativeEvmTransfer(rpc, expected), error => {
          check(`observer refuses actual ${options.reject}`, error.cause?.message, options.reject);
          rejectedObservations.push({ label, expected, receipt, reason: error.cause?.message });
          return true;
        });
        return null;
      }
      const observation = await observeNativeEvmTransfer(rpc, expected);
      observations.push({ label, stageRole: stage === 1 ? 'A/SOL-relation-role' : 'B/BTC-relation-role', actualNativeFamily: 'EVM', ...observation });
      const result = { stage, ...Object.fromEntries(RESULT_FIELDS.filter(f => !['stage', 'predecessor'].includes(f.name)).map(f => [f.name, observation[f.name]])), predecessor };
      resultHeights.set(await digestResult(config, result), Number(BigInt(receipt.blockNumber)));
      return result;
    };
    const syntheticPair = async (config, label) => {
      const a = { stage: 1, effectTag: labelHash(label + '/inventedA'), chainDomain: domain, recipient: config.terms.solRecipient, amount: '3000000', fee: '0', observedAt: await now(), predecessor: config.lockDigest };
      const b = { stage: 2, effectTag: labelHash(label + '/inventedB'), chainDomain: domain, recipient: config.terms.btcRecipient, amount: quoteOutput(config.terms, config.amount, a.amount), fee: '0', observedAt: await now(), predecessor: await digestResult(config, a) };
      return [a, b];
    };
    const invalidate = async (label, config, targetDigest, options = {}) => {
      const reason = labelHash('observer-detected-invalidated-result');
      const issuedAt = options.issuedAt ?? await now();
      const data = typedInvalidation({ chainId: 31337, contract: contract.address, escrowId: config.id, lockDigest: config.lockDigest, targetDigest, reason, issuedAt, policyVersion: 3 });
      const signature = options.signature ?? await rpc('eth_signTypedData_v4', [options.signer ?? observer, JSON.stringify(data)]);
      const args = [config.id, targetDigest, reason, issuedAt, { bytes: signature }];
      const receipt = await send(label, { from: relayer, to: contract.address, data: calldata(contract, 'invalidate', args) }, options.expectedReason);
      signedInvalidations.push({ label, typedData: data, signature, receipt });
      return { receipt, signature, issuedAt, reason };
    };
    const refund = (label, config, reason) => send(label, { from: owner, to: contract.address, data: calldata(contract, 'refund', [config.id]) }, reason);

    // All normal and replay input windows open before the native effects.
    const main = await open('native-semantic-main');
    const duplicate = await open('duplicate-effect-attempt');
    const frozen = await open('invalidation-first');
    const lying = await open('lying-observer-demonstration');
    const rejectPay = await open('rejecting-payee', { payee: reverting.address });
    const reentry = await open('reentrant-payee', { payee: reentering.address });
    const expires = await open('expired-native-claim');
    const u128 = ((1n << 128n) - 1n).toString();
    const extreme = await open('uint128-arithmetic-boundary', { quote: { protocolFee: '0', solMin: '1', solMax: u128, solPriceNumerator: u128, solPriceDenominator: u128, btcPriceNumerator: '999999', btcPriceDenominator: u128, btcMin: '1' } });
    check('fractional ceiling then floor reference vector', quoteOutput(main.terms, main.amount, '3000001'), '168749');
    check('Solidity fractional ceiling then floor matches SDK', BigInt(await call(contract, 'expectedOutput', [main.id, '3000001'])).toString(), '168749');
    check('maximum uint128 output representable under explicit extreme quote', quoteOutput(extreme.terms, extreme.amount, '1'), u128);
    check('Solidity maximum uint128 output matches SDK', BigInt(await call(contract, 'expectedOutput', [extreme.id, '1'])).toString(), u128);
    await send('full uint128 product rejects unaffordable output without arithmetic panic', { from: relayer, to: contract.address, data: calldata(contract, 'expectedOutput', [extreme.id, u128]) }, 'RESIDUAL_BUDGET');
    const nativeBalanceA = await balance(recipientA), nativeBalanceB = await balance(recipientB);
    const a0 = await native('main-A0', main, 1, '3000000', main.lockDigest);
    const a0Digest = await digestResult(main, a0);
    const expectedB0 = quoteOutput(main.terms, main.amount, a0.amount);
    check('initial residual amount from authenticated A', expectedB0, '168750');
    check('Solidity initial arithmetic matches SDK', BigInt(await call(contract, 'expectedOutput', [main.id, a0.amount])).toString(), expectedB0);
    const b0 = await native('main-B0', main, 2, expectedB0, a0Digest);
    const a1 = await native('main-A1-additional-actual-effect', main, 1, '3500000', main.lockDigest);
    const a1Digest = await digestResult(main, a1);
    const expectedB1 = quoteOutput(main.terms, main.amount, a1.amount);
    check('changed authenticated A changes native B target', expectedB1, '156250');
    check('changed A result digest includes native resource identity', a1Digest !== a0Digest, true);
    check('Solidity recomputed arithmetic matches SDK', BigInt(await call(contract, 'expectedOutput', [main.id, a1.amount])).toString(), expectedB1);
    // Re-observation is not used to fake freshness: this is another real B transfer
    // executed after A1 but explicitly bound by calldata/certificate to the old A0.
    const staleB = await native('new-B-with-stale-A0-binding', main, 2, expectedB0, a0Digest);
    await claim('changed A with stale B dependency rejects', main, a1, staleB, 'SOL_PREDECESSOR');
    await claim('observer-signed wrong residual arithmetic rejects', main, a1, { ...staleB, predecessor: a1Digest }, 'BTC_ARITHMETIC');
    const b1 = await native('main-B1-recomputed', main, 2, expectedB1, a1Digest);
    const b1Observation = observations.at(-1);
    const tooLateBoundary = { txHash: b1Observation.evidence.receipt.transactionHash, chainId: 31337, genesisHash: genesis.hash, from: solver, to: recipientB, amount: expectedB1, maxFee: main.terms.btcFeeCap, requestData: b1Observation.evidence.requestData, minimumBlock: Number(BigInt(b1Observation.evidence.blockNumber)) + 1 };
    await assert.rejects(() => observeNativeEvmTransfer(rpc, tooLateBoundary), error => {
      check('observer requires strictly later height than supplied predecessor boundary', error.cause?.message, 'TRANSFER_PRECEDES_LOCK');
      rejectedObservations.push({ label: 'actual B below conservative minimumBlock boundary', expected: tooLateBoundary, receipt: b1Observation.evidence.receipt, reason: error.cause?.message, classification: 'ORDERING_POLICY_CHECK_NOT_A_NEW_NATIVE_EFFECT' });
      return true;
    });
    await claim('observer-signed wrong recipient rejects', main, a1, { ...b1, recipient: recipientCommitment(wrongActor) }, 'RECIPIENT');
    await claim('observer-signed wrong chain domain rejects', main, a1, { ...b1, chainDomain: labelHash('not-the-actual-genesis-domain') }, 'CHAIN_DOMAIN');
    await claim('observer-signed excessive fee rejects', main, a1, { ...b1, fee: (BigInt(main.terms.btcFeeCap) + 1n).toString() }, 'FEE_CAP');
    await claim('observer-signed false lock predecessor rejects', main, { ...a1, predecessor: labelHash('not-the-actual-lock') }, b1, 'LOCK_PREDECESSOR');
    await claim('future authenticated observation rejects', main, a1, { ...b1, observedAt: main.executeBy + 1 }, 'OBSERVATION_TIME');
    await claim('wrong signing observer rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { signer: wrongActor }), await signResult(main, b1)]);
    await claim('wrong EIP712 chain domain rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { domainOverrides: { chainId: '31338' } }), await signResult(main, b1)]);
    await claim('wrong EIP712 contract domain rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { domainOverrides: { verifyingContract: wrongActor } }), await signResult(main, b1)]);
    await claim('wrong signed result version rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { messageOverrides: { resultVersion: 4 } }), await signResult(main, b1)]);
    await claim('wrong signed policy version rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { messageOverrides: { policyVersion: 4 } }), await signResult(main, b1)]);
    await claim('wrong signed immutable terms hash rejects', main, a1, b1, 'SIGNER', [await signResult(main, a1, { messageOverrides: { termsHash: labelHash('wrongterms') } }), await signResult(main, b1)]);
    const validSigA = await signResult(main, a1), validSigB = await signResult(main, b1);
    await claim('empty result signature rejects', main, a1, b1, 'SIGNATURE_LENGTH', ['0x', validSigB]);
    await claim('noncanonical v signature rejects', main, a1, b1, 'SIGNATURE_CANONICAL', [validSigA.slice(0, -2) + '00', validSigB]);
    const order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    await claim('malleable high-s signature rejects', main, a1, b1, 'SIGNATURE_CANONICAL', [validSigA.slice(0, 66) + word(order - BigInt('0x' + validSigA.slice(66, 130))) + (validSigA.endsWith('1b') ? '1c' : '1b'), validSigB]);
    check('all rejected semantic claims leave main open', await state(main), 1);
    check('rejected relations consume neither selected native effect', await Promise.all([consumed(a1.effectTag), consumed(b1.effectTag)]), [false, false]);
    await native('wrong-recipient-actual-transfer', main, 2, expectedB1, a1Digest, { actualRecipient: wrongActor, reject: 'WRONG_NATIVE_PARTIES' });
    await native('wrong-amount-actual-transfer', main, 2, expectedB1, a1Digest, { actualAmount: '1', reject: 'WRONG_NATIVE_AMOUNT' });
    await native('wrong-request-binding-actual-transfer', main, 2, expectedB1, a1Digest, { actualData: labelHash('unrelated-request'), reject: 'WRONG_NATIVE_REQUEST_BINDING' });

    const solverBeforeMain = await balance(solver);
    const mainClaim = await claim('authenticated dependency and arithmetic pay actual locked input', main, a1, b1, undefined, [validSigA, validSigB]);
    check('native EVM solver receives exact input from successful semantic claim', await balance(solver) - solverBeforeMain, BigInt(main.amount));
    check('successful semantic claim consumes selected resources', await Promise.all([consumed(a1.effectTag), consumed(b1.effectTag)]), [true, true]);
    check('successful semantic claim state PAID', await state(main), 2);
    await claim('same input certificate replay rejects', main, a1, b1, 'STATE', [validSigA, validSigB]);
    const dupA = { ...a1, predecessor: duplicate.lockDigest };
    const dupB = { ...b1, predecessor: await digestResult(duplicate, dupA) };
    await claim('faulty observer cannot remap already consumed native effects to another open input', duplicate, dupA, dupB, 'EFFECT_ALREADY_CONSUMED');
    check('effect-remapping attempt leaves second input unpaid', await state(duplicate), 1);

    // Ordering A: invalidation included first. All outputs here are real EVM.
    const frozenA = await native('freeze-A', frozen, 1, '3000000', frozen.lockDigest);
    const frozenADigest = await digestResult(frozen, frozenA);
    const frozenB = await native('freeze-B', frozen, 2, quoteOutput(frozen.terms, frozen.amount, frozenA.amount), frozenADigest);
    const frozenSigs = [await signResult(frozen, frozenA), await signResult(frozen, frozenB)];
    await invalidate('wrong signer cannot freeze input', frozen, frozenADigest, { signer: wrongActor, expectedReason: 'SIGNER' });
    const freeze = await invalidate('native invalidation included before claim freezes input', frozen, frozenADigest);
    check('invalidation-first EVM state FROZEN', await state(frozen), 4);
    check('invalidation-first dispute flag', BigInt(await call(contract, 'disputed', [frozen.id])), 1n);
    await claim('previously issued certificates cannot claim after included invalidation', frozen, frozenA, frozenB, 'STATE', frozenSigs);
    await invalidate('identical invalidation replay rejects', frozen, frozenADigest, { issuedAt: freeze.issuedAt, signature: freeze.signature, expectedReason: 'INVALIDATION_REPLAY' });
    await refund('frozen input cannot refund before original deadline', frozen, 'REFUND_EARLY');
    check('frozen input does not consume delivered effects', await Promise.all([consumed(frozenA.effectTag), consumed(frozenB.effectTag)]), [false, false]);

    // Ordering B: claim already included. A later signed correction is a dispute.
    const solverBeforeDispute = await balance(solver);
    const lateInvalidation = await invalidate('invalidation after included payout records dispute only', main, a1Digest);
    check('claim-first remains PAID after invalidation', await state(main), 2);
    check('claim-first dispute flag recorded', BigInt(await call(contract, 'disputed', [main.id])), 1n);
    check('post-payment invalidation does not claw back solver funds', await balance(solver), solverBeforeDispute);
    await refund('disputed paid input cannot refund', main, 'REFUND_STATE_OWNER');

    const recipientBeforeLieA = await balance(recipientA), recipientBeforeLieB = await balance(recipientB);
    const [lieA, lieB] = await syntheticPair(lying, 'lying-observer');
    const solverBeforeLie = await balance(solver);
    const lyingClaim = await claim('LIMITATION lying observer can authorize invented but coherent native facts', lying, lieA, lieB);
    check('lying observer assertion causes actual native payout', await balance(solver) - solverBeforeLie, BigInt(lying.amount));
    check('lying observer produced no native delivery A', await balance(recipientA), recipientBeforeLieA);
    check('lying observer produced no native delivery B', await balance(recipientB), recipientBeforeLieB);
    check('invented effects absent from actual native observation records', observations.some(o => [lieA.effectTag, lieB.effectTag].includes(o.effectTag)), false);

    const [rejectA, rejectB] = await syntheticPair(rejectPay, 'control-flow-reject-payee');
    const heldBeforeFailure = await balance(contract.address);
    await claim('reverting solver reverts payment and effects', rejectPay, rejectA, rejectB, 'PAYMENT_FAILED');
    check('failed payment leaves input open', await state(rejectPay), 1);
    check('failed payment does not consume fixture effects', await Promise.all([consumed(rejectA.effectTag), consumed(rejectB.effectTag)]), [false, false]);
    check('failed payment preserves full held balance', await balance(contract.address), heldBeforeFailure);
    const [reentryA, reentryB] = await syntheticPair(reentry, 'control-flow-reentry');
    const reentrySigs = [await signResult(reentry, reentryA), await signResult(reentry, reentryB)];
    await send('configure reentrant fixture', { from: owner, to: reentering.address, data: calldata(reentering, 'configure', [contract.address, { bytes: claimData(reentry, reentryA, reentryB, ...reentrySigs) }]) });
    await claim('reentrant recipient paid once', reentry, reentryA, reentryB, undefined, reentrySigs);
    check('reentrant callback attempted', BigInt(await call(reentering, 'attempts')), 1n);
    check('nested semantic claim fails', BigInt(await call(reentering, 'reentrySucceeded')), 0n);
    check('reentrant payee receives exact amount once', BigInt(await call(reentering, 'received')), BigInt(reentry.amount));

    const expiryA = await native('expires-A', expires, 1, '3000000', expires.lockDigest);
    const expiryB = await native('expires-B', expires, 2, quoteOutput(expires.terms, expires.amount, expiryA.amount), await digestResult(expires, expiryA));
    const expirySigs = [await signResult(expires, expiryA), await signResult(expires, expiryB)];

    // Reproduce the same-block review case with actual native transfers. These
    // probes intentionally are NOT claimed as signed dependent workflow results.
    const parentProbeRequest = { from: solver, to: recipientA, value: hex(5), data: labelHash('M3/ordering-only-parent-probe'), gas: '0x186a0' };
    const childProbeRequest = { from: solver, to: recipientB, value: hex(7), data: labelHash('M3/ordering-only-child-probe'), gas: '0x186a0' };
    let parentProbeHash, childProbeHash;
    await rpc('evm_setAutomine', [false]);
    try {
      parentProbeHash = await rpc('eth_sendTransaction', [parentProbeRequest]);
      childProbeHash = await rpc('eth_sendTransaction', [childProbeRequest]);
      await rpc('evm_mine', []);
    } finally { await rpc('evm_setAutomine', [true]); }
    const parentProbe = await waitReceipt(parentProbeHash), childProbe = await waitReceipt(childProbeHash);
    for (const [label, request, receipt] of [['ordering-only native parent probe', parentProbeRequest, parentProbe], ['ordering-only native child probe', childProbeRequest, childProbe]]) {
      transactions.push({ label, request, receipt, classification: 'ORDERING_POLICY_ONLY_NOT_FULFILLMENT' });
      check(label + ' succeeded', receipt.status, '0x1');
    }
    check('actual parent and child probes mined in one block', childProbe.blockHash, parentProbe.blockHash);
    check('same-block child probe follows parent transaction index', BigInt(childProbe.transactionIndex) > BigInt(parentProbe.transactionIndex), true);
    const sameBlockExpected = { txHash: childProbeHash, chainId: 31337, genesisHash: genesis.hash, from: solver, to: recipientB, amount: '7', maxFee: main.terms.btcFeeCap, requestData: childProbeRequest.data, minimumBlock: Number(BigInt(parentProbe.blockNumber)) + 1 };
    await assert.rejects(() => observeNativeEvmTransfer(rpc, sameBlockExpected), error => {
      check('actual same-block successor refused by conservative observer rule', error.cause?.message, 'TRANSFER_PRECEDES_LOCK');
      rejectedObservations.push({ label: 'actual same-block parent/child probes', expected: sameBlockExpected, parentReceipt: parentProbe, receipt: childProbe, reason: error.cause?.message, classification: 'ORDERING_POLICY_ONLY_NOT_FULFILLMENT' });
      return true;
    });
    await rpc('evm_setNextBlockTimestamp', [expires.claimBy]);
    await claim('native outputs cannot claim at exact claimBy', expires, expiryA, expiryB, 'CLAIM_EXPIRED', expirySigs);
    const ownerBeforeRefunds = await balance(owner);
    const refundReceipts = [];
    for (const config of [duplicate, frozen, rejectPay, expires, extreme]) refundReceipts.push(await refund(`timeout recovery ${config.label}`, config));
    const refundGas = refundReceipts.reduce((sum, receipt) => sum + BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice), 0n);
    check('five native input refunds exact less actual owner gas', await balance(owner) - ownerBeforeRefunds + refundGas, 5n * BigInt(inputAmount));
    check('all designated recoveries terminal REFUNDED', await Promise.all([duplicate, frozen, rejectPay, expires, extreme].map(state)), [3, 3, 3, 3, 3]);
    await claim('stale claim after frozen input refund rejects', frozen, frozenA, frozenB, 'STATE', frozenSigs);
    await refund('repeat recovered refund rejects', frozen, 'REFUND_STATE_OWNER');
    check('semantic escrow conserves input: no held balance after three payouts and five refunds', await balance(contract.address), 0n);
    check('native outputs A remain irreversible after input refunds', await balance(recipientA) > nativeBalanceA, true);
    check('native outputs B remain irreversible after input refunds', await balance(recipientB) > nativeBalanceB, true);
    check('observer adapter source unchanged during retained run', sha256(await readFile(join(projectRoot, 'src/settlement.mjs'))), adapterSourceHash);

    return {
      schemaVersion: 3, recordedAt: new Date().toISOString(), status: 'VERIFIED_LOCAL_EVM_SEMANTIC_COMPONENT_ONLY',
      runtime: { name: 'Anvil', version: '1.8.4', binarySHA256: ANVIL_HASH, chainId: 31337, genesisHash: genesis.hash, hardfork: 'cancun' },
      compiler: { version: '0.8.37+commit.f401782d.Windows.msvc', binarySHA256: SOLC_HASH, settings: compilation.input.settings, warnings: compilation.output.errors ?? [], sources: Object.fromEntries(Object.entries(compilation.input.sources).map(([path, source]) => [path, sha256(source.content)])), bytecodeSHA256: sha256(Buffer.from(artifact('SemanticObserverEscrow').evm.bytecode.object, 'hex')), inputSHA256: sha256(JSON.stringify(compilation.input)) },
      adapterSourceSHA256: adapterSourceHash,
      contracts: { semantic: contract.address, revertingPayee: reverting.address, reenteringPayee: reentering.address },
      syntheticActors: { owner, solver, observer, relayer, recipientA, recipientB, wrongActor },
      checks: { count: checks.length, passed: checks }, transactions, authorizations, observations, rejectedObservations, signedResults, signedInvalidations,
      workflow: { classification: 'REAL_EVM_LOCK_AND_TWO_EVM_ROLE_OUTPUTS_AND_EVM_CLAIM', escrowId: main.id, inputAmount, selectedA: a1, selectedB: b1, originalA: a0, originalB: b0, staleAdditionalB: staleB, originalTargetB: expectedB0, recalculatedTargetB: expectedB1, claimReceipt: mainClaim, additionalNativeEffectsWereNotRolledBack: true },
      invalidationOrdering: { invalidationFirst: { escrowId: frozen.id, invalidation: freeze.receipt.transactionHash, laterClaimRejected: true, refundedAfterOriginalDeadline: true }, claimFirst: { escrowId: main.id, claim: mainClaim.transactionHash, invalidation: lateInvalidation.receipt.transactionHash, state: 'PAID', disputed: true, rollback: false } },
      trustCounterexample: { classification: 'DELIBERATELY_FALSE_SIGNED_OBSERVER_FACTS', inventedA: lieA, inventedB: lieB, actualNativePayout: lyingClaim, noCorrespondingNativeDeliveries: true, expectedLimitation: 'Relation checks and valid signatures cannot establish native-chain truth. A pinned observer can lie or alias effects.' },
      sameBlockOrdering: { classification: 'ORDERING_POLICY_ONLY_NOT_FULFILLMENT', parentReceipt: parentProbe, childReceipt: childProbe, observerExpectedMinimumBlock: sameBlockExpected.minimumBlock, childRefused: true, noSignedFulfillmentResults: true },
      controlFlowFixtures: { syntheticResultsOnly: ['control-flow-reject-payee', 'control-flow-reentry'], notNativeEvidence: true },
      isolation: { processId: handle.child.pid, freshRandomSyntheticAccounts: true, bindAddress: '127.0.0.1', externalRPC: false, forkURL: false, userKeysRead: false, ownProcessStoppedInFinally: true, scratchRemovedInFinally: true },
      limits: ['Only EVM native runtime. Roles named SOL/BTC in the relation are explicitly mapped to EVM domains; no SVM/UTXO delivery claim.', 'Transparent input, quote, result bundle, effect tags and predecessor links leak route information.', 'Observer RPC snapshot, native truth, recipient ownership, finality and canonical effect identities remain trusted.', 'Native invalidation only takes effect when ordered before claim in canonical EVM history; later dispute cannot claw back.', 'The original fully valid pair is not automatically revoked when a later alternate result is observed; included invalidation freezes the whole input.', 'Partial and additional native outputs remain sunk solver exposure despite input refund.', 'No ZK, private graph, production safety, profitability, compensation, cross-chain ledger atomicity or accepted triple-chain MVP.'],
    };
  } finally { await stopOwnProcess(handle); await removeOwnScratch(cwd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runEvmSemanticIntegration();
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence/m3-evm-semantic-local.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ status: evidence.status, checks: evidence.checks.count, transactions: evidence.transactions.length, nativeObservations: evidence.observations.length, rejectedNativeObservations: evidence.rejectedObservations.length, evidence: 'evidence/m3-evm-semantic-local.json' }));
  } catch (error) { console.error('M3 EVM semantic integration failed:', error.stack); process.exitCode = 1; }
}
