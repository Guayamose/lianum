// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
interface SepoliaMorphoV2DeliveryToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
    function transfer(address receiver, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
interface SepoliaMorphoV2DeliveryStaticToken is SepoliaMorphoV2DeliveryToken {
    function liquidityAdapter() external view returns (address);
    function decimals() external view returns (uint8);
    function asset() external view returns (address);
    function previewMint(uint256 shares) external view returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
}
interface SepoliaMorphoV2DeliveryPrivatePool {
    function asset() external view returns (address);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external payable;
}

/// Shares of the existing official-factory Sepolia Morpho VaultV2, using Circle
/// USDC6 and shares18. A third-party curator controls its policies and liquidity.
/// PAEG reservation, device consent and the protected provider signer are external.
/// Fixed vault/adapter lineage and Circle proxy upgrades are trust assumptions;
/// the off-chain Original reader also pins current proxy implementations before
/// submission and acceptance. This contract cannot inspect another proxy's storage.
interface SepoliaMorphoV2DeliveryFactory { function isVaultV2(address vault) external view returns (bool); }
contract PrivateMorphoVaultV2DeliverySepoliaV4 {
    struct Route { uint128 maximumInput; uint64 outputAmount; uint64 validFrom; uint64 validUntil; }
    address public immutable solver;
    SepoliaMorphoV2DeliveryToken public immutable inputAsset;
    SepoliaMorphoV2DeliveryStaticToken public immutable outputAsset;
    address public immutable protocol;
    SepoliaMorphoV2DeliveryPrivatePool public immutable targetPool;
    bytes32 public immutable inputCode;
    bytes32 public immutable outputCode;
    bytes32 public immutable protocolCode;
    bytes32 public immutable poolCode;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    mapping(bytes32 => bool) public consumed;
    bool private entered;
    event Delivered(bytes32 indexed receiptCommitment, bytes32 descriptor, bytes32 ownerOutput, uint256 inputSpent, uint64 outputAmount);

    constructor(address solver_, address pool_) {
        address input_ = address(bytes20(hex"1c7d4b196cb0c7b01d743fbc6116a902379c7238"));
        address static_ = address(bytes20(hex"96923a7fa4fd47f937a4948092d79bb3d46c03fe"));
        require(block.chainid == 11155111 && solver_ != address(0), "MORPHO_V2_SEPOLIA_ONLY");
        require(SepoliaMorphoV2DeliveryFactory(address(bytes20(hex"b3fe2d5f8af90f194b01db546397058fcebb85d1"))).isVaultV2(static_) &&
            SepoliaMorphoV2DeliveryStaticToken(static_).decimals() == 18 &&
            SepoliaMorphoV2DeliveryStaticToken(static_).liquidityAdapter() == address(bytes20(hex"8f6b58f129e73552bfcdbe4e4ed0528b868b7f44")), "MORPHO_V2_OFFICIAL_POSITION");
        require(input_.code.length != 0 && static_.code.length != 0 && pool_.code.length != 0 && input_ != static_, "MORPHO_V2_ROUTER_CODE");
        require(SepoliaMorphoV2DeliveryStaticToken(static_).asset() == input_ && SepoliaMorphoV2DeliveryPrivatePool(pool_).asset() == static_, "MORPHO_V2_ORIGINAL_ASSETS");
        solver = solver_; inputAsset = SepoliaMorphoV2DeliveryToken(input_); outputAsset = SepoliaMorphoV2DeliveryStaticToken(static_);
        protocol = static_; targetPool = SepoliaMorphoV2DeliveryPrivatePool(pool_);
        inputCode = sha256(input_.code); outputCode = sha256(static_.code); protocolCode = outputCode; poolCode = sha256(pool_.code);
        scope = targetPool.scope(); policy = targetPool.policy();
    }
    function _digest(bytes32[] calldata words, uint256 start) private pure returns (bytes32) {
        uint256 accumulator;
        for (uint256 i; i < 8; ++i) {
            uint256 value = uint256(words[start+i]); require(value <= type(uint32).max, "MORPHO_V2_D27_DIGEST_WORD");
            accumulator = (accumulator << 32) | value;
        }
        return bytes32(accumulator);
    }
    function _word(address value) private pure returns (bytes32) { return bytes32(uint256(uint160(value))); }
    function descriptor(Route calldata route, bytes32 ownerOutput) public view returns (bytes32) {
        bytes32[20] memory words = [sha256(bytes("LIANUM/EXTERNAL/EXACT-OUTPUT/1")),bytes32(block.chainid),
            _word(address(this)),_word(solver),_word(address(inputAsset)),_word(address(outputAsset)),_word(protocol),_word(address(targetPool)),
            inputCode,outputCode,protocolCode,poolCode,scope,policy,sha256(bytes("MORPHO_VAULT_V2_EXACT_SHARE_MINT")),
            bytes32(uint256(route.maximumInput)),bytes32(uint256(route.outputAmount)),bytes32(uint256(route.validFrom)),
            bytes32(uint256(route.validUntil)),ownerOutput];
        return sha256(abi.encode(words));
    }
    function deliver(bytes32 receiptCommitment, bytes32 claimedDescriptor, Route calldata route, bytes calldata proof, bytes32[] calldata inputs) external {
        require(msg.sender == solver && !entered && !consumed[receiptCommitment] && receiptCommitment != bytes32(0), "MORPHO_V2_SOLVER_OR_REPLAY");
        require(inputs.length == 27 && _digest(inputs,0) == scope && _digest(inputs,8) == policy, "MORPHO_V2_ORIGINAL_D27_DOMAIN");
        require(route.outputAmount >= 1000000000000000000 && route.maximumInput != 0 && route.validFrom < route.validUntil, "MORPHO_V2_EXACT_ROUTE");
        require(block.timestamp >= route.validFrom && block.timestamp < route.validUntil, "MORPHO_V2_ROUTE_WINDOW");
        require(uint256(inputs[16]) <= route.validFrom && route.validUntil <= uint256(inputs[17]) && uint256(inputs[18]) == route.outputAmount, "MORPHO_V2_OWNER_TERMS");
        bytes32 ownerOutput = _digest(inputs,19); require(ownerOutput != bytes32(0), "MORPHO_V2_OWNER_OUTPUT");
        require(claimedDescriptor == descriptor(route,ownerOutput), "MORPHO_V2_EXACT_DESCRIPTOR");
        require(sha256(address(inputAsset).code) == inputCode && sha256(address(outputAsset).code) == outputCode &&
            sha256(address(targetPool).code) == poolCode, "MORPHO_V2_DEPENDENCY_CODE");
        entered = true; consumed[receiptCommitment] = true;
        uint256 inputBefore = inputAsset.balanceOf(address(this));
        uint256 sharesBefore = outputAsset.balanceOf(address(this));
        uint256 spent = outputAsset.previewMint(route.outputAmount); require(spent > 0 && spent <= route.maximumInput, "MORPHO_V2_INPUT_LIMIT");
        require(inputAsset.transferFrom(solver,address(this),route.maximumInput), "MORPHO_V2_INPUT_TRANSFER");
        require(inputAsset.balanceOf(address(this)) == inputBefore + route.maximumInput, "MORPHO_V2_EXACT_INPUT");
        require(inputAsset.approve(protocol,spent), "MORPHO_V2_EXACT_PROTOCOL_APPROVAL");
        require(outputAsset.mint(route.outputAmount,address(this)) == spent, "MORPHO_V2_OFFICIAL_PREVIEW_MINT");
        require(outputAsset.balanceOf(address(this)) == sharesBefore + route.outputAmount, "MORPHO_V2_EXACT_STATIC_SHARES");
        uint256 refund = route.maximumInput - spent;
        if (refund != 0) require(inputAsset.transfer(solver,refund), "MORPHO_V2_EXACT_REFUND");
        require(inputAsset.balanceOf(address(this)) == inputBefore, "MORPHO_V2_NO_RETAINED_INPUT");
        require(inputAsset.approve(protocol,0) && outputAsset.approve(address(targetPool),route.outputAmount), "MORPHO_V2_APPROVALS");
        targetPool.depositBalanceIntent(proof,inputs);
        require(outputAsset.balanceOf(address(this)) == sharesBefore, "MORPHO_V2_NO_RETAINED_SHARES");
        require(outputAsset.approve(address(targetPool),0), "MORPHO_V2_CLEAR_POOL_APPROVAL");
        entered = false; emit Delivered(receiptCommitment,claimedDescriptor,ownerOutput,spent,route.outputAmount);
    }
}
