import {
  normalizeMember,
  normalizePlan,
  normalizeRecoveryCycle,
  normalizeSubscription,
} from "@/lib/normalize";
import type {
  CreateMemberInput,
  CreatePlanInput,
  DemoActivateInput,
  DemoActionResponse,
  DemoAdvanceInput,
  DemoSimulateFailureInput,
  DemoVirtualAccountCreditInput,
  InitiateSubscriptionResponse,
  Member,
  Plan,
  RecoveryCycle,
  StatsResponse,
  SubscriptionSummary,
} from "@/lib/types";

const API_PREFIX = "/api/backend";

export class ApiClientError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");

  const hasBody = init?.body !== undefined;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const rawText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const payload = rawText
    ? contentType.includes("application/json")
      ? JSON.parse(rawText)
      : rawText
    : null;

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new ApiClientError(errorMessage, response.status, payload);
  }

  return payload as TResponse;
}

export const api = {
  async getPlan(planId: string): Promise<Plan> {
    const raw = await request<Plan & { _id?: string }>(`/plans/${planId}`);
    return normalizePlan(raw);
  },

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const raw = await request<Plan & { _id?: string }>("/plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return normalizePlan(raw);
  },

  async createMember(input: CreateMemberInput): Promise<Member> {
    const raw = await request<Member & { _id?: string }>("/members", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return normalizeMember(raw);
  },

  async initiateSubscription(input: {
    planId: string;
    memberId: string;
  }): Promise<InitiateSubscriptionResponse> {
    return request<InitiateSubscriptionResponse>("/subscriptions/initiate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getSubscriptions(): Promise<SubscriptionSummary[]> {
    const raw = await request<Array<SubscriptionSummary & { _id?: string }>>(
      "/subscriptions",
    );
    return raw.map((subscription) => normalizeSubscription(subscription));
  },

  async getCycles(status?: string): Promise<RecoveryCycle[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const raw = await request<Array<RecoveryCycle & { _id?: string }>>(
      `/cycles${query}`,
    );
    return raw.map((cycle) => normalizeRecoveryCycle(cycle));
  },

  async getStats(): Promise<StatsResponse> {
    return request<StatsResponse>("/stats");
  },

  async demoActivate(input: DemoActivateInput): Promise<DemoActionResponse> {
    return request<DemoActionResponse>("/demo/activate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async demoAdvance(input: DemoAdvanceInput): Promise<DemoActionResponse> {
    return request<DemoActionResponse>("/demo/advance", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async demoSimulateFailure(
    input: DemoSimulateFailureInput,
  ): Promise<DemoActionResponse> {
    return request<DemoActionResponse>("/demo/simulate-failure", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async demoVirtualAccountCredit(
    input: DemoVirtualAccountCreditInput,
  ): Promise<DemoActionResponse> {
    return request<DemoActionResponse>("/demo/simulate-va-credit", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
