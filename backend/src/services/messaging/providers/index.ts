import logger from '../../../logger';
import type { WhatsappConfig } from '../whatsappConfig';
import { DryRunProvider } from './dryRun';
import { MetaCloudProvider } from './metaCloud';
import type { WhatsAppProvider } from './types';

export type { WhatsAppProvider, SendResult, SendTemplateRequest } from './types';

// Phase 32 B2: picks the provider. The real Meta provider is returned ONLY when every
// switch is on; anything short of that is the dry-run provider, with the reason logged.
//   - WHATSAPP_ENABLED=true and WHATSAPP_PROVIDER=meta (credentials are then already
//     required by whatsappConfig), and
//   - NODE_ENV=production, or WHATSAPP_ALLOW_NON_PRODUCTION_SEND=true (only for the
//     deliberate Meta test-number check, E21).
export function createWhatsAppProvider(
  wa: WhatsappConfig,
  nodeEnv: string
): { provider: WhatsAppProvider; reason: string } {
  if (!wa.enabled) {
    return { provider: new DryRunProvider('WhatsApp disabled'), reason: 'WHATSAPP_ENABLED is not true' };
  }
  if (wa.provider !== 'meta') {
    return { provider: new DryRunProvider('dry-run provider'), reason: 'WHATSAPP_PROVIDER is dryrun' };
  }
  if (nodeEnv !== 'production' && !wa.allowNonProductionSend) {
    const reason = `NODE_ENV=${nodeEnv} and WHATSAPP_ALLOW_NON_PRODUCTION_SEND is not true — real sending blocked outside production`;
    logger.warn(`[whatsapp] ${reason}; using the dry-run provider`);
    return { provider: new DryRunProvider('blocked outside production'), reason };
  }
  return {
    provider: new MetaCloudProvider({
      accessToken: wa.accessToken!,
      phoneNumberId: wa.phoneNumberId!,
      apiVersion: wa.apiVersion,
    }),
    reason: 'enabled: Meta Cloud API',
  };
}
