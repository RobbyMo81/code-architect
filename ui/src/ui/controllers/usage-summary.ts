import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  GatewaySessionRow,
  SessionsListResult,
  SessionsUsageEntry,
  SessionsUsageResult,
} from "../types.ts";

type UsageSummaryHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  topbarUsageLoading: boolean;
  topbarUsageError: string | null;
  topbarCurrentModel: string | null;
  topbarCurrentSessionTokens: number | null;
  topbarWeekTokens: number | null;
  topbarMonthTokens: number | null;
  topbarUsageUpdatedAt: number | null;
};

function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatIsoDate(d);
}

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "request failed";
}

function candidateSessionKeys(sessionKey: string): string[] {
  const key = sessionKey.trim() || "main";
  const set = new Set<string>([key]);
  if (key === "main" || key === "agent:main:main") {
    set.add("main");
    set.add("agent:main:main");
  }
  if (key.startsWith("agent:main:")) {
    set.add("agent:main:main");
    set.add("main");
  }
  return Array.from(set);
}

function findSessionRow(rows: GatewaySessionRow[], sessionKey: string): GatewaySessionRow | undefined {
  const keys = candidateSessionKeys(sessionKey);
  for (const key of keys) {
    const hit = rows.find((row) => row.key === key);
    if (hit) {
      return hit;
    }
  }
  return rows.find((row) => row.key === "main") ?? rows[0];
}

function findUsageSession(
  usage: SessionsUsageResult | null | undefined,
  sessionKey: string,
): SessionsUsageEntry | undefined {
  const sessions = usage?.sessions ?? [];
  const keys = candidateSessionKeys(sessionKey);
  for (const key of keys) {
    const hit = sessions.find((entry) => entry.key === key);
    if (hit) {
      return hit;
    }
  }
  return sessions.find((entry) => entry.key === "main") ?? sessions[0];
}

function pickModel(
  sessionRow: GatewaySessionRow | undefined,
  usageSession: SessionsUsageEntry | undefined,
  usage: SessionsUsageResult | null | undefined,
): string | null {
  return (
    sessionRow?.model ??
    usageSession?.model ??
    usageSession?.modelProvider ??
    usage?.aggregates?.byModel?.[0]?.model ??
    usage?.aggregates?.byModel?.[0]?.provider ??
    null
  );
}

function pickSessionTokens(
  sessionRow: GatewaySessionRow | undefined,
  usageSession: SessionsUsageEntry | undefined,
): number | null {
  if (typeof sessionRow?.totalTokens === "number") {
    return sessionRow.totalTokens;
  }
  if (typeof usageSession?.usage?.totalTokens === "number") {
    return usageSession.usage.totalTokens;
  }
  return null;
}

export async function refreshTopbarUsageSummary(host: UsageSummaryHost) {
  if (!host.client || !host.connected || host.topbarUsageLoading) {
    return;
  }

  host.topbarUsageLoading = true;
  host.topbarUsageError = null;

  try {
    const endDate = formatIsoDate(new Date());
    const [sessionsResRaw, usage7Raw, usage30Raw] = await Promise.all([
      host.client.request("sessions.list", { limit: 200, messageLimit: 0 }),
      host.client.request("sessions.usage", {
        startDate: isoDaysAgo(6),
        endDate,
        limit: 1000,
      }),
      host.client.request("sessions.usage", {
        startDate: isoDaysAgo(29),
        endDate,
        limit: 1000,
      }),
    ]);

    const sessionsRes = sessionsResRaw as SessionsListResult;
    const usage7 = usage7Raw as SessionsUsageResult;
    const usage30 = usage30Raw as SessionsUsageResult;

    const rows = sessionsRes?.sessions ?? [];
    const currentRow = findSessionRow(rows, host.sessionKey);
    const usage30Current = findUsageSession(usage30, host.sessionKey);

    host.topbarCurrentModel = pickModel(currentRow, usage30Current, usage30);
    host.topbarCurrentSessionTokens = pickSessionTokens(currentRow, usage30Current);
    host.topbarWeekTokens = usage7?.totals?.totalTokens ?? 0;
    host.topbarMonthTokens = usage30?.totals?.totalTokens ?? 0;
    host.topbarUsageUpdatedAt = Date.now();
  } catch (err) {
    host.topbarUsageError = toErrorMessage(err);
  } finally {
    host.topbarUsageLoading = false;
  }
}
