// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Transparent local-test authority, NOT a native atomic-swap protocol.
/// @dev The immutable observer is trusted for native identities, successful
/// transfers, canonical chain membership, finality and observation times.
/// No Solana/Bitcoin consensus, native signatures or private proofs are verified.
contract LocalTripleDeliveryEscrow {
    enum State { ABSENT, OPEN, PAID, REFUNDED }

    struct Reservation {
        address owner;
        address solver;
        uint128 amount;
        bytes32 orderHash;
        bytes32 solSender;
        bytes32 solRecipient;
        uint64 solLamports;
        bytes32 btcScriptHash;
        uint64 ratioNumerator;
        uint64 ratioDenominator;
        uint32 minimumConfirmations;
        uint64 executeBy;
        uint64 claimBy;
        uint64 openedAt;
        State state;
    }

    struct SolanaResult {
        bytes32 effect;
        bytes32 parent;
        bytes32 signatureA;
        bytes32 signatureB;
        uint64 slot;
        uint64 actualLamports;
        uint64 sats;
        uint64 observedAt;
        uint64 certifiedAt;
    }

    address public immutable observer;
    bytes32 public immutable evmGenesis;
    bytes32 public immutable solanaGenesis;
    bytes32 public immutable bitcoinGenesis;
    uint32 public constant AUTHORITY_VERSION = 14;
    uint32 public constant MIN_CONFIRMATIONS = 6;
    uint64 public constant MAX_RATIO_COMPONENT = 1_000_000_000_000;
    uint64 public constant MAX_BITCOIN_SATS = 2_100_000_000_000_000;

    mapping(bytes32 => Reservation) public reservations;
    mapping(bytes32 => SolanaResult) public solanaResults;
    // Permanent for this deployment, shared by every reservation, owner and
    // session. Refund deliberately never releases a certified native effect.
    mapping(bytes32 => bool) public consumedSolanaEffect;
    mapping(bytes32 => bool) public consumedBitcoinEffect;
    uint256 private entered;

    event Locked(bytes32 indexed id, address indexed owner, bytes32 orderHash, uint128 amount, bytes32 lock);
    event SolanaCertified(bytes32 indexed id, bytes32 indexed effect, bytes32 parent, uint64 slot, uint64 lamports, uint64 sats);
    event Paid(bytes32 indexed id, bytes32 indexed bitcoinEffect, bytes32 solanaParent, bytes32 txid, uint32 vout, uint64 sats);
    event Refunded(bytes32 indexed id, bytes32 retainedSolanaEffect);

    modifier guarded() {
        require(entered == 0, "REENTRANCY");
        entered = 1;
        _;
        entered = 0;
    }

    constructor(address observer_, bytes32 evmGenesis_, bytes32 solanaGenesis_, bytes32 bitcoinGenesis_) {
        require(observer_ != address(0) && evmGenesis_ != 0 && solanaGenesis_ != 0 && bitcoinGenesis_ != 0, "CONFIG");
        observer = observer_;
        evmGenesis = evmGenesis_;
        solanaGenesis = solanaGenesis_;
        bitcoinGenesis = bitcoinGenesis_;
    }

    function authorityDomain() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("LOCAL_TRIPLE_DELIVERY_AUTHORITY"), AUTHORITY_VERSION,
            block.chainid, evmGenesis, address(this), observer, solanaGenesis, bitcoinGenesis
        ));
    }

    function deriveId(address owner, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(authorityDomain(), owner, salt));
    }

    function reserve(
        bytes32 salt, bytes32 orderHash, address solver,
        bytes32 solSender, bytes32 solRecipient, uint64 solLamports,
        bytes32 btcScriptHash, uint64 ratioNumerator, uint64 ratioDenominator,
        uint32 minimumConfirmations, uint64 executeBy, uint64 claimBy
    ) external payable guarded {
        bytes32 id = deriveId(msg.sender, salt);
        require(salt != 0 && reservations[id].state == State.ABSENT, "ID");
        require(orderHash != 0 && solver != address(0) && msg.value > 0 && msg.value <= type(uint128).max, "TERMS");
        require(solSender != 0 && solRecipient != 0 && solSender != solRecipient && solLamports > 0 && btcScriptHash != 0, "DELIVERY_TERMS");
        require(block.timestamp <= type(uint64).max && block.timestamp < executeBy && executeBy < claimBy, "DEADLINES");
        require(minimumConfirmations >= MIN_CONFIRMATIONS, "CONFIRMATIONS_POLICY");
        _computedSats(solLamports, ratioNumerator, ratioDenominator);
        reservations[id] = Reservation(
            msg.sender, solver, uint128(msg.value), orderHash, solSender, solRecipient, solLamports,
            btcScriptHash, ratioNumerator, ratioDenominator, minimumConfirmations,
            executeBy, claimBy, uint64(block.timestamp), State.OPEN
        );
        emit Locked(id, msg.sender, orderHash, uint128(msg.value), lockDigest(id));
    }

    /// @dev Commits every immutable owner-authorized term. State is excluded so
    /// the lock identity does not change after certification, payment or refund.
    function lockDigest(bytes32 id) public view returns (bytes32) {
        Reservation storage r = reservations[id];
        require(r.state != State.ABSENT, "ABSENT_RESERVATION");
        return keccak256(abi.encode(
            keccak256("LOCAL_TRIPLE_LOCK"), authorityDomain(), id,
            r.owner, r.solver, r.amount, r.orderHash, r.solSender, r.solRecipient,
            r.solLamports, r.btcScriptHash, r.ratioNumerator, r.ratioDenominator,
            r.minimumConfirmations, r.openedAt, r.executeBy, r.claimBy
        ));
    }

    function _computedSats(uint64 lamports, uint64 numerator, uint64 denominator) private pure returns (uint64) {
        require(numerator > 0 && numerator <= MAX_RATIO_COMPONENT && denominator > 0 && denominator <= MAX_RATIO_COMPONENT, "RATIO");
        // uint64 * at most 10^12 < 2^104, so multiplication cannot overflow
        // uint256. There is one floor division, then an explicit uint64 bound.
        uint256 sats = uint256(lamports) * uint256(numerator) / uint256(denominator);
        require(sats > 0 && sats <= MAX_BITCOIN_SATS, "BTC_BOUND");
        return uint64(sats);
    }

    function expectedSats(bytes32 id, uint64 actualLamports) public view returns (uint64) {
        Reservation storage r = reservations[id];
        require(r.state != State.ABSENT, "ABSENT_RESERVATION");
        require(actualLamports == r.solLamports, "SOL_AMOUNT");
        return _computedSats(actualLamports, r.ratioNumerator, r.ratioDenominator);
    }

    /// @dev Native IDs NEVER include reservation, order, graph, owner or session.
    /// The authority version belongs in authorization digests, not in these
    /// native identities. Maps are global within this deployment, not across
    /// independent EVM contracts or copied chains.
    function solanaEffectId(bytes32 signatureA, bytes32 signatureB, uint32 instructionIndex) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("NATIVE_SOLANA_SYSTEM_TRANSFER"), solanaGenesis, signatureA, signatureB, instructionIndex));
    }

    function bitcoinEffectId(bytes32 txid, uint32 vout) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("NATIVE_BITCOIN_OUTPUT"), bitcoinGenesis, txid, vout));
    }

    function parentDigest(bytes32 id) external view returns (bytes32) {
        return solanaResults[id].parent;
    }

    function certifySolana(
        bytes32 id, bytes32 signatureA, bytes32 signatureB, uint32 instructionIndex,
        uint64 slot, bool success, bool finalized, bytes32 sender, bytes32 recipient,
        uint64 actualLamports, uint64 observedAt
    ) external guarded {
        require(msg.sender == observer, "OBSERVER");
        Reservation storage r = reservations[id];
        require(r.state == State.OPEN, "STATE");
        require(solanaResults[id].parent == 0, "SOL_ALREADY_CERTIFIED");
        require(block.timestamp < r.claimBy, "CLAIM_EXPIRED");
        require(observedAt >= r.openedAt && observedAt <= r.executeBy && observedAt <= block.timestamp, "OBSERVED_TIME");
        // This profile admits exactly the sole top-level SystemProgram transfer
        // at index 0. The observer must reject other instruction topologies.
        require((signatureA != 0 || signatureB != 0) && instructionIndex == 0 && slot > 0, "SOL_IDENTITY");
        require(success && finalized, "SOL_RESULT");
        require(sender == r.solSender && recipient == r.solRecipient, "SOL_PARTIES");
        uint64 sats = expectedSats(id, actualLamports);
        bytes32 effect = solanaEffectId(signatureA, signatureB, instructionIndex);
        require(!consumedSolanaEffect[effect], "SOL_EFFECT_CONSUMED");
        bytes32 parent = keccak256(abi.encode(
            keccak256("LOCAL_TRIPLE_SOLANA_PARENT"), authorityDomain(), lockDigest(id), effect,
            signatureA, signatureB, instructionIndex, slot, success, finalized,
            sender, recipient, actualLamports, sats, observedAt
        ));
        consumedSolanaEffect[effect] = true;
        solanaResults[id] = SolanaResult(effect, parent, signatureA, signatureB, slot, actualLamports, sats, observedAt, uint64(block.timestamp));
        emit SolanaCertified(id, effect, parent, slot, actualLamports, sats);
    }

    function claimBitcoin(
        bytes32 id, bytes32 parent, bytes32 txid, uint32 vout,
        bytes32 scriptHash, uint64 sats, uint32 confirmations, uint64 observedAt
    ) external guarded {
        require(msg.sender == observer, "OBSERVER");
        Reservation storage r = reservations[id];
        SolanaResult storage sol = solanaResults[id];
        require(r.state == State.OPEN, "STATE");
        require(block.timestamp < r.claimBy, "CLAIM_EXPIRED");
        require(sol.parent != 0 && parent == sol.parent, "SOL_PARENT");
        require(observedAt >= r.openedAt && observedAt >= sol.certifiedAt && observedAt <= r.executeBy && observedAt <= block.timestamp, "OBSERVED_TIME");
        require(txid != 0 && scriptHash == r.btcScriptHash && sats == sol.sats && sats == expectedSats(id, sol.actualLamports), "BTC_DELIVERY");
        require(confirmations >= r.minimumConfirmations, "BTC_CONFIRMATIONS");
        bytes32 effect = bitcoinEffectId(txid, vout);
        require(!consumedBitcoinEffect[effect], "BTC_EFFECT_CONSUMED");
        consumedBitcoinEffect[effect] = true;
        r.state = State.PAID;
        emit Paid(id, effect, parent, txid, vout, sats);
        (bool sent,) = r.solver.call{value: r.amount}("");
        require(sent, "PAYMENT_FAILED");
    }

    function refund(bytes32 id) external guarded {
        Reservation storage r = reservations[id];
        require(r.state == State.OPEN && msg.sender == r.owner, "STATE_OWNER");
        require(block.timestamp >= r.claimBy, "REFUND_EARLY");
        r.state = State.REFUNDED;
        emit Refunded(id, solanaResults[id].effect);
        (bool sent,) = r.owner.call{value: r.amount}("");
        require(sent, "REFUND_FAILED");
    }
}
