/** SOURCE journal data validation. This owner has no runtime, keys, recovery
 * tokens or storage access; accepting a record never grants economic authority. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { validateProcess } from './process-identity-v1.mjs';
export const ORIGINAL_NATIVE_SOURCE_PROFILE_V1 = 'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1';
const SCHEMA = 'ORIGINAL_NATIVE_SOURCE_CAPSULE_V1', MAX_RECORD = 64 * 1024 * 1024;
/** @typedef {'receiver'|'graphNative'|'bootstrap'|'system'|'provider'|'owner'|'executor'|'account'|'session'|'actor'} Section
 * @typedef {'receiver'|'graphNative'} Family
 * @typedef {{path:string,bytes:number,sha256:string,stateSHA256:string,generation:number,genesis:unknown,head:unknown}} NativePin
 * @typedef {{profile:string,directory:string,runId:string,sourceSHA256:string,deadlineMs:number,[key:string]:unknown}} SourceIdentity */
/** @param {unknown} value @returns {value is string} */
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.exec(value)?.[0] === value;
/** @param {string} BASE */
export function createNativeSourceRecordValidatorV1(BASE) {
    /** @type {readonly Section[]} */
    const SECTIONS = Object.freeze([
        "receiver",
        "graphNative",
        "bootstrap",
        "system",
        "provider",
        "owner",
        "executor",
        "account",
        "session",
        "actor",
    ]);
    /** @type {readonly Family[]} */
    const FAMILIES = Object.freeze(["receiver", "graphNative"]);
    const SECTION_SCHEMAS = Object.freeze({
        receiver: "ORIGINAL_NATIVE_SOURCE_RUNTIME_V1",
        graphNative: "ORIGINAL_NATIVE_SOURCE_RUNTIME_V1",
        bootstrap: "ORIGINAL_NATIVE_BOOTSTRAP_DURABLE_SOURCE_V1",
        system: "ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1",
        provider: "ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1",
        owner: "ORIGINAL_NATIVE_OWNER_DURABLE_SOURCE_V1",
        executor: "ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1",
        account: "ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1",
        session: "ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1",
        actor: "ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1",
    });
    /** @param {unknown} value @returns {asserts value is SourceIdentity} */
    function validateIdentity(value) {
        exactRecord(value, [
            "profile",
            "directory",
            "runId",
            "sourceSHA256",
            "deadlineMs",
        ]);
        assert.equal(value.profile, ORIGINAL_NATIVE_SOURCE_PROFILE_V1);
        assert.ok(typeof value.runId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(value.runId)?.[0] === value.runId);
        assert.equal(value.directory, join(BASE, "realms", "realm-" + value.runId));
        assert.ok(hex(value.sourceSHA256) &&
            typeof value.deadlineMs === 'number' && Number.isSafeInteger(value.deadlineMs) &&
            value.deadlineMs > 0);
    }
    /** @param {unknown} value @param {SourceIdentity} identity @param {Section} section */
    function validateSection(value, identity, section) {
        exactRecord(value, [
            "schema",
            "sourceSHA256",
            "ownedProcesses",
            "confirmed",
            "candidate",
        ]);
        assert.equal(value.schema, SECTION_SCHEMAS[section], "NATIVE_SOURCE_SECTION_SCHEMA");
        assert.equal(value.sourceSHA256, identity.sourceSHA256, "NATIVE_SOURCE_SECTION_CLOSURE");
        assert.ok(Array.isArray(value.ownedProcesses) && value.ownedProcesses.length <= 16);
        value.ownedProcesses.forEach(validateProcess);
        assert.ok(value.confirmed &&
            typeof value.confirmed === "object" &&
            !Array.isArray(value.confirmed));
        assert.ok(value.candidate === null ||
            (value.candidate &&
                typeof value.candidate === "object" &&
                !Array.isArray(value.candidate)));
    }
    /** @param {unknown} record @param {SourceIdentity} identity */
    function validate(record, identity) {
        exactRecord(record, ["revision", "data"]);
        assert.ok(typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision >= 0);
        const d = record.data;
        exactRecord(d, [
            "schema",
            "identity",
            "phase",
            "generation",
            "creator",
            "sections",
            "native",
            "clockSecond",
        ]);
        assert.ok(typeof d.clockSecond === "string" &&
            /^(?:0|[1-9][0-9]{0,19})$/.exec(d.clockSecond)?.[0] === d.clockSecond, "NATIVE_SOURCE_ORIGINAL_CLOCK_CHECKPOINT");
        assert.equal(d.schema, SCHEMA);
        assert.deepEqual(d.identity, identity);
        validateIdentity(identity);
        assert.ok(typeof d.phase === "string" && ["SEEDING", "CONFIRMED", "OPENING", "UNKNOWN"].includes(d.phase));
        assert.ok(typeof d.generation === 'number' && Number.isSafeInteger(d.generation) &&
            d.generation >= 0 &&
            d.generation < 16);
        validateProcess(d.creator);
        exactRecord(d.sections, SECTIONS);
        exactRecord(d.native, FAMILIES);
        for (const name of SECTIONS)
            if (d.sections[name] !== null)
                validateSection(d.sections[name], identity, name);
        for (const name of FAMILIES) {
            /** @type {unknown} */
            const row = d.native[name];
            if (row === null)
                continue;
            exactRecord(row, [
                "pending",
                "confirmed",
                ...(Object.hasOwn(/** @type {object} */ (row), "candidate") ? ["candidate"] : []),
            ]);
            assert.ok(row.pending === null ||
                (typeof row.pending === 'number' && Number.isSafeInteger(row.pending) && row.pending > 0));
            if (row.confirmed !== null)
                validateNativePin(row.confirmed, name);
            if (row.candidate !== undefined && row.candidate !== null) {
                exactRecord(row.candidate, ["revision", "confirmed"]);
                assert.equal(row.candidate.revision, row.pending, "NATIVE_SOURCE_ORIGINAL_NATIVE_CANDIDATE");
                validateNativePin(row.candidate.confirmed, name);
                assert.notEqual(row.candidate.confirmed.path, (row.confirmed && typeof row.confirmed === 'object' && 'path' in row.confirmed ? row.confirmed.path : undefined), "NATIVE_SOURCE_ORIGINAL_NATIVE_CANDIDATE");
            }
        }
    }
    /** @param {unknown} pin @param {Family} family @returns {asserts pin is NativePin} */
    function validateNativePin(pin, family) {
        exactRecord(pin, [
            "path",
            "bytes",
            "sha256",
            "stateSHA256",
            "generation",
            "genesis",
            "head",
        ]);
        assert.ok(typeof pin.path === "string" && [
            family + "-confirmed.aead",
            family + "-confirmed-0.aead",
            family + "-confirmed-1.aead",
        ].includes(pin.path), "NATIVE_SOURCE_ORIGINAL_NATIVE_PATH");
        assert.ok(typeof pin.bytes === 'number' && Number.isSafeInteger(pin.bytes) &&
            pin.bytes > 0 &&
            pin.bytes <= MAX_RECORD &&
            hex(pin.sha256) &&
            hex(pin.stateSHA256) &&
            typeof pin.generation === 'number' && Number.isSafeInteger(pin.generation) &&
            pin.generation >= 0 &&
            pin.generation < 16);
    }
    return Object.freeze({ SECTIONS, FAMILIES, SECTION_SCHEMAS, validateIdentity, validateSection, validate, validateNativePin });
}
