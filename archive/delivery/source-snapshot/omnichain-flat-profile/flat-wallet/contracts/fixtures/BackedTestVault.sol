// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IBackedTestAsset {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function decimals() external view returns (uint8);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @notice Local, fake-value ERC4626-style fixture. No strategy, debt, fee,
/// administrator, upgrade, synthetic yield or private note creation exists.
/// Use the pinned fixed-supply PrivateAssetTestToken as the underlying asset.
/// Standard methods expose ERC4626 semantics; execute is the bounded adapter
/// route with sender authorization, exact identity, minimum output and deadline.
contract BackedTestVault {
    uint256 public constant LIMIT = type(uint128).max;
    bytes32 public constant ACTION_TAG = sha256("LIANUM_BACKED_VAULT_ACTION_V1");
    string public constant name = "Backed Local Test Vault";
    string public constant symbol = "BLTV";
    uint8 public constant decimals = 6;
    IBackedTestAsset public immutable asset;
    bytes32 public immutable assetCodeSHA256;
    bytes32 public immutable genesisHash;
    bytes32 public immutable domain;
    bytes32 public immutable runtimeId;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public usedNonce;
    bool private entered;

    struct Action {
        uint8 kind;
        address sender;
        address owner;
        address receiver;
        uint256 amount;
        uint256 previewOutput;
        uint256 minimumOutput;
        uint64 deadline;
        bytes32 nonce;
        uint64 quoteBlockNumber;
        bytes32 quoteBlockHash;
        uint64 quoteBlockTimestamp;
        uint256 quoteTotalAssets;
        uint256 quoteTotalShares;
    }

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event ActionExecuted(bytes32 indexed actionCommitment, bytes32 indexed nonce, uint8 kind,
        uint256 assets, uint256 shares, uint256 totalAssetsBefore, uint256 totalSharesBefore,
        uint256 totalAssetsAfter, uint256 totalSharesAfter);

    constructor(address asset_, bytes32 assetCodeSHA256_, bytes32 genesisHash_, bytes32 domain_, bytes32 runtimeId_) {
        require(block.chainid == 31337, "LOCAL_TEST_VAULT_ONLY");
        require(asset_ != address(0) && asset_.code.length > 0 && sha256(asset_.code) == assetCodeSHA256_, "ASSET_CODE");
        require(genesisHash_ != bytes32(0) && domain_ != bytes32(0) && runtimeId_ != bytes32(0), "IDENTITY");
        asset = IBackedTestAsset(asset_);
        require(asset.decimals() == 6 && asset.totalSupply() > 0 && asset.totalSupply() <= LIMIT, "BOUNDED_TEST_ASSET");
        assetCodeSHA256 = assetCodeSHA256_;
        genesisHash = genesisHash_;
        domain = domain_;
        runtimeId = runtimeId_;
    }

    modifier guarded() {
        require(!entered, "REENTRANCY");
        entered = true;
        require(sha256(address(asset).code) == assetCodeSHA256, "ASSET_CODE");
        _;
        entered = false;
    }

    function totalAssets() public view returns (uint256) { return asset.balanceOf(address(this)); }
    // ERC4626 output conversions round down; exact-output input conversions
    // round up. A single virtual unit on each side is a conversion offset,
    // never an actual balance or minted share. Donations remain real assets.
    function _convert(uint256 amount, uint256 numerator, uint256 denominator, bool up) private pure returns (uint256) {
        require(amount <= LIMIT && numerator <= LIMIT && denominator <= LIMIT, "BOUNDED_CONVERSION");
        uint256 product = amount * (numerator + 1);
        uint256 divisor = denominator + 1;
        return product / divisor + (up && product % divisor != 0 ? 1 : 0);
    }
    function convertToShares(uint256 assets) public view returns (uint256) {
        return _convert(assets, totalSupply, totalAssets(), false);
    }
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return _convert(shares, totalAssets(), totalSupply, false);
    }
    function previewDeposit(uint256 assets) public view returns (uint256) { return convertToShares(assets); }
    function previewRedeem(uint256 shares) public view returns (uint256) { return convertToAssets(shares); }
    function previewMint(uint256 shares) public view returns (uint256) {
        return _convert(shares, totalAssets(), totalSupply, true);
    }
    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _convert(assets, totalSupply, totalAssets(), true);
    }
    function _validReceiver(address receiver) private view returns (bool) {
        return receiver != address(0) && receiver != address(this) && receiver != address(asset);
    }
    function maxDeposit(address receiver) public view returns (uint256) {
        uint256 held = totalAssets();
        if (!_validReceiver(receiver) || held > LIMIT || totalSupply > LIMIT) return 0;
        uint256 capacity = LIMIT - held;
        uint256 byShares = _convert(LIMIT - totalSupply, held, totalSupply, false);
        return capacity < byShares ? capacity : byShares;
    }
    function maxMint(address receiver) public view returns (uint256) {
        if (!_validReceiver(receiver) || totalAssets() > LIMIT || totalSupply > LIMIT) return 0;
        uint256 byAssets = convertToShares(LIMIT - totalAssets());
        uint256 capacity = LIMIT - totalSupply;
        return capacity < byAssets ? capacity : byAssets;
    }
    function maxWithdraw(address owner) public view returns (uint256) {
        return convertToAssets(balanceOf[owner]);
    }
    function maxRedeem(address owner) public view returns (uint256) { return balanceOf[owner]; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transfer(address receiver, uint256 shares) external returns (bool) {
        _transfer(msg.sender, receiver, shares);
        return true;
    }
    function transferFrom(address owner, address receiver, uint256 shares) external returns (bool) {
        _spendAllowance(owner, msg.sender, shares);
        _transfer(owner, receiver, shares);
        return true;
    }
    function _spendAllowance(address owner, address spender, uint256 amount) private {
        uint256 permitted = allowance[owner][spender];
        require(permitted >= amount, "SHARE_ALLOWANCE");
        if (permitted != type(uint256).max) allowance[owner][spender] = permitted - amount;
    }
    function _transfer(address owner, address receiver, uint256 shares) private {
        require(_validReceiver(receiver) && balanceOf[owner] >= shares, "SHARE_TRANSFER");
        balanceOf[owner] -= shares;
        balanceOf[receiver] += shares;
        emit Transfer(owner, receiver, shares);
    }

    function deposit(uint256 assets, address receiver) external guarded returns (uint256 shares) {
        require(assets <= maxDeposit(receiver), "DEPOSIT_LIMIT");
        shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);
    }
    function mint(uint256 shares, address receiver) external guarded returns (uint256 assets) {
        require(shares <= maxMint(receiver), "MINT_LIMIT");
        assets = previewMint(shares);
        _deposit(msg.sender, receiver, assets, shares);
    }
    function withdraw(uint256 assets, address receiver, address owner) external guarded returns (uint256 shares) {
        require(assets <= maxWithdraw(owner), "WITHDRAW_LIMIT");
        shares = previewWithdraw(assets);
        _withdraw(msg.sender, receiver, owner, assets, shares);
    }
    function redeem(uint256 shares, address receiver, address owner) external guarded returns (uint256 assets) {
        require(shares <= maxRedeem(owner), "REDEEM_LIMIT");
        assets = previewRedeem(shares);
        _withdraw(msg.sender, receiver, owner, assets, shares);
    }
    function _deposit(address sender, address receiver, uint256 assets, uint256 shares) private {
        require(_validReceiver(receiver) && assets > 0 && shares > 0, "ZERO_OR_RECEIVER");
        uint256 held = totalAssets();
        uint256 source = asset.balanceOf(sender);
        require(assets <= LIMIT - held && shares <= LIMIT - totalSupply, "CAPACITY");
        require(asset.transferFrom(sender, address(this), assets), "ASSET_TRANSFER");
        require(totalAssets() == held + assets && source >= assets
            && asset.balanceOf(sender) == source - assets, "EXACT_DEPOSIT_BACKING");
        totalSupply += shares;
        balanceOf[receiver] += shares;
        emit Transfer(address(0), receiver, shares);
        emit Deposit(sender, receiver, assets, shares);
    }
    function _withdraw(address sender, address receiver, address owner, uint256 assets, uint256 shares) private {
        require(_validReceiver(receiver) && assets > 0 && shares > 0 && balanceOf[owner] >= shares, "ZERO_OR_BALANCE");
        if (sender != owner) _spendAllowance(owner, sender, shares);
        uint256 held = totalAssets();
        uint256 destination = asset.balanceOf(receiver);
        require(held >= assets, "EXACT_REDEEM_BACKING");
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        emit Transfer(owner, address(0), shares);
        require(asset.transfer(receiver, assets), "ASSET_TRANSFER");
        require(totalAssets() == held - assets && asset.balanceOf(receiver) == destination + assets, "EXACT_REDEEM_BACKING");
        emit Withdraw(sender, receiver, owner, assets, shares);
    }

    function actionCommitment(Action calldata action) public view returns (bytes32) {
        return sha256(abi.encode(ACTION_TAG, block.chainid, genesisHash, domain, runtimeId,
            address(asset), assetCodeSHA256, address(this), sha256(address(this).code), action));
    }
    function execute(Action calldata action, bytes32 expectedCommitment) external guarded returns (uint256 output) {
        require((action.kind == 1 || action.kind == 2) && action.sender == msg.sender && action.owner == msg.sender, "SENDER_AUTHORIZATION");
        require(_validReceiver(action.sender) && _validReceiver(action.receiver), "RECEIVER");
        require(action.amount > 0 && action.amount <= LIMIT && action.previewOutput > 0 && action.previewOutput <= LIMIT
            && action.minimumOutput > 0 && action.minimumOutput <= action.previewOutput, "AMOUNT_OR_SLIPPAGE");
        require(action.deadline > action.quoteBlockTimestamp && action.deadline - action.quoteBlockTimestamp <= 300
            && block.timestamp >= action.quoteBlockTimestamp && block.timestamp <= action.deadline, "DEADLINE");
        require(action.quoteBlockNumber < block.number && block.number - action.quoteBlockNumber <= 256
            && action.quoteBlockHash != bytes32(0) && blockhash(action.quoteBlockNumber) == action.quoteBlockHash, "QUOTE_BLOCK");
        require(action.nonce != bytes32(0) && !usedNonce[msg.sender][action.nonce], "ACTION_REPLAY");
        uint256 quoted = action.kind == 1
            ? _convert(action.amount, action.quoteTotalShares, action.quoteTotalAssets, false)
            : _convert(action.amount, action.quoteTotalAssets, action.quoteTotalShares, false);
        require(quoted == action.previewOutput, "QUOTE_PREVIEW");
        if (action.kind == 1) require(action.quoteTotalAssets + action.amount <= LIMIT
            && action.quoteTotalShares + quoted <= LIMIT, "QUOTE_CAPACITY");
        else require(action.amount <= action.quoteTotalShares && quoted <= action.quoteTotalAssets, "QUOTE_BACKING");
        bytes32 commitment = actionCommitment(action);
        require(commitment == expectedCommitment, "ACTION_IDENTITY");
        usedNonce[msg.sender][action.nonce] = true;
        uint256 beforeAssets = totalAssets();
        uint256 beforeShares = totalSupply;
        uint256 assets;
        uint256 shares;
        if (action.kind == 1) {
            assets = action.amount;
            shares = previewDeposit(assets);
            require(shares >= action.minimumOutput, "SLIPPAGE");
            _deposit(msg.sender, action.receiver, assets, shares);
            output = shares;
        } else {
            shares = action.amount;
            assets = previewRedeem(shares);
            require(assets >= action.minimumOutput, "SLIPPAGE");
            _withdraw(msg.sender, action.receiver, msg.sender, assets, shares);
            output = assets;
        }
        emit ActionExecuted(commitment, action.nonce, action.kind, assets, shares,
            beforeAssets, beforeShares, totalAssets(), totalSupply);
    }
}
