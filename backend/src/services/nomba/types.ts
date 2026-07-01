// ─── Shapes verified against developer.nomba.com (see README "Nomba ground truth") ──

export interface NombaEnvelope<T> {
  code: string; // "00" on success
  description: string;
  data: T;
}

export interface IssueTokenResponse {
  businessId: string;
  access_token: string;
  refresh_token: string;
  expiresAt: string; // ISO-8601
}

export interface NombaOrder {
  orderReference?: string;
  customerId?: string;
  callbackUrl: string;
  customerEmail: string;
  amount: string; // naira decimal string, e.g. "10000.00"
  currency: 'NGN';
  accountId?: string;
}

export interface CreateOrderResponse {
  checkoutLink: string;
  orderReference: string;
}

export interface TokenizedCardPaymentResponse {
  status: boolean;
  message: string;
}

export interface TokenizedCardData {
  tokenKey: string;
  customerEmail: string;
  cardType: string;
  cardPan: string;
  tokenExpirationDate: string;
}

export interface ListTokenizedCardsResponse {
  nextPage: string;
  tokenizedCardDataList: TokenizedCardData[];
}

export interface CreateVirtualAccountResponse {
  createdAt: string;
  accountHolderId: string;
  accountRef: string;
  accountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  currency: 'NGN';
  expired?: boolean;
}

// ─── Adapter-level result of a charge (normalized for the billing engine) ───
export interface ChargeResult {
  success: boolean;
  code: string;
  message: string;
  nombaRef: string | null;
  // Present on failure only:
  failureReason?: import('../../models/Charge').FailureReason;
  simulated?: boolean;
}
