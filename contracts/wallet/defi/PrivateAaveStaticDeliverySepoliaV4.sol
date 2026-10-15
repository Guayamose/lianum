// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
interface SepoliaAaveDeliveryToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
    function transfer(address receiver, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
interface SepoliaAaveDeliveryStaticToken is SepoliaAaveDeliveryToken {
    function POOL() external view returns (address);
    function aToken() external view returns (address);
    function decimals() external view returns (uint8);
    function asset() external view returns (address);
    function previewMint(uint256 shares) external view returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
}
interface SepoliaAaveDeliveryPrivatePool {
    function asset() external view returns (address);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external payable;
}

/// Exact official Sepolia Aave static shares deposited by the original D27.
/// PAEG reservation, device consent and the protected provider signer are external.
/// Public fixed token addresses and Aave governance upgrades are trust assumptions;
/// the off-chain Original reader also pins current proxy implementations before
/// submission and acceptance. This contract cannot inspect another proxy's storage.
contract PrivateAaveStaticDeliverySepoliaV4 {
    struct Route { uint128 maximumInput; uint64 outputAmount; uint64 validFrom; uint64 validUntil; }
    address public immutable solver;
    SepoliaAaveDeliveryToken public immutable inputAsset;
    SepoliaAaveDeliveryStaticToken public immutable outputAsset;
    address public immutable protocol;
    SepoliaAaveDeliveryPrivatePool public immutable targetPool;
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
        address input_ = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
        address static_ = 0x8A88124522dbBF1E56352ba3DE1d9F78C143751e;
        require(block.chainid == 11155111 && solver_ != address(0), "AAVE_SEPOLIA_ONLY");
        require(SepoliaAaveDeliveryStaticToken(static_).POOL() == 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951 &&
            SepoliaAaveDeliveryStaticToken(static_).aToken() == 0x16dA4541aD1807f4443d92D26044C1147406EB80 &&
            SepoliaAaveDeliveryStaticToken(static_).decimals() == 6, "AAVE_SEPOLIA_OFFICIAL_POSITION");
        require(input_.code.length != 0 && static_.code.length != 0 && pool_.code.length != 0 && input_ != static_, "AAVE_ROUTER_CODE");
        require(SepoliaAaveDeliveryStaticToken(static_).asset() == input_ && SepoliaAaveDeliveryPrivatePool(pool_).asset() == static_, "AAVE_ORIGINAL_ASSETS");
        solver = solver_; inputAsset = SepoliaAaveDeliveryToken(input_); outputAsset = SepoliaAaveDeliveryStaticToken(static_);
        protocol = static_; targetPool = SepoliaAaveDeliveryPrivatePool(pool_);
        inputCode = sha256(input_.code); outputCode = sha256(static_.code); protocolCode = outputCode; poolCode = sha256(pool_.code);
        scope = targetPool.scope(); policy = targetPool.policy();
    }
    function _digest(bytes32[] calldata words, uint256 start) private pure returns (bytes32) {
        uint256 accumulator;
        for (uint256 i; i < 8; ++i) {
            uint256 value = uint256(words[start+i]); require(value <= type(uint32).max, "AAVE_D27_DIGEST_WORD");
            accumulator = (accumulator << 32) | value;
        }
        return bytes32(accumulator);
    }
    function _word(address value) private pure returns (bytes32) { return bytes32(uint256(uint160(value))); }
    function descriptor(Route calldata route, bytes32 ownerOutput) public view returns (bytes32) {
        bytes32[20] memory words = [sha256(bytes("LIANUM/EXTERNAL/EXACT-OUTPUT/1")),bytes32(block.chainid),
            _word(address(this)),_word(solver),_word(address(inputAsset)),_word(address(outputAsset)),_word(protocol),_word(address(targetPool)),
            inputCode,outputCode,protocolCode,poolCode,scope,policy,sha256(bytes("AAVE_V3_STATIC_EXACT_SHARE_MINT")),
            bytes32(uint256(route.maximumInput)),bytes32(uint256(route.outputAmount)),bytes32(uint256(route.validFrom)),
            bytes32(uint256(route.validUntil)),ownerOutput];
        return sha256(abi.encode(words));
    }
    function deliver(bytes32 receiptCommitment, bytes32 claimedDescriptor, Route calldata route, bytes calldata proof, bytes32[] calldata inputs) external {
        require(msg.sender == solver && !entered && !consumed[receiptCommitment] && receiptCommitment != bytes32(0), "AAVE_SOLVER_OR_REPLAY");
        require(inputs.length == 27 && _digest(inputs,0) == scope && _digest(inputs,8) == policy, "AAVE_ORIGINAL_D27_DOMAIN");
        require(route.outputAmount >= 1000000 && route.maximumInput != 0 && route.validFrom < route.validUntil, "AAVE_EXACT_ROUTE");
        require(block.timestamp >= route.validFrom && block.timestamp < route.validUntil, "AAVE_ROUTE_WINDOW");
        require(uint256(inputs[16]) <= route.validFrom && route.validUntil <= uint256(inputs[17]) && uint256(inputs[18]) == route.outputAmount, "AAVE_OWNER_TERMS");
        bytes32 ownerOutput = _digest(inputs,19); require(ownerOutput != bytes32(0), "AAVE_OWNER_OUTPUT");
        require(claimedDescriptor == descriptor(route,ownerOutput), "AAVE_EXACT_DESCRIPTOR");
        require(sha256(address(inputAsset).code) == inputCode && sha256(address(outputAsset).code) == outputCode &&
            sha256(address(targetPool).code) == poolCode, "AAVE_DEPENDENCY_CODE");
        entered = true; consumed[receiptCommitment] = true;
        uint256 inputBefore = inputAsset.balanceOf(address(this));
        uint256 sharesBefore = outputAsset.balanceOf(address(this));
        uint256 spent = outputAsset.previewMint(route.outputAmount); require(spent > 0 && spent <= route.maximumInput, "AAVE_INPUT_LIMIT");
        require(inputAsset.transferFrom(solver,address(this),route.maximumInput), "AAVE_INPUT_TRANSFER");
        require(inputAsset.balanceOf(address(this)) == inputBefore + route.maximumInput, "AAVE_EXACT_INPUT");
        require(inputAsset.approve(protocol,spent), "AAVE_EXACT_PROTOCOL_APPROVAL");
        require(outputAsset.mint(route.outputAmount,address(this)) == spent, "AAVE_OFFICIAL_PREVIEW_MINT");
        require(outputAsset.balanceOf(address(this)) == sharesBefore + route.outputAmount, "AAVE_EXACT_STATIC_SHARES");
        uint256 refund = route.maximumInput - spent;
        if (refund != 0) require(inputAsset.transfer(solver,refund), "AAVE_EXACT_REFUND");
        require(inputAsset.balanceOf(address(this)) == inputBefore, "AAVE_NO_RETAINED_INPUT");
        require(inputAsset.approve(protocol,0) && outputAsset.approve(address(targetPool),route.outputAmount), "AAVE_APPROVALS");
        targetPool.depositBalanceIntent(proof,inputs);
        require(outputAsset.balanceOf(address(this)) == sharesBefore, "AAVE_NO_RETAINED_SHARES");
        require(outputAsset.approve(address(targetPool),0), "AAVE_CLEAR_POOL_APPROVAL");
        entered = false; emit Delivered(receiptCommitment,claimedDescriptor,ownerOutput,spent,route.outputAmount);
    }
}
