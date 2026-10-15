// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface SepoliaDeliveryERC20V4 {
    function balanceOf(address holder) external view returns (uint256);
    function transfer(address receiver, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
interface SepoliaDeliveryWETHV4 is SepoliaDeliveryERC20V4 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
interface SepoliaExactOutputRouter02V4 {
    // Router02's genuine seven-field ABI. Deadlines are enforced by this
    // adapter's signed route and the owner's D27, not an eighth ABI field.
    struct ExactOutputParameters {
        address input; address output; uint24 tier; address receiver;
        uint256 exactOutput; uint256 inputLimit; uint160 priceLimit;
    }
    function exactOutputSingle(ExactOutputParameters calldata request) external payable returns (uint256 spent);
    function factory() external view returns (address);
    function WETH9() external view returns (address);
}
interface SepoliaPrivateOutputPoolV4 {
    function asset() external view returns (address);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function backedAmount() external view returns (uint256);
    function leafCount() external view returns (uint32);
    function stateSequence() external view returns (uint64);
    function insertedCommitments(bytes32 commitment) external view returns (bool);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external payable;
}

/// Fixed Sepolia-only exact-output adapter. The genuine target pool verifies
/// D27. This contract establishes no Source reservation, READY or PAEG receipt:
/// those require the original Mixed operation and off-chain owners.
/// ETH input is supplied by the authorized operator, wrapped in this same
/// transaction and refunded atomically. It never spends the mobile wallet.
contract PrivateSepoliaUniswapDeliveryV4 {
    address public constant INPUT = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address public constant OUTPUT = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address public constant PROTOCOL = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    address public constant FACTORY = 0x0227628f3F023bb0B980b67D528571c95c6DaC1c;
    uint24 public constant FEE = 3000;
    uint256 public constant MAX_PROOF_BYTES = 65536;
    bytes32 public constant INPUT_CODE = 0x9bbda01ae25d1f2b4171918cc6280a5769d6d6fc5500ed01e2143697902df4e1;
    bytes32 public constant OUTPUT_CODE = 0x583644aee778ddb688d4b61116b6259ef417b1a094dc8f8a578e0cfc099f4519;
    bytes32 public constant PROTOCOL_CODE = 0xe18dacff07368baa9974b34f1039c31726d374cd0838c7969232b9f287590562;
    bytes32 public constant FACTORY_CODE = 0xf4e0ac5ddb8b0ed6b47df04645557d13af2a8b7a1bc9583acd08b0788440928b;
    struct Route { uint128 maximumInput; uint64 outputAmount; uint64 validFrom; uint64 validUntil; }
    struct Balance { uint256 native; uint256 input; uint256 output; uint256 backing; uint256 poolTokens; uint32 leaves; uint64 sequence; }
    address public immutable solver;
    SepoliaPrivateOutputPoolV4 public immutable targetPool;
    bytes32 public immutable poolCode;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    mapping(bytes32 => bool) public consumed;
    bool private entered;
    event Delivered(bytes32 indexed receiptCommitment, bytes32 descriptor, bytes32 ownerOutput,
        uint256 inputSpent, uint64 outputAmount, uint32 leafIndex, uint64 poolSequence);

    constructor(address solver_, address target_) {
        require(block.chainid == 11155111 && solver_ != address(0) && solver_.code.length == 0, "SEPOLIA_ORIGINAL_SOLVER");
        require(target_.code.length != 0 && target_ != solver_ && target_ != INPUT && target_ != OUTPUT && target_ != PROTOCOL, "SEPOLIA_TARGET_POOL");
        solver = solver_; targetPool = SepoliaPrivateOutputPoolV4(target_);
        require(targetPool.asset() == OUTPUT, "SEPOLIA_EXACT_OUTPUT_ASSET");
        poolCode = sha256(target_.code); scope = targetPool.scope(); policy = targetPool.policy();
        require(scope != bytes32(0) && policy != bytes32(0), "SEPOLIA_PRIVATE_DOMAIN");
        _codes();
        require(SepoliaExactOutputRouter02V4(PROTOCOL).factory() == FACTORY && SepoliaExactOutputRouter02V4(PROTOCOL).WETH9() == INPUT, "SEPOLIA_PROTOCOL_BINDING");
    }
    receive() external payable { require(msg.sender == INPUT && entered, "SEPOLIA_WETH_REFUND_ONLY"); }
    function _codes() private view {
        require(sha256(INPUT.code) == INPUT_CODE && sha256(OUTPUT.code) == OUTPUT_CODE
            && sha256(PROTOCOL.code) == PROTOCOL_CODE && sha256(FACTORY.code) == FACTORY_CODE
            && sha256(address(targetPool).code) == poolCode, "SEPOLIA_DEPENDENCY_CODE");
    }
    function _digest(bytes32[] calldata inputs, uint256 start) private pure returns (bytes32) {
        uint256 accumulator;
        for (uint256 i; i < 8; ++i) {
            uint256 limb = uint256(inputs[start+i]); require(limb <= type(uint32).max, "SEPOLIA_D27_DIGEST_WORD");
            accumulator = (accumulator << 32) | limb;
        }
        return bytes32(accumulator);
    }
    function _word(address value) private pure returns (bytes32) { return bytes32(uint256(uint160(value))); }
    function descriptor(Route calldata route, bytes32 ownerOutput) public view returns (bytes32) {
        bytes32[20] memory words = [sha256(bytes("LIANUM/EXTERNAL/EXACT-OUTPUT/1")),bytes32(block.chainid),
            _word(address(this)),_word(solver),_word(INPUT),_word(OUTPUT),_word(PROTOCOL),_word(address(targetPool)),
            INPUT_CODE,OUTPUT_CODE,PROTOCOL_CODE,poolCode,scope,policy,sha256(bytes("UNISWAP_ROUTER02_SEPOLIA_EXACT_OUTPUT_PRIVATE_V4")),
            bytes32(uint256(route.maximumInput)),bytes32(uint256(route.outputAmount)),bytes32(uint256(route.validFrom)),
            bytes32(uint256(route.validUntil)),ownerOutput];
        return sha256(abi.encode(words));
    }
    function deliver(bytes32 receiptCommitment, bytes32 claimedDescriptor, Route calldata route, bytes calldata proof, bytes32[] calldata inputs) external payable {
        require(msg.sender == solver && !entered && receiptCommitment != bytes32(0) && !consumed[receiptCommitment], "SEPOLIA_SOLVER_OR_REPLAY");
        require(inputs.length == 27 && proof.length != 0 && proof.length <= MAX_PROOF_BYTES, "SEPOLIA_D27_SHAPE");
        require(_digest(inputs,0) == scope && _digest(inputs,8) == policy, "SEPOLIA_ORIGINAL_D27_DOMAIN");
        require(route.maximumInput != 0 && route.outputAmount != 0 && route.validFrom < route.validUntil && msg.value == route.maximumInput, "SEPOLIA_EXACT_ROUTE");
        require(block.timestamp >= route.validFrom && block.timestamp < route.validUntil, "SEPOLIA_ROUTE_WINDOW");
        require(uint256(inputs[16]) <= route.validFrom && route.validUntil <= uint256(inputs[17]) && uint256(inputs[18]) == route.outputAmount, "SEPOLIA_OWNER_TERMS");
        bytes32 ownerOutput = _digest(inputs,19);
        require(ownerOutput != bytes32(0) && !targetPool.insertedCommitments(ownerOutput), "SEPOLIA_NEW_OWNER_OUTPUT");
        require(claimedDescriptor == descriptor(route,ownerOutput), "SEPOLIA_EXACT_DESCRIPTOR");
        _codes(); entered = true; consumed[receiptCommitment] = true;
        Balance memory before_ = Balance(address(this).balance-msg.value,SepoliaDeliveryERC20V4(INPUT).balanceOf(address(this)),
            SepoliaDeliveryERC20V4(OUTPUT).balanceOf(address(this)),targetPool.backedAmount(),
            SepoliaDeliveryERC20V4(OUTPUT).balanceOf(address(targetPool)),targetPool.leafCount(),targetPool.stateSequence());
        SepoliaDeliveryWETHV4(INPUT).deposit{value:msg.value}();
        require(SepoliaDeliveryERC20V4(INPUT).balanceOf(address(this)) == before_.input+route.maximumInput, "SEPOLIA_EXACT_WRAP");
        require(SepoliaDeliveryERC20V4(INPUT).approve(PROTOCOL,route.maximumInput), "SEPOLIA_EXACT_PROTOCOL_APPROVAL");
        uint256 spent = SepoliaExactOutputRouter02V4(PROTOCOL).exactOutputSingle(
            SepoliaExactOutputRouter02V4.ExactOutputParameters(INPUT,OUTPUT,FEE,address(this),route.outputAmount,route.maximumInput,0));
        require(spent != 0 && spent <= route.maximumInput, "SEPOLIA_INPUT_LIMIT");
        require(SepoliaDeliveryERC20V4(OUTPUT).balanceOf(address(this)) == before_.output+route.outputAmount
            && SepoliaDeliveryERC20V4(INPUT).balanceOf(address(this)) == before_.input+route.maximumInput-spent, "SEPOLIA_EXACT_PROTOCOL_BALANCES");
        require(SepoliaDeliveryERC20V4(INPUT).approve(PROTOCOL,0), "SEPOLIA_CLEAR_PROTOCOL_APPROVAL");
        uint256 refund = route.maximumInput-spent;
        if (refund != 0) {
            SepoliaDeliveryWETHV4(INPUT).withdraw(refund);
            (bool refunded,) = solver.call{value:refund}(""); require(refunded, "SEPOLIA_EXACT_REFUND");
        }
        require(SepoliaDeliveryERC20V4(OUTPUT).approve(address(targetPool),route.outputAmount), "SEPOLIA_EXACT_POOL_APPROVAL");
        targetPool.depositBalanceIntent(proof,inputs);
        require(targetPool.insertedCommitments(ownerOutput) && targetPool.backedAmount() == before_.backing+route.outputAmount
            && targetPool.leafCount() == before_.leaves+1 && targetPool.stateSequence() == before_.sequence+1
            && SepoliaDeliveryERC20V4(OUTPUT).balanceOf(address(targetPool)) == before_.poolTokens+route.outputAmount, "SEPOLIA_CONFIRMED_PRIVATE_BACKING");
        require(SepoliaDeliveryERC20V4(OUTPUT).approve(address(targetPool),0)
            && SepoliaDeliveryERC20V4(OUTPUT).balanceOf(address(this)) == before_.output
            && SepoliaDeliveryERC20V4(INPUT).balanceOf(address(this)) == before_.input
            && address(this).balance == before_.native, "SEPOLIA_NO_RETAINED_VALUE");
        entered = false;
        emit Delivered(receiptCommitment,claimedDescriptor,ownerOutput,spent,route.outputAmount,before_.leaves,before_.sequence+1);
    }
}
