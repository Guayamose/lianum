// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
interface MorphoBlueDeliveryToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
    function transfer(address receiver, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}
interface MorphoBlueDeliveryPositionToken is MorphoBlueDeliveryToken {
    function POSITION_PROFILE() external view returns (bytes32);
    function asset() external view returns (address);
    function previewMint(uint256 shares) external view returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
}
interface MorphoBlueDeliveryPrivatePool {
    function asset() external view returns (address);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external payable;
}

/// Exact output of a new original Morpho Blue position, atomically deposited with the
/// owner's original D27. The source reservation/quorum/PAEG remains external.
contract PrivateMorphoBluePositionDeliveryV1 {
    struct Route { uint128 maximumInput; uint64 outputAmount; uint64 validFrom; uint64 validUntil; }
    address public immutable solver;
    MorphoBlueDeliveryToken public immutable inputAsset;
    MorphoBlueDeliveryPositionToken public immutable outputAsset;
    address public immutable protocol;
    MorphoBlueDeliveryPrivatePool public immutable targetPool;
    bytes32 public immutable inputCode;
    bytes32 public immutable outputCode;
    bytes32 public immutable protocolCode;
    bytes32 public immutable poolCode;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    mapping(bytes32 => bool) public consumed;
    bool private entered;
    event Delivered(bytes32 indexed receiptCommitment, bytes32 descriptor, bytes32 ownerOutput, uint256 inputSpent, uint64 outputAmount);

    constructor(address solver_, address input_, address static_, address pool_) {
        require(block.chainid == 31337 && solver_ != address(0), "LOCAL_BLUE_POSITION_ROUTER_ONLY");
        require(input_.code.length != 0 && static_.code.length != 0 && pool_.code.length != 0 && input_ != static_, "BLUE_POSITION_ROUTER_CODE");
        require(MorphoBlueDeliveryPositionToken(static_).asset() == input_ && MorphoBlueDeliveryPrivatePool(pool_).asset() == static_, "BLUE_POSITION_ORIGINAL_ASSETS");
        require(MorphoBlueDeliveryPositionToken(static_).POSITION_PROFILE() == keccak256("MORPHO_BLUE_PRIVATE_SUPPLY_V1"), "BLUE_POSITION_ORIGINAL_PROFILE");
        solver = solver_; inputAsset = MorphoBlueDeliveryToken(input_); outputAsset = MorphoBlueDeliveryPositionToken(static_);
        protocol = static_; targetPool = MorphoBlueDeliveryPrivatePool(pool_);
        inputCode = sha256(input_.code); outputCode = sha256(static_.code); protocolCode = outputCode; poolCode = sha256(pool_.code);
        scope = targetPool.scope(); policy = targetPool.policy();
    }
    function _digest(bytes32[] calldata words, uint256 start) private pure returns (bytes32) {
        uint256 accumulator;
        for (uint256 i; i < 8; ++i) {
            uint256 value = uint256(words[start+i]); require(value <= type(uint32).max, "BLUE_POSITION_D27_DIGEST_WORD");
            accumulator = (accumulator << 32) | value;
        }
        return bytes32(accumulator);
    }
    function _word(address value) private pure returns (bytes32) { return bytes32(uint256(uint160(value))); }
    function descriptor(Route calldata route, bytes32 ownerOutput) public view returns (bytes32) {
        bytes32[20] memory words = [sha256(bytes("LIANUM/EXTERNAL/EXACT-OUTPUT/1")),bytes32(block.chainid),
            _word(address(this)),_word(solver),_word(address(inputAsset)),_word(address(outputAsset)),_word(protocol),_word(address(targetPool)),
            inputCode,outputCode,protocolCode,poolCode,scope,policy,sha256(bytes("MORPHO_BLUE_V1_EXACT_SHARE_SUPPLY")),
            bytes32(uint256(route.maximumInput)),bytes32(uint256(route.outputAmount)),bytes32(uint256(route.validFrom)),
            bytes32(uint256(route.validUntil)),ownerOutput];
        return sha256(abi.encode(words));
    }
    function deliver(bytes32 receiptCommitment, bytes32 claimedDescriptor, Route calldata route, bytes calldata proof, bytes32[] calldata inputs) external {
        require(msg.sender == solver && !entered && !consumed[receiptCommitment] && receiptCommitment != bytes32(0), "BLUE_POSITION_SOLVER_OR_REPLAY");
        require(inputs.length == 27 && _digest(inputs,0) == scope && _digest(inputs,8) == policy, "BLUE_POSITION_ORIGINAL_D27_DOMAIN");
        require(route.outputAmount != 0 && route.maximumInput != 0 && route.validFrom < route.validUntil, "BLUE_POSITION_EXACT_ROUTE");
        require(block.timestamp >= route.validFrom && block.timestamp < route.validUntil, "BLUE_POSITION_ROUTE_WINDOW");
        require(uint256(inputs[16]) <= route.validFrom && route.validUntil <= uint256(inputs[17]) && uint256(inputs[18]) == route.outputAmount, "BLUE_POSITION_OWNER_TERMS");
        bytes32 ownerOutput = _digest(inputs,19); require(ownerOutput != bytes32(0), "BLUE_POSITION_OWNER_OUTPUT");
        require(claimedDescriptor == descriptor(route,ownerOutput), "BLUE_POSITION_EXACT_DESCRIPTOR");
        require(sha256(address(inputAsset).code) == inputCode && sha256(address(outputAsset).code) == outputCode &&
            sha256(address(targetPool).code) == poolCode, "BLUE_POSITION_DEPENDENCY_CODE");
        entered = true; consumed[receiptCommitment] = true;
        require(inputAsset.allowance(address(this),protocol) == 0 && outputAsset.allowance(address(this),address(targetPool)) == 0, "BLUE_POSITION_INITIAL_ALLOWANCES");
        uint256 solverBefore = inputAsset.balanceOf(solver);
        uint256 inputBefore = inputAsset.balanceOf(address(this));
        uint256 sharesBefore = outputAsset.balanceOf(address(this));
        uint256 spent = outputAsset.previewMint(route.outputAmount); require(spent > 0 && spent <= route.maximumInput, "BLUE_POSITION_INPUT_LIMIT");
        require(inputAsset.transferFrom(solver,address(this),route.maximumInput), "BLUE_POSITION_INPUT_TRANSFER");
        require(inputAsset.balanceOf(address(this)) == inputBefore + route.maximumInput, "BLUE_POSITION_EXACT_INPUT");
        require(inputAsset.approve(protocol,spent), "BLUE_POSITION_EXACT_PROTOCOL_APPROVAL");
        require(outputAsset.mint(route.outputAmount,address(this)) == spent, "BLUE_POSITION_OFFICIAL_PREVIEW_MINT");
        require(outputAsset.balanceOf(address(this)) == sharesBefore + route.outputAmount, "BLUE_POSITION_EXACT_STATIC_SHARES");
        uint256 refund = route.maximumInput - spent;
        if (refund != 0) require(inputAsset.transfer(solver,refund), "BLUE_POSITION_EXACT_REFUND");
        require(inputAsset.balanceOf(address(this)) == inputBefore, "BLUE_POSITION_NO_RETAINED_INPUT");
        require(inputAsset.approve(protocol,0) && outputAsset.approve(address(targetPool),route.outputAmount), "BLUE_POSITION_APPROVALS");
        targetPool.depositBalanceIntent(proof,inputs);
        require(outputAsset.balanceOf(address(this)) == sharesBefore, "BLUE_POSITION_NO_RETAINED_SHARES");
        require(outputAsset.approve(address(targetPool),0), "BLUE_POSITION_CLEAR_POOL_APPROVAL");
        require(inputAsset.allowance(address(this),protocol) == 0 && outputAsset.allowance(address(this),address(targetPool)) == 0, "BLUE_POSITION_FINAL_ALLOWANCES");
        require(inputAsset.balanceOf(solver) + spent == solverBefore, "BLUE_POSITION_SOLVER_EXACT_DEBIT");
        entered = false; emit Delivered(receiptCommitment,claimedDescriptor,ownerOutput,spent,route.outputAmount);
    }
}
