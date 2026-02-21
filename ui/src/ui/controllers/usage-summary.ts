import type { GatewayBrowserClient } from "../gateway.ts";
import type { GatewaySessionRow, SessionsListResult, SessionsUsageResult } from "../types.ts";

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

function findSessionRow(
  rows: GatewaySessionRow[],
  sessionKey: string,
): GatewaySessionRow | undefined {
  return rows.find((row) => row.key === sessionKey) ?? rows.find((row) => row.key === "main");
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
    const current = findSessionRow(rows, host.sessionKey);

    host.topbarCurrentModel = current?.model ?? current?.modelProvider ?? null;
    host.topbarCurrentSessionTokens = current?.totalTokens ?? null;
    host.topbarWeekTokens = usage7?.totals?.totalTokens ?? 0;
    host.topbarMonthTokens = usage30?.totals?.totalTokens ?? 0;
    host.topbarUsageUpdatedAt = Date.now();
  } catch (err) {
    host.topbarUsageError = toErrorMessage(err);
  } finally {
    host.topbarUsageLoading = false;
  }
}
