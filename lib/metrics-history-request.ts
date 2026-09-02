export function shouldApplyMetricsHistoryRequest(requestId: number, currentRequestId: number, signal: AbortSignal) {
  return requestId === currentRequestId && !signal.aborted;
}