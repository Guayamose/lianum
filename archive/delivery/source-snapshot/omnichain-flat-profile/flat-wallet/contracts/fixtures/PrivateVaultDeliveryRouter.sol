// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IPrivateDeliveryToken {
    function balanceOf(address holder) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function decimals() external view returns (uint8);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
}

interface IPrivateDeliveryVault is IPrivateDeliveryToken {
    function asset() external view returns (address);
    function assetCodeSHA256() external view returns (bytes32);
    function genesisHash() external view returns (bytes32);
    function domain() external view returns (bytes32);
    function runtimeId() external view returns (bytes32);
    function totalAssets() external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
}

interface IPrivateDeliveryPool {
    function asset() external view returns (address);
    function assetCodeHash() external view returns (bytes32);
    function assetIdentity() external view returns (bytes32);
    function domainCommitment() external view returns (bytes32);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function backedAmount() external view returns (uint256);
    function leafCount() external view returns (uint32);
    function spentCount() external view returns (uint32);
    function liveReservations() external view returns (uint32);
    function outputCapacity() external view returns (uint32);
    function stateSequence() external view returns (uint64);
    function currentRoot() external view returns (bytes32);
    function spentDigest() external view returns (bytes32);
    function rootHistoryCount() external view returns (uint32);
    function authorizationRoot() external view returns (bytes32);
    function authorizationLeafCount() external view returns (uint32);
    function authorizationRootHistoryCount() external view returns (uint32);
    function insertedCommitments(bytes32 output) external view returns (bool);
    function noteLeaves() external view returns (bytes32[64] memory);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external;
}

/// @notice Owned local fake-value, solver-funded vault delivery. This contract
/// creates no synthetic note credit and does not establish PAEG settlement.
/// The pinned pool verifies the owner's D27 proof and uses its original Q set.
/// There is no owner, upgrade, rescue, arbitrary target, callback or delegatecall.
contract PrivateVaultDeliveryRouter {
    uint32 public constant ROUTER_VERSION = 1;
    uint32 public constant ADAPTER_VERSION = 1;
    uint256 public constant LIMIT = type(uint128).max;
    uint256 public constant CAPACITY = 64;
    uint256 public constant MAX_BACKED_AMOUNT = CAPACITY * type(uint64).max;
    uint256 public constant MAX_PROOF_BYTES = 65536;
    bytes4 public constant DELIVERY_SELECTOR = bytes4(keccak256(
        "deliver(bytes32,bytes32,(uint128,uint64,uint64,uint64),bytes,bytes32[])"
    ));
    bytes4 public constant DEPOSIT_SELECTOR = IPrivateDeliveryPool.depositBalanceIntent.selector;

    struct Deployment {
        address solver;
        address asset;
        address vault;
        address targetPool;
        bytes32 assetCodeSHA256;
        bytes32 vaultCodeSHA256;
        bytes32 targetPoolCodeSHA256;
        bytes32 genesisHash;
        bytes32 ledgerNamespace;
        bytes32 vaultDomain;
        bytes32 vaultRuntimeId;
        bytes32 targetDomain;
        bytes32 targetScope;
        bytes32 targetPolicy;
    }
    struct Route {
        uint128 assetAmount;
        uint64 shareAmount;
        uint64 executionFrom;
        uint64 executionUntil;
    }
    struct Snapshot {
        uint256 assetSupply;
        uint256 solverAssets;
        uint256 solverShares;
        uint256 routerAssets;
        uint256 routerShares;
        uint256 routerNative;
        uint256 vaultAssets;
        uint256 vaultShares;
        uint256 poolAssets;
        uint256 poolShares;
        uint256 poolNative;
        uint256 poolBacked;
        uint32 leaves;
        uint32 spent;
        uint32 reservations;
        uint32 outputs;
        uint64 sequence;
        bytes32 root;
        bytes32 spentDigest;
        uint32 historyCount;
        bytes32 authorizationRoot;
        uint32 authorizationLeaves;
        uint32 authorizationHistoryCount;
        bytes32[64] commitments;
    }

    address public immutable solver;
    IPrivateDeliveryToken public immutable asset;
    IPrivateDeliveryVault public immutable vault;
    IPrivateDeliveryPool public immutable targetPool;
    bytes32 public immutable assetCodeSHA256;
    bytes32 public immutable vaultCodeSHA256;
    bytes32 public immutable targetPoolCodeSHA256;
    bytes32 public immutable genesisHash;
    bytes32 public immutable ledgerNamespace;
    bytes32 public immutable vaultDomain;
    bytes32 public immutable vaultRuntimeId;
    bytes32 public immutable targetDomain;
    bytes32 public immutable targetScope;
    bytes32 public immutable targetPolicy;
    bytes32 public immutable assetIdentity;
    bytes32 public immutable shareIdentity;
    mapping(bytes32 => bool) public consumedReceiptKeys;
    uint32 public deliveryCount;
    bool private entered;

    // The sole router event. It MUST precede every call to another application
    // contract. Receipt-local position zero qualifies only after full success.
    event PrivateVaultDelivered(
        bytes32 indexed ledgerNamespace,
        bytes32 indexed receiptKeyCommitment,
        bytes32 indexed descriptorCommitment,
        bytes32 outputCommitment,
        uint64 shareAmount
    );

    constructor(Deployment memory configuration) {
        require(block.chainid == 31337, "LOCAL_PRIVATE_DELIVERY_ONLY");
        address[5] memory addresses = [configuration.solver, configuration.asset,
            configuration.vault, configuration.targetPool, address(this)];
        for (uint256 i = 0; i < addresses.length; ++i) {
            require(addresses[i] != address(0), "ZERO_ADDRESS");
            for (uint256 j = 0; j < i; ++j) require(addresses[i] != addresses[j], "ALIASED_ADDRESS");
        }
        require(configuration.solver.code.length == 0, "SOLVER_EOA_REQUIRED");
        require(configuration.genesisHash != bytes32(0)
            && configuration.ledgerNamespace != bytes32(0)
            && configuration.vaultDomain != bytes32(0)
            && configuration.vaultRuntimeId != bytes32(0)
            && configuration.targetDomain != bytes32(0)
            && configuration.targetScope != bytes32(0)
            && configuration.targetPolicy != bytes32(0), "ZERO_IDENTITY");
        solver = configuration.solver;
        asset = IPrivateDeliveryToken(configuration.asset);
        vault = IPrivateDeliveryVault(configuration.vault);
        targetPool = IPrivateDeliveryPool(configuration.targetPool);
        assetCodeSHA256 = configuration.assetCodeSHA256;
        vaultCodeSHA256 = configuration.vaultCodeSHA256;
        targetPoolCodeSHA256 = configuration.targetPoolCodeSHA256;
        genesisHash = configuration.genesisHash;
        ledgerNamespace = configuration.ledgerNamespace;
        vaultDomain = configuration.vaultDomain;
        vaultRuntimeId = configuration.vaultRuntimeId;
        targetDomain = configuration.targetDomain;
        targetScope = configuration.targetScope;
        targetPolicy = configuration.targetPolicy;
        assetIdentity = _assetIdentity(configuration.asset);
        shareIdentity = _assetIdentity(configuration.vault);
        _assertIdentities();
    }

    function _assetIdentity(address token) private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x24), block.chainid, token, token.codehash));
    }
    function _code(address target, bytes32 pin) private view {
        require(target.code.length != 0 && pin != bytes32(0) && sha256(target.code) == pin, "DELIVERY_CODE");
    }
    function _assertIdentities() private view {
        require(block.chainid == 31337, "LOCAL_PRIVATE_DELIVERY_ONLY");
        _code(address(asset), assetCodeSHA256);
        _code(address(vault), vaultCodeSHA256);
        _code(address(targetPool), targetPoolCodeSHA256);
        require(asset.decimals() == 6 && vault.decimals() == 6
            && asset.totalSupply() > 0 && asset.totalSupply() <= LIMIT, "BOUNDED_ASSET");
        require(vault.asset() == address(asset) && vault.assetCodeSHA256() == assetCodeSHA256
            && vault.genesisHash() == genesisHash && vault.domain() == vaultDomain
            && vault.runtimeId() == vaultRuntimeId, "VAULT_IDENTITY");
        require(_assetIdentity(address(asset)) == assetIdentity
            && _assetIdentity(address(vault)) == shareIdentity, "ASSET_IDENTITY");
        require(targetPool.asset() == address(vault) && targetPool.assetCodeHash() == address(vault).codehash
            && targetPool.assetIdentity() == shareIdentity && targetPool.domainCommitment() == targetDomain
            && targetPool.scope() == targetScope && targetPool.policy() == targetPolicy
            && targetPool.ledgerNamespace() == ledgerNamespace, "POOL_IDENTITY");
    }
    function _part(bytes memory data) private pure returns (bytes memory) {
        return abi.encodePacked(uint32(data.length), data);
    }
    function _digest(bytes32[] calldata inputs, uint256 offset) private pure returns (bytes32) {
        uint256 digest;
        for (uint256 i = 0; i < 8; ++i) {
            require(uint256(inputs[offset + i]) <= type(uint32).max, "D27_U32");
            digest = (digest << 32) | uint32(uint256(inputs[offset + i]));
        }
        return bytes32(digest);
    }
    function _statement(Route calldata route, bytes32[] calldata inputs) private view returns (bytes32 output) {
        require(inputs.length == 27, "D27_LENGTH");
        require(_digest(inputs, 0) == targetScope && _digest(inputs, 8) == targetPolicy, "D27_DOMAIN");
        require(uint256(inputs[16]) <= type(uint64).max && uint256(inputs[17]) <= type(uint64).max
            && uint256(inputs[18]) <= type(uint64).max, "D27_U64");
        require(route.assetAmount > 0 && route.shareAmount > 0
            && uint256(inputs[18]) == route.shareAmount, "D27_AMOUNT");
        require(route.executionFrom < route.executionUntil
            && uint256(inputs[16]) < uint256(inputs[17])
            && uint256(inputs[16]) <= route.executionFrom
            && route.executionUntil <= uint256(inputs[17]), "D27_WINDOW");
        output = _digest(inputs, 19);
        require(output != bytes32(0), "D27_OUTPUT");
    }

    /// @notice SHA256 of the strict H4 semantic frame. K and proof bytes are
    /// intentionally absent: final transaction authorization freezes them later.
    /// Hash actual runtime here; a constructor runtime pin would be recursive.
    function descriptorCommitment(Route calldata route, bytes32[] calldata inputs) public view returns (bytes32) {
        _statement(route, inputs);
        bytes memory identity = bytes.concat(
            _part(bytes("LIANUM/PAEG/evm-vault-delivery/1")),
            _part(abi.encodePacked(uint256(block.chainid))), _part(abi.encodePacked(genesisHash)),
            _part(abi.encodePacked(ledgerNamespace)), _part(abi.encodePacked(ADAPTER_VERSION)),
            _part(abi.encodePacked(address(this))), _part(abi.encodePacked(sha256(address(this).code))),
            _part(abi.encodePacked(ROUTER_VERSION)), _part(abi.encodePacked(solver)),
            _part(abi.encodePacked(address(asset))), _part(abi.encodePacked(assetCodeSHA256)),
            _part(abi.encodePacked(assetIdentity)), _part(abi.encodePacked(address(vault))),
            _part(abi.encodePacked(vaultCodeSHA256)), _part(abi.encodePacked(shareIdentity)),
            _part(abi.encodePacked(vaultDomain)), _part(abi.encodePacked(vaultRuntimeId)),
            _part(abi.encodePacked(address(targetPool))), _part(abi.encodePacked(targetPoolCodeSHA256)),
            _part(abi.encodePacked(targetDomain)), _part(abi.encodePacked(targetScope)),
            _part(abi.encodePacked(targetPolicy))
        );
        return sha256(bytes.concat(identity,
            _part(abi.encodePacked(DELIVERY_SELECTOR)), _part(abi.encodePacked(DEPOSIT_SELECTOR)),
            _part(abi.encodePacked(route.assetAmount)), _part(abi.encodePacked(route.shareAmount)),
            _part(abi.encodePacked(route.executionFrom)), _part(abi.encodePacked(route.executionUntil)),
            _part(abi.encodePacked(uint256(0))), _part(abi.encodePacked(inputs))
        ));
    }

    function _snapshot() private view returns (Snapshot memory state) {
        state.assetSupply = asset.totalSupply();
        state.solverAssets = asset.balanceOf(solver);
        state.solverShares = vault.balanceOf(solver);
        state.routerAssets = asset.balanceOf(address(this));
        state.routerShares = vault.balanceOf(address(this));
        state.routerNative = address(this).balance;
        state.vaultAssets = asset.balanceOf(address(vault));
        state.vaultShares = vault.totalSupply();
        require(state.vaultAssets == vault.totalAssets() && state.vaultAssets <= LIMIT
            && state.vaultShares <= LIMIT, "VAULT_BACKING");
        state.poolAssets = asset.balanceOf(address(targetPool));
        state.poolShares = vault.balanceOf(address(targetPool));
        state.poolNative = address(targetPool).balance;
        state.poolBacked = targetPool.backedAmount();
        require(state.poolBacked <= MAX_BACKED_AMOUNT && state.poolShares >= state.poolBacked, "POOL_BACKING");
        state.leaves = targetPool.leafCount();
        state.spent = targetPool.spentCount();
        state.reservations = targetPool.liveReservations();
        state.outputs = targetPool.outputCapacity();
        state.sequence = targetPool.stateSequence();
        state.root = targetPool.currentRoot();
        state.spentDigest = targetPool.spentDigest();
        state.historyCount = targetPool.rootHistoryCount();
        state.authorizationRoot = targetPool.authorizationRoot();
        state.authorizationLeaves = targetPool.authorizationLeafCount();
        state.authorizationHistoryCount = targetPool.authorizationRootHistoryCount();
        state.commitments = targetPool.noteLeaves();
    }
    function _before(Snapshot memory beforeState, Route calldata route, bytes32 output) private view {
        require(beforeState.solverAssets >= route.assetAmount
            && beforeState.vaultAssets <= LIMIT - route.assetAmount
            && beforeState.vaultShares <= LIMIT - route.shareAmount
            && beforeState.poolBacked <= MAX_BACKED_AMOUNT - route.shareAmount, "DELIVERY_CAPACITY");
        require(uint256(beforeState.leaves) + 1 + 4 * uint256(beforeState.reservations) <= CAPACITY
            && uint256(beforeState.spent) + 5 * uint256(beforeState.reservations)
                + uint256(beforeState.outputs) + 1 <= CAPACITY
            && beforeState.sequence < type(uint64).max
            && beforeState.historyCount <= beforeState.leaves + 1
            && beforeState.authorizationLeaves <= CAPACITY
            && beforeState.authorizationHistoryCount <= beforeState.authorizationLeaves + 1, "POOL_COUNTERS");
        require(!targetPool.insertedCommitments(output) && beforeState.commitments[beforeState.leaves] == bytes32(0), "OUTPUT_ALREADY_INSERTED");
        require(asset.allowance(solver, address(this)) == route.assetAmount
            && asset.allowance(address(this), address(vault)) == 0
            && vault.allowance(address(this), address(targetPool)) == 0, "EXACT_ALLOWANCES");
        require(vault.previewDeposit(route.assetAmount) == route.shareAmount, "EXACT_VAULT_QUOTE");
    }
    function _after(Snapshot memory beforeState, Route calldata route, bytes32 output) private view {
        Snapshot memory afterState = _snapshot();
        require(afterState.assetSupply == beforeState.assetSupply
            && afterState.solverAssets == beforeState.solverAssets - route.assetAmount
            && afterState.solverShares == beforeState.solverShares
            && afterState.routerAssets == beforeState.routerAssets
            && afterState.routerShares == beforeState.routerShares
            && afterState.routerNative == beforeState.routerNative
            && afterState.vaultAssets == beforeState.vaultAssets + route.assetAmount
            && afterState.vaultShares == beforeState.vaultShares + route.shareAmount
            && afterState.poolAssets == beforeState.poolAssets
            && afterState.poolNative == beforeState.poolNative
            && afterState.poolShares == beforeState.poolShares + route.shareAmount
            && afterState.poolBacked == beforeState.poolBacked + route.shareAmount, "EXACT_DELIVERY_DELTAS");
        require(afterState.leaves == beforeState.leaves + 1
            && afterState.outputs == beforeState.outputs + 1
            && afterState.sequence == beforeState.sequence + 1
            && afterState.spent == beforeState.spent && afterState.reservations == beforeState.reservations
            && afterState.spentDigest == beforeState.spentDigest
            && afterState.root != bytes32(0) && afterState.root != beforeState.root
            && afterState.historyCount == beforeState.historyCount + 1
            && afterState.authorizationRoot == beforeState.authorizationRoot
            && afterState.authorizationLeaves == beforeState.authorizationLeaves
            && afterState.authorizationHistoryCount == beforeState.authorizationHistoryCount, "EXACT_POOL_TRANSITION");
        require(targetPool.insertedCommitments(output), "OUTPUT_NOT_INSERTED");
        for (uint256 i = 0; i < CAPACITY; ++i) {
            require(afterState.commitments[i] == (i == beforeState.leaves ? output : beforeState.commitments[i]), "EXACT_NOTE_INSERTION");
        }
        require(asset.allowance(solver, address(this)) == 0
            && asset.allowance(address(this), address(vault)) == 0
            && vault.allowance(address(this), address(targetPool)) == 0, "UNRESOLVED_ALLOWANCE");
        _assertIdentities();
    }

    function deliver(bytes32 receiptKeyCommitment, bytes32 expectedDescriptor, Route calldata route,
        bytes calldata proof, bytes32[] calldata inputs) external
    {
        require(!entered, "REENTRANCY");
        entered = true;
        require(msg.sender == solver && tx.origin == solver && solver.code.length == 0, "SOLVER_ONLY");
        require(receiptKeyCommitment != bytes32(0) && !consumedReceiptKeys[receiptKeyCommitment]
            && deliveryCount < CAPACITY, "DELIVERY_REPLAY_OR_CAPACITY");
        require(proof.length > 0 && proof.length <= MAX_PROOF_BYTES, "D27_PROOF_LENGTH");
        bytes32 output = _statement(route, inputs);
        require(route.executionFrom <= block.timestamp && block.timestamp < route.executionUntil, "DELIVERY_WINDOW");
        require(descriptorCommitment(route, inputs) == expectedDescriptor, "DELIVERY_DESCRIPTOR");
        consumedReceiptKeys[receiptKeyCommitment] = true;
        ++deliveryCount;
        emit PrivateVaultDelivered(ledgerNamespace, receiptKeyCommitment, expectedDescriptor, output, route.shareAmount);

        // No external application call has occurred before the sole router log.
        _assertIdentities();
        Snapshot memory beforeState = _snapshot();
        _before(beforeState, route, output);
        require(asset.transferFrom(solver, address(this), route.assetAmount), "ASSET_PULL");
        require(asset.balanceOf(solver) == beforeState.solverAssets - route.assetAmount
            && asset.balanceOf(address(this)) == beforeState.routerAssets + route.assetAmount, "EXACT_ASSET_PULL");
        require(asset.approve(address(vault), route.assetAmount)
            && asset.allowance(address(this), address(vault)) == route.assetAmount, "VAULT_APPROVAL");
        require(vault.deposit(route.assetAmount, address(this)) == route.shareAmount, "EXACT_VAULT_RETURN");
        require(vault.balanceOf(address(this)) == beforeState.routerShares + route.shareAmount
            && asset.balanceOf(address(this)) == beforeState.routerAssets
            && asset.allowance(address(this), address(vault)) == 0, "EXACT_VAULT_RECEIPT");
        require(vault.approve(address(targetPool), route.shareAmount)
            && vault.allowance(address(this), address(targetPool)) == route.shareAmount, "POOL_APPROVAL");
        targetPool.depositBalanceIntent(proof, inputs);
        _after(beforeState, route, output);
        entered = false;
    }
}
