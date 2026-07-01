import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { nombaRequest } from './client';
import { mockNomba } from './mock';
import { toNombaAmount } from './amount';
import { mapFailureReason } from './failureMap';
import {
  ChargeResult,
  CreateOrderResponse,
  CreateVirtualAccountResponse,
  ListTokenizedCardsResponse,
  NombaOrder,
  TokenizedCardPaymentResponse,
} from './types';

/**
 * The Nomba adapter. THE SINGLE PLACE that talks to Nomba. The billing engine,
 * webhook handler and API routes call these functions only — never the HTTP
 * client or the raw API directly.
 *
 * Every method honours MOCK_NOMBA so the whole app runs offline for demos.
 */

const callbackUrl = `${env.publicBaseUrl}/checkout/return`;

export interface CreateCheckoutInput {
  orderReference: string;
  amountNaira: number;
  customerEmail: string;
}

export async function createCheckoutOrder(input: CreateCheckoutInput): Promise<CreateOrderResponse> {
  if (env.nomba.mock) {
    return (await mockNomba.createCheckoutOrder(input.orderReference)).data;
  }
  const order: NombaOrder = {
    orderReference: input.orderReference,
    callbackUrl,
    customerEmail: input.customerEmail,
    amount: toNombaAmount(input.amountNaira),
    currency: env.currency,
    ...(env.nomba.subAccountId ? { accountId: env.nomba.subAccountId } : {}),
  };
  const res = await nombaRequest<CreateOrderResponse>({
    method: 'POST',
    path: '/checkout/order',
    body: { order, tokenizeCard: true },
  });
  return res.data;
}

export interface ChargeTokenInput {
  tokenKey: string;
  amountNaira: number;
  customerEmail: string;
  orderReference: string;
  idempotencyKey: string;
}

/**
 * Charge a saved card token. Returns a normalized ChargeResult; never throws on
 * a declined card (only on transport errors). Success is Nomba code "00" AND
 * data.status === true.
 */
export async function chargeToken(input: ChargeTokenInput): Promise<ChargeResult> {
  if (env.nomba.mock) {
    const env_ = await mockNomba.chargeToken(input.amountNaira);
    const success = env_.code === '00' && env_.data.status === true;
    return {
      success,
      code: env_.code,
      message: env_.data.message,
      nombaRef: success ? `MOCK-${input.idempotencyKey}` : null,
      failureReason: success ? undefined : mapFailureReason(env_.data.message, env_.code),
    };
  }

  const order: NombaOrder = {
    orderReference: input.orderReference,
    callbackUrl,
    customerEmail: input.customerEmail,
    amount: toNombaAmount(input.amountNaira),
    currency: env.currency,
    ...(env.nomba.subAccountId ? { accountId: env.nomba.subAccountId } : {}),
  };

  try {
    const res = await nombaRequest<TokenizedCardPaymentResponse>({
      method: 'POST',
      path: '/checkout/tokenized-card-payment',
      body: { order, tokenKey: input.tokenKey },
      idempotencyKey: input.idempotencyKey,
    });
    const success = res.code === '00' && res.data?.status === true;
    return {
      success,
      code: res.code,
      message: res.data?.message ?? res.description,
      nombaRef: success ? input.idempotencyKey : null,
      failureReason: success ? undefined : mapFailureReason(res.data?.message, res.code),
    };
  } catch (err: any) {
    // A non-2xx with an envelope (e.g. 400 declined) is a charge failure, not a
    // transport failure — normalize it so the engine can branch on the reason.
    const body = err?.body;
    if (body && typeof body.code === 'string') {
      return {
        success: false,
        code: body.code,
        message: body.description ?? 'Charge failed',
        nombaRef: null,
        failureReason: mapFailureReason(body.description, body.code),
      };
    }
    // Genuine transport/5xx error: rethrow so BullMQ retries the job.
    logger.error({ err: err?.message }, 'Nomba chargeToken transport error');
    throw err;
  }
}

export interface CreateVirtualAccountInput {
  accountRef: string;
  accountName: string;
  expectedAmountNaira?: number;
}

export async function createVirtualAccount(
  input: CreateVirtualAccountInput
): Promise<CreateVirtualAccountResponse> {
  if (env.nomba.mock) {
    return (
      await mockNomba.createVirtualAccount(input.accountRef, input.accountName, input.expectedAmountNaira)
    ).data;
  }
  const res = await nombaRequest<CreateVirtualAccountResponse>({
    method: 'POST',
    path: '/accounts/virtual',
    body: {
      accountRef: input.accountRef,
      accountName: input.accountName,
      expectedAmount: input.expectedAmountNaira !== undefined ? toNombaAmount(input.expectedAmountNaira) : undefined,
    },
  });
  return res.data;
}

/**
 * List a customer's tokenized cards. Used as a fallback to recover the
 * `tokenKey` after a payment_success webhook that does not carry it inline
 * (the documented webhook payload does not always include tokenizedCardData).
 */
export async function listTokenizedCards(customerEmail: string): Promise<ListTokenizedCardsResponse> {
  if (env.nomba.mock) {
    return (await mockNomba.listTokenizedCards(customerEmail)).data;
  }
  const res = await nombaRequest<ListTokenizedCardsResponse>({
    method: 'GET',
    path: '/checkout/tokenized-card-data',
    query: { customerEmail, page: 0 },
  });
  return res.data;
}

export const nomba = {
  createCheckoutOrder,
  chargeToken,
  createVirtualAccount,
  listTokenizedCards,
};
