import { randomUUID } from 'crypto';
import { logger } from '../../config/logger';
import {
  CreateOrderResponse,
  CreateVirtualAccountResponse,
  ListTokenizedCardsResponse,
  TokenizedCardPaymentResponse,
  NombaEnvelope,
} from './types';

/**
 * Deterministic, sandbox-like Nomba mock used when MOCK_NOMBA=true. It lets the
 * whole demo (subscribe -> charge -> fail -> recover) run with no credentials
 * and no network. The behaviour mirrors Nomba's documented sandbox rules:
 *   - a charge for an amount > 500,000 is declined for insufficient funds
 *   - everything else is approved
 * Per-subscription forced failures are handled one layer up (chargeGateway),
 * so the mock itself just models the "happy" gateway.
 */

const ok = <T>(data: T, description = 'Success'): NombaEnvelope<T> => ({ code: '00', description, data });

export const mockNomba = {
  async createCheckoutOrder(orderReference: string): Promise<NombaEnvelope<CreateOrderResponse>> {
    logger.info({ orderReference, mock: true }, 'Mock Nomba: createCheckoutOrder');
    return ok({
      checkoutLink: `https://sandbox.nomba.com/checkout/${orderReference}`,
      orderReference,
    });
  },

  async chargeToken(amountNaira: number): Promise<NombaEnvelope<TokenizedCardPaymentResponse>> {
    if (amountNaira > 500_000) {
      return {
        code: '51',
        description: 'Declined',
        data: { status: false, message: 'Insufficient funds' },
      };
    }
    return ok(
      { status: true, message: 'Approved by Financial Institution' },
      'Success'
    );
  },

  async listTokenizedCards(customerEmail: string): Promise<NombaEnvelope<ListTokenizedCardsResponse>> {
    return ok({
      nextPage: '0',
      tokenizedCardDataList: [
        {
          tokenKey: `mock-token-${customerEmail}`,
          customerEmail,
          cardType: 'Mastercard',
          cardPan: '543462******2808',
          tokenExpirationDate: '12/30',
        },
      ],
    });
  },

  async createVirtualAccount(
    accountRef: string,
    accountName: string,
    expectedAmount?: number
  ): Promise<NombaEnvelope<CreateVirtualAccountResponse>> {
    const acct = String(9_000_000_000 + Math.floor(Math.random() * 99_999_999));
    return ok({
      createdAt: new Date().toISOString(),
      accountHolderId: randomUUID(),
      accountRef,
      accountName,
      bankName: 'Nombank MFB',
      bankAccountNumber: acct,
      bankAccountName: `Nomba/${accountName}`,
      currency: 'NGN',
      expired: false,
    });
  },
};
