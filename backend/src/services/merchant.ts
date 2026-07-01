import { MerchantModel } from '../models';
import { logger } from '../config/logger';

const DEFAULT_MERCHANT_NAME = 'FitHub Lagos';

/**
 * The PRD calls for a single hardcoded merchant (no merchant signup). We ensure
 * one exists at boot and reuse it whenever a request omits merchantId.
 */
export async function ensureDefaultMerchant(): Promise<string> {
  let merchant = await MerchantModel.findOne({ name: DEFAULT_MERCHANT_NAME });
  if (!merchant) {
    merchant = await MerchantModel.create({ name: DEFAULT_MERCHANT_NAME });
    logger.info({ merchantId: merchant._id.toString() }, 'Default merchant created');
  }
  return merchant._id.toString();
}

export async function defaultMerchantId(): Promise<string> {
  return ensureDefaultMerchant();
}
