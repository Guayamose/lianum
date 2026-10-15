/** Test-only static assets for the real wallet HTTP boundary. No product UI. */
import { startWalletApplication as startHttpService } from '@lianum/backend/wallet/http-service';
export const fixtureAssets = Object.freeze({
  '/': [new URL('./index.html', import.meta.url), 'text/html; charset=utf-8'],
  '/app.mjs': [new URL('./module.fixture.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/style.css': [new URL('./style.fixture.css', import.meta.url), 'text/css; charset=utf-8'],
  '/packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs': [new URL('../../../../../mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
  '/packages/mobile-protocol/src/wallet/client/view-model.mjs': [new URL('../../../../../mobile-protocol/src/wallet/client/view-model.mjs', import.meta.url), 'text/javascript; charset=utf-8'],
});
export function startWalletApplication(options = {}) { return startHttpService(options, fixtureAssets); }
