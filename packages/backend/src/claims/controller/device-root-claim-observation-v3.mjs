/** Original reopened RootNote observation. Tokens and permissions are private
 * to one family; reopening never admits a new proof, credit or native send. */
import assert from "node:assert/strict";
import { randomBytes, createPublicKey, verify } from "node:crypto";
import { exactRecord } from "@lianum/components/encoding/commitments";
import {
  cloneInput as copy,
  frozenInput as freeze,
} from "../../execution/account/preparation/readiness-inputs.mjs";
import * as DeviceClaim from "@lianum/mobile-protocol/device/native-claim-v1";
import { verifyPrivateNotePath } from "@lianum/engine/notes/private-note-tree";
/** Canonical controller supplies these four private bindings once. No canonical
 * token issuer or intake-registry callback is exported by the controller. */
export function buildDeviceRootClaimObservationV3(contracts) {
  assert.equal(arguments.length, 1);
  exactRecord(contracts, [
    "controllerState",
    "intakeState",
    "registerIntakeReference",
    "loadAccountValidation",
  ]);
  for (const method of Object.values(contracts))
    assert.equal(typeof method, "function");
  const {
    controllerState,
    intakeState,
    registerIntakeReference,
    loadAccountValidation,
  } = contracts;
  const deviceRootClaimObservationRestartsV3 = new WeakMap();
  // This issuer belongs to this family only. Canonical composition keeps it private.
  function issueOriginalObservationV3(seed) {
    assert.equal(arguments.length, 1);
    const token = Object.freeze(Object.create(null));
    deviceRootClaimObservationRestartsV3.set(token, { ...seed, used: false });
    return token;
  }
  function originalDeviceRootClaimObservationFacadeV3(seed, ctx) {
    const descriptor = seed.descriptor,
      challenges = new Map(),
      exitChallenges = new Map();
    let stopped = false;
    const alive = () => {
      ctx.live();
      assert.ok(!stopped, "CLAIM_DEVICE_ROOT_INTAKE_CLOSED");
    };
    const stable = (s) =>
      Object.fromEntries(
        [
          "profile",
          "descriptor",
          "ownerIdentitySHA256",
          "intentId",
          "admissions",
          "d27Observation",
          "ci51Observation",
        ]
          .filter((k) => Object.hasOwn(s, k))
          .map((k) => [k, s[k]]),
      );
    const source = async () => {
      alive();
      const s = (await ctx.journal.read()).apiDeviceRootClaims?.[0];
      assert.deepEqual(
        stable(s),
        stable(seed.source),
        "CLAIM_DEVICE_ROOT_RETAINED_OBSERVATION_CHANGED",
      );
      return s;
    };
    const publicExit = (r) =>
      r
        ? freeze({
            jobId: r.consent.jobId,
            stage: r.stage,
            statement: r.consent.statement,
            path: r.consent.path,
            quoteId: r.consent.quoteId,
            rootId: r.consent.rootId,
            noteRevision: r.consent.noteRevision,
            witnessSHA256: r.consent.witnessSHA256,
            proofSHA256: r.proofSHA256,
            publicInputsSHA256: r.publicInputsSHA256,
            transactionHash: r.submission?.transactionHash ?? null,
            observation: r.confirmation ?? null,
          })
        : null;
    function permission(
      action,
      exit = false,
      fields = {},
      parentExpiry = Infinity,
    ) {
      alive();
      const map = exit ? exitChallenges : challenges;
      for (const [k, r] of map)
        if (r.value.expiresAt <= Date.now()) map.delete(k);
      assert.ok(map.size < 8, "CLAIM_DEVICE_ROOT_CHALLENGE_LIMIT");
      const shared = {
        descriptor,
        rootId: null,
        noteRevision: null,
        jobId: null,
        statement: null,
        witnessSHA256: null,
        recipient: null,
        challengeId: randomBytes(32).toString("hex"),
        nonce: randomBytes(32).toString("hex"),
        expiresAt: Math.min(Date.now() + 15000, parentExpiry),
      };
      const value = exit
        ? DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3({
            version: 3,
            profile: DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3,
            ...shared,
            action,
            quoteId: null,
            path: null,
            proofSHA256: null,
            publicInputsSHA256: null,
            requestId: null,
            ticketId: null,
            amount: null,
            maxFee: null,
            ...fields,
          })
        : DeviceClaim.validateDeviceRootClaimPermissionFreshV2({
            version: 2,
            profile: DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2,
            ...shared,
            action,
            commonSHA256: null,
          });
      map.set(value.challengeId, {
        value,
        deadline:
          performance.now() + Math.min(15000, value.expiresAt - Date.now()),
      });
      return value;
    }
    function consume(raw, signature, action, exit = false) {
      alive();
      const value = exit
          ? DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3(raw)
          : DeviceClaim.validateDeviceRootClaimPermissionFreshV2(raw),
        map = exit ? exitChallenges : challenges,
        r = map.get(value.challengeId);
      assert.ok(
        r && performance.now() < r.deadline,
        "CLAIM_DEVICE_ROOT_ORIGINAL_PERMISSION",
      );
      assert.equal(
        value.action,
        action,
        "CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY",
      );
      assert.deepEqual(value, r.value);
      const pub = descriptor.claim.devicePublicKey,
        key = createPublicKey({
          format: "jwk",
          key: {
            kty: "EC",
            crv: "secp256k1",
            x: Buffer.from(pub.slice(2, 66), "hex").toString("base64url"),
            y: Buffer.from(pub.slice(66), "hex").toString("base64url"),
          },
        }),
        message = exit
          ? DeviceClaim.deviceRootClaimExitPermissionMessageV3(value)
          : DeviceClaim.deviceRootClaimPermissionMessageV2(value);
      try {
        assert.equal(
          verify(
            "sha256",
            message,
            { key, dsaEncoding: "ieee-p1363" },
            Buffer.from(
              DeviceClaim.normalizeNativeClaimDeviceSignatureV1(signature),
              "hex",
            ),
          ),
          true,
          "CLAIM_DEVICE_ROOT_DEVICE_SIGNATURE",
        );
      } finally {
        message.fill(0);
      }
      map.delete(value.challengeId);
      return {
        value,
        check() {
          alive();
          assert.ok(
            performance.now() < r.deadline,
            "CLAIM_DEVICE_ROOT_ACCESS_EXPIRED",
          );
          (exit
            ? DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3
            : DeviceClaim.validateDeviceRootClaimPermissionFreshV2)(value);
        },
      };
    }
    async function note() {
      const s = await source(),
        row = s.intentId
          ? (await ctx.journal.read()).deposits.find((r) => r.id === s.intentId)
          : null,
        v = await ctx.readers[seed.i].read();
      await ctx.readers[seed.i].assertCurrent(v);
      alive();
      const binding = s.d27Observation,
        cm = binding?.commitment ?? null,
        nf = binding?.nullifier ?? null;
      if (!row || row.status !== "ISSUED" || !binding || !cm || !nf)
        return {
          v,
          row,
          note: {
            state: "UNKNOWN",
            commitment: cm,
            nullifier: nf,
            available: null,
            backing: null,
            path: null,
          },
        };
      assert.equal(row.claimDomain, descriptor.claim.claimDomain);
      assert.equal(row.packet.ownerIdentitySHA256, seed.ownerIdentitySHA256);
      assert.equal(row.packet.statement.output, cm);
      assert.equal(binding.consent.statement.output, cm);
      assert.deepEqual(binding.consent.descriptor, descriptor);
      const at = v.ledger.commitments.indexOf("0x" + cm);
      assert.ok(
        at >= 0 &&
          v.ledger.commitments.filter((x) => x === "0x" + cm).length === 1,
        "CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED",
      );
      const pathRaw = v.ledger.tree.path(at);
      assert.equal(
        verifyPrivateNotePath(pathRaw),
        true,
        "CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED",
      );
      const path = {
        root: pathRaw.root.slice(2),
        index: pathRaw.index,
        leaf: pathRaw.leaf.slice(2),
        siblings: pathRaw.siblings.map((x) => x.slice(2)),
      };
      assert.equal(path.leaf, cm);
      const p = v.ledger.publicState,
        held = String(p.actualAssetBalance),
        liabilities = String(p.backedAmount),
        surplus = String(p.surplus);
      assert.ok(
        BigInt(held) >= BigInt(liabilities) &&
          BigInt(surplus) === BigInt(held) - BigInt(liabilities),
        "CLAIM_DEVICE_ROOT_ORIGINAL_BACKING",
      );
      const backing = { held, liabilities, surplus, deficit: "0" };
      if (v.ledger.nullifiers.includes("0x" + nf))
        return {
          v,
          row,
          note: {
            state: "SPENT",
            commitment: cm,
            nullifier: nf,
            available: null,
            backing,
            path,
          },
        };
      if (s.withdrawal && s.withdrawal.stage !== "CONFIRMED")
        return {
          v,
          row,
          note: {
            state: "UNKNOWN",
            commitment: cm,
            nullifier: nf,
            available: null,
            backing: null,
            path,
          },
        };
      assert.ok(BigInt(row.packet.statement.amount) <= BigInt(held));
      return {
        v,
        row,
        note: {
          state: "LIVE",
          commitment: cm,
          nullifier: nf,
          available: row.packet.statement.amount,
          backing,
          path,
        },
      };
    }
    async function observeW39() {
      const s = await source(),
        r = s.withdrawal;
      if (!r?.submission) return publicExit(r);
      const o = await seed.noteObserver.readTransaction({
        kind: "withdraw_source",
        identitySHA256: seed.sourceIdentitySHA256,
        transactionHash: r.submission.transactionHash,
        calldataSHA256: r.submission.calldataSHA256,
      });
      if (!o) return publicExit(r);
      const { validateFlatAccountOwnerObservation } =
        await loadAccountValidation();
      validateFlatAccountOwnerObservation({
        identity: seed.noteObserver.identity,
        artifact: seed.claims.flatSystem.pools[seed.i].artifact,
        submission: r.submission,
        authorization: null,
        observation: o,
      });
      const current = await note();
      assert.equal(
        current.note.state,
        "SPENT",
        "CLAIM_DEVICE_ROOT_SPEND_NOT_OBSERVED",
      );
      await ctx.readers[seed.i].assertCurrent(current.v);
      alive();
      r.stage = "CONFIRMED";
      r.submission.transactionHash = o.transaction.hash;
      r.submission.observation = o;
      r.confirmation = {
        transactionHash: o.transaction.hash,
        calldataSHA256: r.submission.calldataSHA256,
        receiptBlockHash: o.receipt.blockHash,
        commitment: current.note.commitment,
        nullifier: current.note.nullifier,
        amount: r.consent.statement.amount,
        recipient: r.consent.statement.recipient,
        proofSHA256: r.proofSHA256,
        publicInputsSHA256: r.publicInputsSHA256,
      };
      await ctx.journal.update((d) => {
        d.apiDeviceRootClaims[0].withdrawal = copy(r);
        return d;
      });
      return publicExit(r);
    }
    async function native() {
      const s = await source(),
        r = s.redemption;
      if (!r) return null;
      const found = (await ctx.journal.read()).tickets.filter(
        (t) => t.redemptionRequestId === r.requestId,
      );
      assert.ok(found.length <= 1, "CLAIM_DEVICE_ROOT_AMBIGUOUS_TICKET");
      if (!found.length) return freeze(copy(r));
      const t = found[0];
      assert.equal(t.claimDomain, descriptor.claim.claimDomain);
      assert.equal(t.caller, "0x" + descriptor.recipient);
      assert.equal(t.ticket.amount, r.amount);
      assert.equal(t.ticket.maxFee, r.maxFee);
      await ctx.journal.update((d) => {
        const x = d.apiDeviceRootClaims[0].redemption;
        assert.equal(x.requestId, r.requestId);
        x.ticketId = t.id;
        x.status = t.status;
        return d;
      });
      return freeze({ ...r, ticketId: t.id, status: t.status });
    }
    const deny = () => {
      throw Error("CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY");
    };
    const api = Object.freeze({
      descriptor,
      challenge(action) {
        assert.equal(arguments.length, 1);
        assert.ok(
          ["READ", "ACCESS"].includes(action),
          "CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY",
        );
        return permission(action);
      },
      read: async (request) => {
        exactRecord(request, ["permission", "signature"]);
        const grant = consume(request.permission, request.signature, "READ");
        await ctx.controller.reconcile();
        return ctx.serial(
          async () => {
            await observeW39();
            const current = await note(),
              s = await source(),
              redemption = await native();
            grant.check();
            return freeze({
              profile: descriptor.profile,
              descriptor,
              permissionId: grant.value.challengeId,
              observedAt: Date.now(),
              expiresAt: grant.value.expiresAt,
              noteCustody: "DEVICE_ROOT_NOTE",
              nativeCustody: "BACKEND_LOCAL_QUORUM",
              nativeSelfCustody: false,
              availablePrivateClaims: current.note.available,
              note: current.note,
              withdrawal: publicExit(s.withdrawal),
              redemption,
              deposit: current.row
                ? await ctx.projectDeposit(current.row)
                : null,
              commitment: current.note.commitment,
              nullifier: current.note.nullifier,
              requiresReconciliation:
                ctx.journal.requiresReconciliation?.() === true,
            });
          },
          { readOrReconcile: true },
        );
      },
      exitChallenge: (request) =>
        ctx.serial(
          async () => {
            exactRecord(request, ["access", "signature", "action"]);
            const access = consume(request.access, request.signature, "ACCESS"),
              s = await source(),
              r = s.withdrawal;
            assert.ok(r, "CLAIM_DEVICE_ROOT_ORIGINAL_W39_REQUIRED");
            assert.ok(
              ["OBSERVE_W39", "OBSERVE_NATIVE"].includes(request.action),
              "CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY",
            );
            access.check();
            let fields;
            if (request.action === "OBSERVE_W39") {
              assert.ok(r.proof, "CLAIM_DEVICE_ROOT_W39_PROOF_REQUIRED");
              fields = {
                jobId: r.consent.jobId,
                rootId: r.consent.rootId,
                noteRevision: r.consent.noteRevision,
                quoteId: r.consent.quoteId,
                statement: r.consent.statement,
                path: r.consent.path,
                witnessSHA256: r.consent.witnessSHA256,
                proofSHA256: r.proofSHA256,
                publicInputsSHA256: r.publicInputsSHA256,
              };
            } else {
              assert.ok(r.stage === "CONFIRMED" && s.redemption?.ticketId);
              fields = {
                jobId: r.consent.jobId,
                rootId: r.consent.rootId,
                noteRevision: r.consent.noteRevision,
                requestId: s.redemption.requestId,
                ticketId: s.redemption.ticketId,
                amount: s.redemption.amount,
                maxFee: s.redemption.maxFee,
              };
            }
            access.check();
            return permission(
              request.action,
              true,
              fields,
              access.value.expiresAt,
            );
          },
          { readOrReconcile: true },
        ),
      operateW39: (request) =>
        ctx.serial(
          async () => {
            exactRecord(request, ["permission", "signature", "packet"]);
            assert.equal(request.packet, null);
            consume(request.permission, request.signature, "OBSERVE_W39", true);
            return observeW39();
          },
          { readOrReconcile: true },
        ),
      authorizeNativeExit: (request) =>
        ctx.serial(
          async () => {
            exactRecord(request, ["permission", "signature"]);
            const grant = consume(
                request.permission,
                request.signature,
                "OBSERVE_NATIVE",
                true,
              ),
              s = await source();
            assert.equal(s.redemption?.requestId, grant.value.requestId);
            assert.equal(s.redemption?.ticketId, grant.value.ticketId);
            return { action: "OBSERVE_NATIVE", ticketId: grant.value.ticketId };
          },
          { readOrReconcile: true },
        ),
      retainNativeExit: () => ctx.serial(native, { readOrReconcile: true }),
      economicSnapshot: () =>
        ctx.serial(
          async () => {
            const current = await note(),
              before = await ctx.journal.read(),
              s = await source(),
              selected = await ctx.rootView(descriptor.claim.claimDomain);
            assert.equal(
              selected.snapshot.head.hash,
              current.v.head.hash,
              "CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED",
            );
            await ctx.observer.assertCurrent(selected.snapshot);
            await ctx.readers[seed.i].assertCurrent(current.v);
            assert.deepEqual(
              await ctx.journal.read(),
              before,
              "CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED",
            );
            alive();
            const requests = s.admissions.map((a, index) => ({
              requestId:
                "device_root_claim_" + index + "_" + a.permissionSHA256,
              assetId: seed.asset.assetId,
              kind: a.action === "FUND_NATIVE_CLAIM" ? "TOP_UP" : "GRAPH",
              state: (
                a.action === "PROVE_D27"
                  ? !!s.d27Observation
                  : a.action === "PROVE_CI51"
                    ? !!s.ci51Observation
                    : a.action === "FUND_NATIVE_CLAIM"
                      ? current.row?.native?.status === "OBSERVED"
                      : a.action === "ISSUE_CLAIM"
                        ? current.row?.status === "ISSUED"
                        : false
              )
                ? "CONFIRMED"
                : "UNKNOWN",
              disposition: null,
            }));
            if (s.withdrawal)
              requests.push({
                requestId: "device_root_w39_" + s.withdrawal.consent.jobId,
                assetId: seed.asset.assetId,
                kind: "EXIT",
                state:
                  s.withdrawal.stage === "CONFIRMED" ? "CONFIRMED" : "UNKNOWN",
                disposition: null,
              });
            if (s.redemption)
              requests.push({
                requestId: "device_root_native_" + s.redemption.requestId,
                assetId: seed.asset.assetId,
                kind: "EXIT",
                state:
                  s.redemption.status === "DISCHARGED"
                    ? "CONFIRMED"
                    : "UNKNOWN",
                disposition: null,
              });
            const fresh = ["LIVE", "SPENT"].includes(current.note.state);
            return freeze({
              descriptor,
              asset: seed.asset,
              identity: seed.ownerIdentitySHA256,
              assets: [
                {
                  asset: seed.asset,
                  status: fresh ? "LIVE" : "UNAVAILABLE",
                  observed: fresh
                    ? {
                        blockNumber: current.v.head.number,
                        blockHash: current.v.head.hash,
                        timestamp: current.v.head.timestamp,
                      }
                    : null,
                  balances: fresh
                    ? {
                        available: current.note.available ?? "0",
                        reserved: "0",
                        locked: "0",
                        recovery: "0",
                      }
                    : null,
                  backing: fresh ? current.note.backing : null,
                  requests,
                },
              ],
              journal: requests,
              revision: null,
              checkpoint: {
                source: s,
                deposit: current.row,
                observedHead: current.v.head,
                note: current.note,
              },
            });
          },
          { readOrReconcile: true },
        ),
      quoteW39: deny,
      reviewW39: deny,
      reviewD27: deny,
      submitD27: deny,
      reviewCI51: deny,
      submitCI51: deny,
      effectChallenge: deny,
      authorizeEffect: deny,
      close() {
        assert.equal(arguments.length, 0);
        stopped = true;
        challenges.clear();
        exitChallenges.clear();
        return Promise.resolve({
          closed: true,
          inFlight: 0,
          observationOnly: true,
        });
      },
    });
    registerIntakeReference(api, {
      controller: ctx.controller,
      runtime: seed.runtime,
      claims: seed.claims,
      i: seed.i,
      asset: seed.asset,
      ownerIdentitySHA256: seed.ownerIdentitySHA256,
      alive,
    });
    return api;
  }
  function retainOriginalDeviceRootClaimObservationV3(intake) {
    assert.equal(arguments.length, 1);
    const s = intakeState(intake);
    assert.ok(
      s?.retainObservation,
      "CLAIM_DEVICE_ROOT_ORIGINAL_INTAKE_REQUIRED",
    );
    s.alive();
    return s.retainObservation();
  }
  async function reopenOriginalDeviceRootClaimObservationV3(token, controller) {
    assert.equal(arguments.length, 2);
    const seed = deviceRootClaimObservationRestartsV3.get(token),
      next = controllerState(controller);
    assert.ok(
      seed && !seed.used && next,
      "CLAIM_DEVICE_ROOT_ORIGINAL_RESTART_REQUIRED",
    );
    const previous = controllerState(seed.controller);
    assert.equal(
      previous?.replacement,
      controller,
      "CLAIM_DEVICE_ROOT_ORIGINAL_CONTROLLER_REPLACEMENT",
    );
    for (const k of ["runtime", "claims", "keeper"])
      assert.equal(
        next.input[k],
        seed[k],
        "CLAIM_DEVICE_ROOT_ORIGINAL_RESTART_SOURCE",
      );
    next.live();
    seed.used = true;
    return next.serial(
      async () => {
        assert.deepEqual(
          (await next.journal.read()).apiDeviceRootClaims?.[0],
          seed.source,
          "CLAIM_DEVICE_ROOT_RETAINED_OBSERVATION_CHANGED",
        );
        return originalDeviceRootClaimObservationFacadeV3(seed, {
          ...next,
          controller,
        });
      },
      { readOrReconcile: true },
    );
  }
  return Object.freeze({
    issueOriginalObservationV3,
    retainOriginalDeviceRootClaimObservationV3,
    reopenOriginalDeviceRootClaimObservationV3,
  });
}
