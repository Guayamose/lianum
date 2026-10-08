/* Source-only fixed stdio owner for java-tron 5c449a18a2bb995d3b688d1587e664d909b473c7.
 * Requires the separately pinned offline Args patch. NOT compiled or executed.
 * New fixture-only keys, no input/import/export of a user wallet key. Only the SR
 * fixture key is written to its own private local node config, never to stdout.
 * The solver key lives solely in this original process. Restart cannot recover it.
 * No arbitrary RPC, address, private key, raw transaction, replacement or resend.
 */
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.Arrays;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.tron.common.application.Application;
import org.tron.common.application.ApplicationFactory;
import org.tron.common.application.TronApplicationContext;
import org.tron.common.arch.Arch;
import org.tron.common.crypto.ECKey;
import org.tron.common.parameter.CommonParameter;
import org.tron.common.utils.StringUtil;
import org.tron.core.ChainBaseManager;
import org.tron.core.Wallet;
import org.tron.core.capsule.AccountCapsule;
import org.tron.core.capsule.BlockCapsule;
import org.tron.core.capsule.TransactionCapsule;
import org.tron.core.config.DefaultConfig;
import org.tron.core.config.args.Args;
import org.tron.core.db.Manager;
import org.tron.core.db.OwnedLocalTronReplayRecorder;
import org.tron.protos.Protocol;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Permission;
import org.tron.protos.contract.BalanceContract.TransferContract;

public final class OwnedTronNativeDriver {
  private static final String CLASSIFICATION = "LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS";
  private static final String UPSTREAM = "5c449a18a2bb995d3b688d1587e664d909b473c7";
  private static final long MAX_AMOUNT=1000000000000L, MAX_FEE=10000000L;
  /** Single owned cleanup attempt. Official TronApplicationContext.doClose()
   * already invokes ApplicationImpl.shutdown(); never call both directly.
   * A failed close is terminal/unknown, not permission to try shutdown again.
   * Spring refresh itself handles cancellation of an unsuccessful refresh.
   */
  private static final class OwnedShutdown implements AutoCloseable {
    private TronApplicationContext owned;
    private boolean refreshed,claimed;
    private Throwable failure;
    // Explicit package access avoids Java8 private-constructor access tags.
    OwnedShutdown() {}
    synchronized void own(TronApplicationContext value) {
      need(!claimed&&owned==null&&value!=null);owned=value;
    }
    synchronized void refreshed(TronApplicationContext value) {
      need(!claimed&&!refreshed&&owned==value&&owned.isActive());refreshed=true;
    }
    @Override public synchronized void close() {
      if(claimed) {
        if(failure!=null)throw new IllegalStateException("OWNED_TRON_SHUTDOWN_PREVIOUSLY_FAILED",failure);
        return;
      }
      // Claim before calling any externally implemented lifecycle operation.
      claimed=true;
      try {
        if(owned==null)return;
        if(!refreshed) {
          // Failed/never-started refresh is canceled by Spring. Do not invoke
          // TronApplicationContext.doClose(), which would fetch application
          // beans from an inactive or incompletely refreshed context.
          need(!owned.isActive());return;
        }
        need(owned.isActive());
        owned.close(); // Sole path; upstream doClose owns app.shutdown().
        need(!owned.isActive());
      }catch(RuntimeException|Error failed){failure=failed;throw failed;}
    }
  }
  private final OwnedShutdown shutdown=new OwnedShutdown();
  private final PrintStream protocol;
  private final Path directory;
  private ECKey solver;
  private byte[] owner,recipient;
  private Application app;
  private TronApplicationContext context;
  private Wallet wallet;
  private ChainBaseManager chain;
  private Manager manager;
  private String genesis,configHash,preparationId,preparedSnapshot,rawHex,wireHex,wireHash,nativeId;
  private Transaction.raw prepared;
  private Transaction signed;
  private boolean preparedOnce,keyArmed,keyStarted,sendArmed,sendStarted,poisoned,adverse;
  private long preparedAt,referenceHeight=-1,originalHead;
  private String lastSnapshotHead,lastSnapshotSolid,preparedStable;
  // BEGIN FIXED PRIVATE FIRST ERROR V3 FIELDS
  private boolean privateFirstErrorRecorded;
  // END FIXED PRIVATE FIRST ERROR V3 FIELDS
  private OwnedTronNativeDriver(PrintStream out) throws Exception {
    protocol=out;directory=Paths.get("").toAbsolutePath().normalize();
    need(Files.getPosixFilePermissions(directory).equals(PosixFilePermissions.fromString("rwx------")));
  }
  private static void need(boolean condition) { if(!condition)throw new IllegalStateException("FIXED_PROFILE_REJECTED"); }
  private static byte[] bytes(String h){need(h!=null&&(h.length()&1)==0&&h.matches("[0-9a-f]+"));byte[] b=new byte[h.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(h.substring(2*i,2*i+2),16);return b;}
  private static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format("%02x",x&255));return s.toString();}
  private static String sha(byte[] b)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(b));}
  private static String q(String s){need(s!=null&&s.matches("[a-zA-Z0-9_.:-]*"));return "\""+s+"\"";}
  private static String obj(String... kv){need(kv.length%2==0);StringBuilder b=new StringBuilder("{");for(int i=0;i<kv.length;i+=2){if(i>0)b.append(',');b.append(q(kv[i])).append(':').append(kv[i+1]);}return b.append('}').toString();}
  private static String decimal(long n){need(n>=0);return q(Long.toString(n));}
  private static long positive(String s){need(s.matches("[1-9][0-9]{0,18}"));long n=Long.parseLong(s);need(n>0);return n;}
  private void persist(String name,byte[] value)throws Exception{
    Path p=directory.resolve(name);Files.createFile(p,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
    try(FileChannel f=FileChannel.open(p,StandardOpenOption.WRITE)){ByteBuffer b=ByteBuffer.wrap(value);while(b.hasRemaining())f.write(b);f.force(true);}
    try(FileChannel d=FileChannel.open(directory,StandardOpenOption.READ)){d.force(true);}
    need(Arrays.equals(Files.readAllBytes(p),value));
  }
  private String genesisAsset(String name,byte[] address,long balance){return "{accountName=\""+name+"\",accountType=\"Normal\",address=\""+StringUtil.encode58Check(address)+"\",balance=\""+balance+"\"}";}
  private void start()throws Exception{
    Arch.throwIfUnsupportedJavaVersion();need("1.8".equals(System.getProperty("java.specification.version")));
    Wallet.setAddressPreFixByte((byte)0x41);ECKey witness=new ECKey();solver=new ECKey();ECKey recipientKey=new ECKey();owner=solver.getAddress();recipient=recipientKey.getAddress();recipientKey=null;
    String configuration="storage {db.engine=\"ROCKSDB\",db.sync=true,db.directory=\"database\",transHistory.switch=\"on\",balance.history.lookup=true}\n"
      +"crypto.engine=\"eckey\"\nnode {p2p.version=2026100501,listen.port=0,discovery {enable=false,persist=false,external.ip=\"127.0.0.1\"},"
      +"active=[],passive=[],fastForward=[],enableIpv6=false,effectiveCheckEnable=false,backup {port=0,members=[]},agreeNodeCount=0,maxConnections=0,minConnections=0,minActiveConnections=0,"
      +"http {fullNodeEnable=false,solidityEnable=false,PBFTEnable=false},rpc {enable=false,solidityEnable=false,PBFTEnable=false,minEffectiveConnection=0},"
      +"jsonrpc {httpFullNodeEnable=false,httpSolidityEnable=false,httpPBFTEnable=false},dns {treeUrls=[],publish=false,knownUrls=[],staticNodes=[]},dynamicConfig.enable=false,metricsEnable=false,"
      +"metrics.prometheus.enable=false}\nseed.node.ip.list=[]\n"
      +"block {needSyncCheck=false,maintenanceTimeInterval=21600000,proposalExpireTime=259200000}\n"
      +"genesis.block {timestamp=\"1749999999000\",parentHash=\"0x"+"0000000000000000000000000000000000000000000000000000000000000000"+"\",assets=["
      +genesisAsset("Zion",owner,1000000000000000L)+","+genesisAsset("Sun",recipient,1000L)+","+genesisAsset("Witness",witness.getAddress(),1000000000000L)
      +",{accountName=\"Blackhole\",accountType=\"Normal\",address=\"TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy\",balance=\"0\"}],"
      +"witnesses=[{address=\""+StringUtil.encode58Check(witness.getAddress())+"\",url=\"http://127.0.0.1\",voteCount=100000000}]}\n"
      +"localwitness=[\""+hex(witness.getPrivKeyBytes())+"\"]\ntrx.reference.block=\"solid\"\n"
      +"committee {allowCreationOfContracts=1,allowMultiSign=1}\nvm.supportConstant=false\nevent.subscribe.enable=false\n";
    // Public provenance excludes the secret SR scalar. It still covers every
    // public setting and its actual original SR address/genesis allocation.
    configHash=sha(configuration.replace(hex(witness.getPrivKeyBytes()),"REDACTED_FRESH_LOCAL_WITNESS").getBytes(StandardCharsets.UTF_8));
    persist("private-node.conf",configuration.getBytes(StandardCharsets.UTF_8));configuration=null;witness=null;
    // MUST resolve to the offline-patched Args implementation. The upstream JAR
    // is retained as provenance only and is never the runtime classpath here.
    Args.setParam(new String[]{"--witness","--p2p-disable","true","-c","private-node.conf"},"private-node.conf");
    assertOffline();
    DefaultListableBeanFactory beans=new DefaultListableBeanFactory();beans.setAllowCircularReferences(false);
    context=new TronApplicationContext(beans);shutdown.own(context);context.register(DefaultConfig.class);context.refresh();shutdown.refreshed(context);
    app=ApplicationFactory.create(context);manager=app.getDbManager();chain=app.getChainBaseManager();wallet=context.getBean(Wallet.class);
    app.startup();genesis=hex(chain.getGenesisBlockId().getBytes());
    // Autonomous official consensus must actually produce a new local block.
    // No manual block fabrication, fake mining endpoint or clock substitution.
    long deadline=System.currentTimeMillis()+90000L;while(chain.getHeadBlockNum()<2){need(System.currentTimeMillis()<deadline);Thread.sleep(100);}
    need(genesis.startsWith("0000000000000000"));
    protocol.println(obj("kind",q("ready"),"metadata",obj("classification",q(CLASSIFICATION),"upstreamCommit",q(UPSTREAM),"genesis",q(genesis),"solverEndpoint",q(hex(owner)),"recipientEndpoint",q(hex(recipient)),"configurationSHA256",q(configHash))));
  }
  private void assertOffline(){CommonParameter p=Args.getInstance();need(p.p2pDisable&&p.getP2pConfig()==null);need(!p.rpcEnable&&!p.rpcSolidityEnable&&!p.rpcPBFTEnable&&!p.fullNodeHttpEnable&&!p.solidityNodeHttpEnable&&!p.pBFTHttpEnable);
    need(!p.jsonRpcHttpFullNodeEnable&&!p.jsonRpcHttpSolidityNodeEnable&&!p.jsonRpcHttpPBFTNodeEnable);need(!p.nodeDiscoveryEnable&&!p.nodeDiscoveryPersist&&!p.nodeEnableIpv6&&!p.nodeEffectiveCheckEnable);
    need(!p.dynamicConfigEnable&&!p.nodeMetricsEnable&&!p.metricsPrometheusEnable&&!p.eventSubscribe&&p.backupPort==0&&p.backupMembers.isEmpty());
    need(p.activeNodes.isEmpty()&&p.passiveNodes.isEmpty()&&p.fastForwardNodes.isEmpty()&&p.seedNode.getAddressList().isEmpty()&&p.dnsTreeUrls.isEmpty());need(p.minEffectiveConnection==0&&p.agreeNodeCount==0);}
  private String block(long height)throws Exception{BlockCapsule b=chain.getBlockByNum(height);return obj("id",q(hex(b.getBlockId().getBytes())),"number",decimal(height),"timestampMs",decimal(b.getTimeStamp()));}
  private String snapshot()throws Exception{return snapshot(false);}
  private String snapshot(boolean originalReference)throws Exception{
    assertOffline();synchronized(manager){long number=chain.getHeadBlockNum(),solid=chain.getDynamicPropertiesStore().getLatestSolidifiedBlockNum();
      AccountCapsule source=chain.getAccountStore().get(owner),target=chain.getAccountStore().get(recipient);need(source!=null&&target!=null);
      Permission permission=source.getPermissionById(0);need(permission!=null&&permission.getType()==Permission.PermissionType.Owner&&permission.getId()==0&&permission.getThreshold()==1&&permission.getKeysCount()==1);
      Protocol.Key key=permission.getKeys(0);need(Arrays.equals(key.getAddress().toByteArray(),owner)&&key.getWeight()==1);
      long fee=chain.getDynamicPropertiesStore().getTransactionFee(),memo=chain.getDynamicPropertiesStore().getMemoFee();need(fee>0&&memo>=0&&fee<=MAX_FEE/576&&fee*576+memo<=MAX_FEE);
      long refHeight=!originalReference||referenceHeight<0?solid:referenceHeight;need(refHeight<=solid&&number-refHeight<=32);
      String ref=block(refHeight);lastSnapshotHead=block(number);lastSnapshotSolid=block(solid);return obj("genesis",q(hex(chain.getGenesisBlockId().getBytes())),"head",lastSnapshotHead,"solid",lastSnapshotSolid,"reference",ref,
        "ownerAddress",q(hex(owner)),"recipientAddress",q(hex(recipient)),"ownerPermission",obj("id",q("0"),"type",q("Owner"),"threshold",q("1"),"keys","["+obj("address",q(hex(owner)),"weight",q("1"))+"]"),
        "ownerBalanceSun",decimal(source.getBalance()),"recipientExists","true","recipientType",q(target.getInstance().getType().name()),
        "transactionFeeSun",decimal(fee),"memoFeeSun",decimal(memo),"pendingCount",decimal(manager.getPendingSize()),
        "chainParametersSHA256",q(sha(wallet.getChainParameters().toByteArray())),"resourcesSHA256",q(sha(source.getInstance().toByteArray())),"configurationSHA256",q(configHash));
    }
  }
  private String prepare(String amount,String memo)throws Exception{
    need(!preparedOnce&&!poisoned);preparedOnce=true;long value=positive(amount);need(value<=MAX_AMOUNT);need(memo.matches("[0-9a-f]{64}")&&!memo.matches("0{64}"));
    synchronized(manager){preparedSnapshot=snapshot();preparedStable=stable(preparedSnapshot);originalHead=chain.getHeadBlockNum();need(manager.getPendingSize()==0);need(chain.getAccountStore().get(owner).getBalance()>=value+MAX_FEE);
      long solid=chain.getDynamicPropertiesStore().getLatestSolidifiedBlockNum();referenceHeight=solid;byte[] ref=chain.getBlockIdByNum(solid).getBytes();preparedAt=System.currentTimeMillis();
      TransferContract transfer=TransferContract.newBuilder().setOwnerAddress(ByteString.copyFrom(owner)).setToAddress(ByteString.copyFrom(recipient)).setAmount(value).build();
      Transaction.Contract contract=Transaction.Contract.newBuilder().setType(Transaction.Contract.ContractType.TransferContract).setParameter(Any.pack(transfer)).build();
      prepared=Transaction.raw.newBuilder().setRefBlockBytes(ByteString.copyFrom(Arrays.copyOfRange(ref,6,8))).setRefBlockHash(ByteString.copyFrom(Arrays.copyOfRange(ref,8,16)))
        .setExpiration(preparedAt+60000L).setData(ByteString.copyFrom(bytes(memo))).addContract(contract).setTimestamp(preparedAt).build();
      rawHex=hex(prepared.toByteArray());nativeId=sha(prepared.toByteArray());preparationId=sha((genesis+nativeId).getBytes(StandardCharsets.US_ASCII));
      persist("driver-original-raw.bin",prepared.toByteArray());persist("driver-original-preparation.json",obj("preparationId",q(preparationId),"snapshot",preparedSnapshot,"timestampMs",decimal(preparedAt),"unsignedWire",q(rawHex)).getBytes(StandardCharsets.UTF_8));
      return obj("preparationId",q(preparationId),"snapshot",preparedSnapshot,"timestampMs",decimal(preparedAt),"unsignedWire",q(rawHex));
    }
  }
  private String stable(String s){return s.replace("\"head\":"+lastSnapshotHead+",", "").replace("\"solid\":"+lastSnapshotSolid+",", "");}
  private String current(String id)throws Exception{need(id.equals(preparationId));
    long now=System.currentTimeMillis();
    need(now>=preparedAt&&now-preparedAt<30000L);
    String s=snapshot(true);
    need(stable(s).equals(preparedStable));
    need(chain.getHeadBlockNum()>=originalHead&&chain.getHeadBlockTimeStamp()<prepared.getExpiration());

    need(Arrays.equals(Files.readAllBytes(directory.resolve("driver-original-raw.bin")),prepared.toByteArray()));
    return s;
    }
  private String armKey(String id)throws Exception{need(!poisoned&&!keyArmed&&!keyStarted&&id.equals(preparationId));keyArmed=true;persist("driver-key-started",nativeId.getBytes(StandardCharsets.US_ASCII));return "{}";}
  private String armSend(String id)throws Exception{need(!poisoned&&signed!=null&&!sendArmed&&!sendStarted&&id.equals(preparationId));sendArmed=true;persist("driver-send-started",nativeId.getBytes(StandardCharsets.US_ASCII));OwnedLocalTronReplayRecorder.arm(nativeId,wireHash,hex(owner));return "{}";}
  private String sign(String id,String raw)throws Exception{need(!poisoned&&keyArmed&&!keyStarted);need(id.equals(preparationId)&&raw.equals(rawHex));
    // Persist and consume before the first key operation. Failure never retries.
    keyStarted=true;
    synchronized(manager){current(id);byte[] signature=solver.sign(bytes(nativeId)).toByteArray();need(signature.length==65&&(signature[64]==0||signature[64]==1));
      signed=Transaction.newBuilder().setRawData(prepared).addSignature(ByteString.copyFrom(signature)).build();wireHex=hex(signed.toByteArray());wireHash=sha(signed.toByteArray());
      persist("driver-original-signed.bin",signed.toByteArray());return obj("nativeWire",q(wireHex),"nativeId",q(nativeId),"transactionSHA256",q(wireHash));}
  }
  private String broadcast(String id,String txid,String wireDigest)throws Exception{need(!poisoned&&keyStarted&&sendArmed&&!sendStarted&&signed!=null);need(id.equals(preparationId)&&txid.equals(nativeId)&&wireDigest.equals(wireHash));
    sendStarted=true;
    current(id);need(Arrays.equals(Files.readAllBytes(directory.resolve("driver-original-signed.bin")),signed.toByteArray()));
      TransactionCapsule trx=new TransactionCapsule(signed);trx.checkExpiration(chain.getNextBlockSlotTime());
      // Actual java-tron validation, execution and native pending queue. P2P is
      // deliberately absent. Official autonomous witness includes this original.
      boolean accepted=manager.pushTransaction(trx);need(accepted);return obj("nativeId",q(nativeId),"accepted","true");
  }
  private String observed(String status){return obj("status",q(status),"nativeId",q(nativeId),"nativeWire",status.equals("observed")?q(wireHex):"null");}
  private String observe(String txid)throws Exception{need(signed!=null&&txid.equals(nativeId)&&!adverse);need(Arrays.equals(Files.readAllBytes(directory.resolve("driver-original-signed.bin")),signed.toByteArray()));
    synchronized(manager){Protocol.TransactionInfo info=wallet.getTransactionInfoById(ByteString.copyFrom(bytes(nativeId)));Transaction tx=wallet.getTransactionById(ByteString.copyFrom(bytes(nativeId)));
      if(info==null||tx==null)return observed("pending");
      // Result fields are execution data appended by java-tron. Their removal
      // reconstructs only the ORIGINAL retained network envelope, never a new tx.
      if(!Arrays.equals(tx.toBuilder().clearRet().build().toByteArray(),signed.toByteArray())||!Arrays.equals(info.getId().toByteArray(),bytes(nativeId))){adverse=true;return observed("adverse");}
      long height=info.getBlockNumber(),solid=chain.getDynamicPropertiesStore().getLatestSolidifiedBlockNum();if(solid<height)return observed("pending");if(solid-height>256)return observed("unknown");
      BlockCapsule included=chain.getBlockByNum(height);int found=0;for(Transaction t:included.getInstance().getTransactionsList())if(Arrays.equals(t.getRawData().toByteArray(),prepared.toByteArray())){found++;need(Arrays.equals(t.toBuilder().clearRet().build().toByteArray(),signed.toByteArray()));}
      if(found!=1||info.getBlockTimeStamp()!=included.getTimeStamp()||info.getResult()!=Protocol.TransactionInfo.code.SUCESS){adverse=true;return observed("adverse");}
      byte[] previous=included.getBlockId().getBytes();for(long h=height+1;h<=solid;h++){BlockCapsule b=chain.getBlockByNum(h);if(!Arrays.equals(b.getInstance().getBlockHeader().getRawData().getParentHash().toByteArray(),previous)){adverse=true;return observed("adverse");}previous=b.getBlockId().getBytes();}
      return observed("observed");
    }
  }
  private String sourceTransaction(Transaction transaction)throws Exception{if(transaction==null)return "{}";StringBuilder signatures=new StringBuilder("["),results=new StringBuilder("[");
    for(int i=0;i<transaction.getSignatureCount();i++){if(i>0)signatures.append(',');signatures.append(q(hex(transaction.getSignature(i).toByteArray())));}signatures.append(']');
    for(int i=0;i<transaction.getRetCount();i++){if(i>0)results.append(',');Transaction.Result r=transaction.getRet(i);results.append(obj("contractRet",q(r.getContractRet().name()),"ret",q(r.getRet().name())));}results.append(']');
    return obj("txID",q(sha(transaction.getRawData().toByteArray())),"raw_data_hex",q(hex(transaction.getRawData().toByteArray())),"signature",signatures.toString(),"ret",results.toString());}
  private String sourceBlock(long number)throws Exception{need(number>=0);BlockCapsule b=chain.getBlockByNum(number);StringBuilder transactions=new StringBuilder("[");
    need(b.getInstance().getTransactionsCount()<=1024);for(int i=0;i<b.getInstance().getTransactionsCount();i++){if(i>0)transactions.append(',');transactions.append(sourceTransaction(b.getInstance().getTransactions(i)));}transactions.append(']');
    return obj("blockID",q(hex(b.getBlockId().getBytes())),"block_header",obj("raw_data",obj("number",decimal(number),"timestamp",decimal(b.getTimeStamp()),"parentHash",q(hex(b.getInstance().getBlockHeader().getRawData().getParentHash().toByteArray())))),"transactions",transactions.toString());}
  private String sourceInfo(String id)throws Exception{need(signed!=null&&id.equals(nativeId));Protocol.TransactionInfo info=wallet.getTransactionInfoById(ByteString.copyFrom(bytes(id)));if(info==null)return "{}";
    String result=info.getReceipt().getResult().name();String receipt=result.equals("DEFAULT")?"{}":obj("result",q(result));return obj("id",q(hex(info.getId().toByteArray())),"blockNumber",decimal(info.getBlockNumber()),"blockTimeStamp",decimal(info.getBlockTimeStamp()),"fee",decimal(info.getFee()),"result",q(info.getResult().name()),"receipt",receipt);}
  private String sourceReplay(String id,String blockId)throws Exception{need(signed!=null&&id.equals(nativeId));Protocol.TransactionInfo info=wallet.getTransactionInfoById(ByteString.copyFrom(bytes(id)));need(info!=null);
    BlockCapsule b=chain.getBlockByNum(info.getBlockNumber());need(hex(b.getBlockId().getBytes()).equals(blockId));Transaction tx=wallet.getTransactionById(ByteString.copyFrom(bytes(id)));need(tx!=null&&Arrays.equals(tx.toBuilder().clearRet().build().toByteArray(),signed.toByteArray()));
    return OwnedLocalTronReplayRecorder.read(id,blockId);}
  private String dispatch(String[] command)throws Exception{String op=command[0];
    if(op.equals("SOURCEBLOCK")){need(command.length==2&&command[1].matches("0|[1-9][0-9]{0,18}"));return sourceBlock(Long.parseLong(command[1]));}
    if(op.equals("SOURCESOLID")){need(command.length==1);return sourceBlock(chain.getDynamicPropertiesStore().getLatestSolidifiedBlockNum());}
    if(op.equals("SOURCETX")){need(command.length==2&&signed!=null&&command[1].equals(nativeId));return sourceTransaction(wallet.getTransactionById(ByteString.copyFrom(bytes(nativeId))));}
    if(op.equals("SOURCEINFO")){need(command.length==2);return sourceInfo(command[1]);}
    if(op.equals("SOURCEREPLAY")){need(command.length==3);return sourceReplay(command[1],command[2]);}
    if(op.equals("HEALTH")){need(command.length==1);return snapshot();}
    if(op.equals("PREPARE")){need(command.length==3);return prepare(command[1],command[2]);}
    if(op.equals("CURRENT")){need(command.length==2);return current(command[1]);}
    if(op.equals("ARMKEY")){need(command.length==2);return armKey(command[1]);}
    if(op.equals("ARMSEND")){need(command.length==2);return armSend(command[1]);}
    if(op.equals("SIGN")){need(command.length==3);return sign(command[1],command[2]);}
    if(op.equals("BROADCAST")){need(command.length==4);return broadcast(command[1],command[2],command[3]);}
    if(op.equals("OBSERVE")){need(command.length==2);return observe(command[1]);}
    throw new IllegalStateException("METHOD_DENIED");
  }
  // BEGIN FIXED PRIVATE FIRST ERROR V3 METHODS
  private static String privateDiagnosticName(String value) {
    return value!=null&&value.length()<=256&&value.matches("[A-Za-z0-9_.$<>-]+")?value:"UNKNOWN";
  }
  private static String privateDiagnosticQuoted(String value) {
    return "\""+privateDiagnosticName(value)+"\"";
  }
  private static String privateDiagnosticCommand(String line) {
    int boundary=line.indexOf('\t');String value=boundary<0?line:line.substring(0,boundary);
    for(String allowed:new String[]{"SOURCEBLOCK","SOURCESOLID","SOURCETX","SOURCEINFO","SOURCEREPLAY",
      "HEALTH","PREPARE","CURRENT","ARMKEY","ARMSEND","SIGN","BROADCAST","OBSERVE"})
      if(allowed.equals(value))return allowed;
    return "UNKNOWN";
  }
  private String privateDiagnosticStage() {
    return sendStarted?"SEND_STARTED":sendArmed?"SEND_ARMED":keyStarted?"KEY_STARTED":keyArmed?"KEY_ARMED":preparedOnce?"PREPARED":"UNPREPARED";
  }
  private void recordFirstPrivateError(Exception failure,String command,long began) {
    if(privateFirstErrorRecorded)return;privateFirstErrorRecorded=true;
    // Source identities only. Never exception message, causes, command arguments,
    // transaction/key bytes, snapshots or Throwable.toString()/printStackTrace().
    try {
      long elapsed=Math.max(0L,(System.nanoTime()-began)/1000000L);
      StackTraceElement[] stack=failure.getStackTrace();StringBuilder frames=new StringBuilder("[");
      for(int i=0;i<Math.min(stack.length,16);i++) {
        if(i>0)frames.append(',');StackTraceElement frame=stack[i];
        frames.append("{\"className\":").append(privateDiagnosticQuoted(frame.getClassName()))
          .append(",\"methodName\":").append(privateDiagnosticQuoted(frame.getMethodName()))
          .append(",\"fileName\":").append(privateDiagnosticQuoted(frame.getFileName()))
          .append(",\"lineNumber\":").append(frame.getLineNumber()).append('}');
      }
      frames.append(']');
      System.err.println("{\"format\":\"LIANUM_TRON_FIRST_ERROR_PRIVATE_V3\",\"command\":"+privateDiagnosticQuoted(command)
        +",\"stage\":"+privateDiagnosticQuoted(privateDiagnosticStage())+",\"elapsedMilliseconds\":"+elapsed
        +",\"exceptionClassName\":"+privateDiagnosticQuoted(failure.getClass().getName())+",\"frames\":"+frames+"}");
      System.err.flush();
    }catch(Throwable diagnosticUnavailable) {
      // Diagnostic failure never changes the original poison or JSON response.
      System.err.println("{\"format\":\"LIANUM_TRON_FIRST_ERROR_PRIVATE_V3\",\"diagnosticUnavailable\":true}");
    }
  }
  // END FIXED PRIVATE FIRST ERROR V3 METHODS
  private void run()throws Exception{
    // Java8 try-with-resources preserves any primary startup/protocol failure
    // and adds a cleanup failure as suppressed; no failed cleanup is retried.
    try(OwnedShutdown owned=shutdown){try{start();try(BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.US_ASCII))){String line;
      while((line=input.readLine())!=null){need(line.length()<=8192);if(line.equals("CLOSE")){protocol.println("{}");break;}
        long commandBegan=System.nanoTime();
        try{protocol.println(dispatch(line.split("\\t",-1)));}catch(Exception failure){poisoned=true;recordFirstPrivateError(failure,privateDiagnosticCommand(line),commandBegan);protocol.println("{\"error\":\"REJECTED_OR_UNKNOWN\"}");}
      }}}finally{solver=null;}}
  }
  public static void main(String[] args)throws Exception{need(args.length==0);PrintStream protocol=System.out;System.setOut(System.err);new OwnedTronNativeDriver(protocol).run();}
}
