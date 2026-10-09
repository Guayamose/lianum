// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

interface OriginalMorphoBlueV1 {
    struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }
    struct Market { uint128 totalSupplyAssets; uint128 totalSupplyShares; uint128 totalBorrowAssets; uint128 totalBorrowShares; uint128 lastUpdate; uint128 fee; }
    function market(bytes32 id) external view returns (Market memory);
    function position(bytes32 id,address owner) external view returns (uint256,uint128,uint128);
    function idToMarketParams(bytes32 id) external view returns (address,address,address,address,uint256);
    function supply(MarketParams calldata params,uint256 assets,uint256 shares,address onBehalf,bytes calldata data) external returns (uint256,uint256);
    function withdraw(MarketParams calldata params,uint256 assets,uint256 shares,address onBehalf,address receiver) external returns (uint256,uint256);
}
interface OriginalMorphoLoanTokenV1 {
    function decimals() external view returns (uint8);
    function balanceOf(address owner) external view returns (uint256);
    function allowance(address owner,address spender) external view returns (uint256);
    function approve(address spender,uint256 amount) external returns (bool);
    function transferFrom(address owner,address receiver,uint256 amount) external returns (bool);
}

/// A new bounded position profile, not MetaMorpho and not a private pool.
/// Every transferable share represents one original Blue supply share owned
/// by this contract. Only the original receiving pool and D27 grant private
/// note credit. No debt, collateral, fee, callback or market reallocation.
contract OriginalMorphoBluePositionV1 {
    string public constant name = "Original Morpho Blue Position";
    string public constant symbol = "OMB1";
    bytes32 public constant POSITION_PROFILE = keccak256("MORPHO_BLUE_PRIVATE_SUPPLY_V1");
    uint256 public constant MAX_POSITION = type(uint112).max;
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1;
    OriginalMorphoBlueV1 public immutable MORPHO;
    OriginalMorphoLoanTokenV1 private immutable loan;
    bytes32 public immutable marketId;
    bytes32 public immutable morphoCodeHash;
    bytes32 public immutable assetCodeHash;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool private entered;

    event Transfer(address indexed from,address indexed to,uint256 value);
    event Approval(address indexed owner,address indexed spender,uint256 value);
    event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares);
    event Withdraw(address indexed sender,address indexed receiver,address indexed owner,uint256 assets,uint256 shares);

    constructor(address morpho,address loanToken) {
        require(morpho.code.length != 0 && loanToken.code.length != 0 && morpho != loanToken,"BLUE_POSITION_CODE");
        MORPHO = OriginalMorphoBlueV1(morpho); loan = OriginalMorphoLoanTokenV1(loanToken);
        morphoCodeHash = morpho.codehash; assetCodeHash = loanToken.codehash;
        uint8 assetDecimals = loan.decimals(); require(assetDecimals <= 18,"BLUE_POSITION_DECIMALS"); decimals = assetDecimals + 6;
        marketId = keccak256(abi.encode(OriginalMorphoBlueV1.MarketParams(loanToken,address(0),address(0),address(0),0)));
        _state();
    }
    modifier protected() { require(!entered,"BLUE_POSITION_REENTRANCY"); entered = true; _; entered = false; }
    function asset() external view returns (address) { return address(loan); }
    function _params() private view returns (OriginalMorphoBlueV1.MarketParams memory) {
        return OriginalMorphoBlueV1.MarketParams(address(loan),address(0),address(0),address(0),0);
    }
    function _state() private view returns (OriginalMorphoBlueV1.Market memory m) {
        require(address(MORPHO).codehash == morphoCodeHash && address(loan).codehash == assetCodeHash,"BLUE_POSITION_CODE_CHANGED");
        (address token,address collateral,address oracle,address irm,uint256 lltv) = MORPHO.idToMarketParams(marketId);
        require(token == address(loan) && collateral == address(0) && oracle == address(0) && irm == address(0) && lltv == 0,"BLUE_POSITION_MARKET");
        m = MORPHO.market(marketId);
        require(m.lastUpdate != 0 && m.fee == 0 && m.totalBorrowAssets == 0 && m.totalBorrowShares == 0,"BLUE_POSITION_NO_DEBT");
        require(m.totalSupplyAssets <= MAX_POSITION && m.totalSupplyShares <= MAX_POSITION,"BLUE_POSITION_CAPACITY");
        (uint256 shares,uint128 borrowed,uint128 collateralAmount) = MORPHO.position(marketId,address(this));
        require(borrowed == 0 && collateralAmount == 0 && shares == totalSupply,"BLUE_POSITION_EXACT_BACKING");
        require(loan.balanceOf(address(MORPHO)) >= m.totalSupplyAssets,"BLUE_POSITION_TOKEN_BACKING");
    }
    function _shares(uint256 assets,OriginalMorphoBlueV1.Market memory m,bool up) private pure returns (uint256) {
        require(assets <= MAX_POSITION,"BLUE_POSITION_CAPACITY");
        uint256 numerator = assets * (uint256(m.totalSupplyShares) + VIRTUAL_SHARES);
        uint256 denominator = uint256(m.totalSupplyAssets) + VIRTUAL_ASSETS;
        return up ? (numerator + denominator - 1) / denominator : numerator / denominator;
    }
    function _assets(uint256 shares,OriginalMorphoBlueV1.Market memory m,bool up) private pure returns (uint256) {
        require(shares <= MAX_POSITION,"BLUE_POSITION_CAPACITY");
        uint256 numerator = shares * (uint256(m.totalSupplyAssets) + VIRTUAL_ASSETS);
        uint256 denominator = uint256(m.totalSupplyShares) + VIRTUAL_SHARES;
        return up ? (numerator + denominator - 1) / denominator : numerator / denominator;
    }
    function totalAssets() external view returns (uint256) { return _assets(totalSupply,_state(),false); }
    function convertToShares(uint256 assets) external view returns (uint256) { return _shares(assets,_state(),false); }
    function convertToAssets(uint256 shares) external view returns (uint256) { return _assets(shares,_state(),false); }
    function previewDeposit(uint256 assets) external view returns (uint256) { return _shares(assets,_state(),false); }
    function previewMint(uint256 shares) external view returns (uint256) { return _assets(shares,_state(),true); }
    function previewWithdraw(uint256 assets) external view returns (uint256) { return _shares(assets,_state(),true); }
    function previewRedeem(uint256 shares) external view returns (uint256) { return _assets(shares,_state(),false); }
    function maxDeposit(address) external view returns (uint256) {
        OriginalMorphoBlueV1.Market memory m = _state();
        uint256 assetRoom = MAX_POSITION - m.totalSupplyAssets;
        uint256 shareRoom = MAX_POSITION - m.totalSupplyShares;
        uint256 limitByShares = _assets(shareRoom,m,false);
        return assetRoom < limitByShares ? assetRoom : limitByShares;
    }
    function maxMint(address) external view returns (uint256) {
        OriginalMorphoBlueV1.Market memory m = _state();
        uint256 shareRoom = MAX_POSITION - m.totalSupplyShares;
        uint256 limitByAssets = _shares(MAX_POSITION - m.totalSupplyAssets,m,false);
        return shareRoom < limitByAssets ? shareRoom : limitByAssets;
    }
    function maxWithdraw(address owner) external view returns (uint256) { return _assets(balanceOf[owner],_state(),false); }
    function maxRedeem(address owner) external view returns (uint256) { _state(); return balanceOf[owner]; }
    function approve(address spender,uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; emit Approval(msg.sender,spender,amount); return true;
    }
    function transfer(address receiver,uint256 shares) external returns (bool) { _transfer(msg.sender,receiver,shares); return true; }
    function transferFrom(address owner,address receiver,uint256 shares) external returns (bool) {
        _spend(owner,shares); _transfer(owner,receiver,shares); return true;
    }
    function _spend(address owner,uint256 shares) private {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; require(allowed >= shares,"BLUE_POSITION_ALLOWANCE");
            if (allowed != type(uint256).max) { allowance[owner][msg.sender] = allowed - shares; emit Approval(owner,msg.sender,allowed - shares); }
        }
    }
    function _transfer(address owner,address receiver,uint256 shares) private {
        require(receiver != address(0) && balanceOf[owner] >= shares,"BLUE_POSITION_TRANSFER");
        balanceOf[owner] -= shares; balanceOf[receiver] += shares; emit Transfer(owner,receiver,shares);
    }
    function deposit(uint256 assets,address receiver) external protected returns (uint256 shares) {
        OriginalMorphoBlueV1.Market memory beforeState = _state(); shares = _shares(assets,beforeState,false);
        _supply(assets,shares,receiver,false,beforeState);
    }
    function mint(uint256 shares,address receiver) external protected returns (uint256 assets) {
        OriginalMorphoBlueV1.Market memory beforeState = _state(); assets = _assets(shares,beforeState,true);
        _supply(assets,shares,receiver,true,beforeState);
    }
    function _supply(uint256 assets,uint256 shares,address receiver,bool exactShares,OriginalMorphoBlueV1.Market memory beforeState) private {
        require(receiver != address(0) && receiver != address(this) && receiver != address(MORPHO) && receiver != address(loan) && assets != 0 && shares != 0,"BLUE_POSITION_INPUT");
        require(uint256(beforeState.totalSupplyAssets) + assets <= MAX_POSITION && uint256(beforeState.totalSupplyShares) + shares <= MAX_POSITION,"BLUE_POSITION_CAPACITY");
        uint256 idle = loan.balanceOf(address(this));
        uint256 source = loan.balanceOf(msg.sender);
        uint256 backing = loan.balanceOf(address(MORPHO));
        require(loan.allowance(address(this),address(MORPHO)) == 0,"BLUE_POSITION_ALLOWANCE");
        require(loan.transferFrom(msg.sender,address(this),assets),"BLUE_POSITION_PULL");
        require(loan.balanceOf(address(this)) == idle + assets && loan.balanceOf(msg.sender) + assets == source,"BLUE_POSITION_EXACT_PULL");
        require(loan.approve(address(MORPHO),assets),"BLUE_POSITION_APPROVE");
        (uint256 supplied,uint256 issued) = MORPHO.supply(_params(),exactShares ? 0 : assets,exactShares ? shares : 0,address(this),"");
        require(supplied == assets && issued == shares,"BLUE_POSITION_EXACT_SUPPLY");
        require(loan.approve(address(MORPHO),0) && loan.allowance(address(this),address(MORPHO)) == 0,"BLUE_POSITION_CLEAR_ALLOWANCE");
        totalSupply += shares; balanceOf[receiver] += shares; emit Transfer(address(0),receiver,shares); emit Deposit(msg.sender,receiver,assets,shares);
        OriginalMorphoBlueV1.Market memory afterState = _state();
        require(uint256(afterState.totalSupplyAssets) == uint256(beforeState.totalSupplyAssets) + assets && uint256(afterState.totalSupplyShares) == uint256(beforeState.totalSupplyShares) + shares,"BLUE_POSITION_SUPPLY_DELTA");
        require(loan.balanceOf(address(this)) == idle && loan.balanceOf(address(MORPHO)) == backing + assets,"BLUE_POSITION_SUPPLY_BACKING");
    }
    function withdraw(uint256 assets,address receiver,address owner) external protected returns (uint256 shares) {
        OriginalMorphoBlueV1.Market memory beforeState = _state(); shares = _shares(assets,beforeState,true);
        _withdraw(assets,shares,receiver,owner,false,beforeState);
    }
    function redeem(uint256 shares,address receiver,address owner) external protected returns (uint256 assets) {
        OriginalMorphoBlueV1.Market memory beforeState = _state(); assets = _assets(shares,beforeState,false);
        _withdraw(assets,shares,receiver,owner,true,beforeState);
    }
    function _withdraw(uint256 assets,uint256 shares,address receiver,address owner,bool exactShares,OriginalMorphoBlueV1.Market memory beforeState) private {
        require(receiver != address(0) && receiver != address(this) && receiver != address(MORPHO) && assets != 0 && shares != 0 && balanceOf[owner] >= shares,"BLUE_POSITION_OUTPUT");
        _spend(owner,shares); balanceOf[owner] -= shares; totalSupply -= shares;
        uint256 recipient = loan.balanceOf(receiver);
        uint256 backing = loan.balanceOf(address(MORPHO));
        (uint256 released,uint256 burned) = MORPHO.withdraw(_params(),exactShares ? 0 : assets,exactShares ? shares : 0,address(this),receiver);
        require(released == assets && burned == shares,"BLUE_POSITION_EXACT_WITHDRAW");
        OriginalMorphoBlueV1.Market memory afterState = _state();
        require(uint256(afterState.totalSupplyAssets) + assets == beforeState.totalSupplyAssets && uint256(afterState.totalSupplyShares) + shares == beforeState.totalSupplyShares,"BLUE_POSITION_WITHDRAW_DELTA");
        require(loan.balanceOf(receiver) == recipient + assets && loan.balanceOf(address(MORPHO)) + assets == backing,"BLUE_POSITION_WITHDRAW_BACKING");
        emit Transfer(owner,address(0),shares); emit Withdraw(msg.sender,receiver,owner,assets,shares);
    }
}
