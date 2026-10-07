import org.tron.core.config.args.Args;
import org.tron.common.parameter.CommonParameter;
/** Public configuration inspection only. No application, native ledger,
 * consensus, wallet or private key is constructed or printed. */
public final class TronOfflineConfigurationDiagnostic {
  public static void main(String[] ignored) throws Exception {
    if (ignored.length != 0) throw new IllegalArgumentException("NO_OPTIONS");
    Args.setParam(new String[]{"--p2p-disable", "true", "-c", "public-offline.conf"}, "public-offline.conf");
    CommonParameter p = Args.getInstance();
    System.out.println("{" +
      "\"p2pDisable\":" + p.p2pDisable +
      ",\"p2pConfigAbsent\":" + (p.getP2pConfig() == null) +
      ",\"rpcEnable\":" + p.rpcEnable +
      ",\"rpcSolidityEnable\":" + p.rpcSolidityEnable +
      ",\"rpcPBFTEnable\":" + p.rpcPBFTEnable +
      ",\"fullNodeHttpEnable\":" + p.fullNodeHttpEnable +
      ",\"solidityNodeHttpEnable\":" + p.solidityNodeHttpEnable +
      ",\"pBFTHttpEnable\":" + p.pBFTHttpEnable +
      ",\"jsonRpcHttpFullNodeEnable\":" + p.jsonRpcHttpFullNodeEnable +
      ",\"jsonRpcHttpSolidityNodeEnable\":" + p.jsonRpcHttpSolidityNodeEnable +
      ",\"jsonRpcHttpPBFTNodeEnable\":" + p.jsonRpcHttpPBFTNodeEnable +
      ",\"nodeDiscoveryEnable\":" + p.nodeDiscoveryEnable +
      ",\"nodeDiscoveryPersist\":" + p.nodeDiscoveryPersist +
      ",\"nodeEnableIpv6\":" + p.nodeEnableIpv6 +
      ",\"nodeEffectiveCheckEnable\":" + p.nodeEffectiveCheckEnable +
      ",\"dynamicConfigEnable\":" + p.dynamicConfigEnable +
      ",\"nodeMetricsEnable\":" + p.nodeMetricsEnable +
      ",\"metricsPrometheusEnable\":" + p.metricsPrometheusEnable +
      ",\"eventSubscribe\":" + p.eventSubscribe +
      ",\"backupPort\":" + p.backupPort +
      ",\"backupMemberCount\":" + p.backupMembers.size() +
      ",\"activeNodeCount\":" + p.activeNodes.size() +
      ",\"passiveNodeCount\":" + p.passiveNodes.size() +
      ",\"fastForwardNodeCount\":" + p.fastForwardNodes.size() +
      ",\"seedAddressCount\":" + p.seedNode.getAddressList().size() +
      ",\"dnsTreeUrlCount\":" + p.dnsTreeUrls.size() +
      ",\"minEffectiveConnection\":" + p.minEffectiveConnection +
      ",\"agreeNodeCount\":" + p.agreeNodeCount + "}");
  }
}
