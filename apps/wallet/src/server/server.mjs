/** Wallet UI composition; the shared HTTP service owns session and request handling. */
import {startWalletApplication as startWalletHttpService} from '@lianum/backend/wallet/http-service';
const assets = {
  '/': [new URL('../client/index.html', import.meta.url), 'text/html; charset=utf-8'],
  '/app.mjs': [new URL('../client/app.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/manual-action-dom.mjs': [new URL('../client/features/accounts/manual-action-dom.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/wrapped-resume-browser.mjs': [new URL('../client/features/withdrawals/wrapped-resume-browser.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/style.css': [new URL('../client/style.css', import.meta.url), 'text/css; charset=utf-8'],
};
// Expose the same explicit asset set at its canonical client paths.
const clientRoot = new URL('../client/', import.meta.url);
for (const [url, type] of Object.values(assets)) {
  if (type.startsWith('text/html')) continue;
  const pathname = '/' + url.pathname.slice(clientRoot.pathname.length);
  if (!Object.hasOwn(assets, pathname)) assets[pathname] = [url, type];
}
// Explicit browser-safe shared modules; no directory listing or arbitrary paths.
const sharedBrowserAssets = {
  'original-wallet-economic-state-v1.mjs': new URL('../../../../packages/mobile-protocol/src/original-wallet-economic-state-v1.mjs', import.meta.url),
  'wallet/client/view-model.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs', import.meta.url),
  'wallet/client/actions/account-context.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/actions/account-context.mjs', import.meta.url),
  'wallet/client/actions/catalog.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/actions/catalog.mjs', import.meta.url),
  'wallet/client/actions/rules.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/actions/rules.mjs', import.meta.url),
  'wallet/client/presentation/account-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/presentation/account-review.mjs', import.meta.url),
  'wallet/client/presentation/action-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/presentation/action-review.mjs', import.meta.url),
  'wallet/client/presentation/native-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/presentation/native-review.mjs', import.meta.url),
  'wallet/client/presentation/wallet-state.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/presentation/wallet-state.mjs', import.meta.url),
  'wallet/client/session.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/session.mjs', import.meta.url),
  'wallet/client/transport/http.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/transport/http.mjs', import.meta.url),
  'wallet/client/validation/account.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/account.mjs', import.meta.url),
  'wallet/client/validation/action-response.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/action-response.mjs', import.meta.url),
  'wallet/client/validation/graph-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/graph-review.mjs', import.meta.url),
  'wallet/client/validation/native-identity.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/native-identity.mjs', import.meta.url),
  'wallet/client/validation/transfers.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/transfers.mjs', import.meta.url),
  'wallet/client/validation/values.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/values.mjs', import.meta.url),
  'wallet/client/validation/wallet-state.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/validation/wallet-state.mjs', import.meta.url),
  'wallet/contracts/exact-action-browser-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/exact-action-browser-review.mjs', import.meta.url),
  'wallet/contracts/generation-defi-contract.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/generation-defi-contract.mjs', import.meta.url),
  'wallet/contracts/generation-position-state-v2.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/generation-position-state-v2.mjs', import.meta.url),
  'wallet/contracts/manual-action-handoff.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/manual-action-handoff.mjs', import.meta.url),
  'wallet/contracts/native-note-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/native-note-review.mjs', import.meta.url),
  'wallet/contracts/owner-graph-review-v1.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/owner-graph-review-v1.mjs', import.meta.url),
  'wallet/contracts/owner-portfolio-contract.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs', import.meta.url),
  'wallet/contracts/public-token-observations.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/public-token-observations.mjs', import.meta.url),
  'wallet/contracts/wrapped-withdrawal-resume-actions.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/wrapped-withdrawal-resume-actions.mjs', import.meta.url),
  'wallet/contracts/wrapped-withdrawal-review.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/contracts/wrapped-withdrawal-review.mjs', import.meta.url),
};
for (const [relative, url] of Object.entries(sharedBrowserAssets)) {
  const entry = [url, 'text/javascript; charset=utf-8'];
  assets['/packages/mobile-protocol/src/' + relative] = entry;
  assets['/mobile-protocol/src/' + relative] = entry;
}
Object.freeze(assets);

export function startWalletApplication(options={}){return startWalletHttpService(options,assets);}
