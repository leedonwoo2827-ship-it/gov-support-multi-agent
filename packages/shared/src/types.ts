// 비-Zod 보조 타입 (이벤트 등)

export type EventKind =
  | "progress"
  | "tool_call"
  | "tool_result"
  | "artifact"
  | "completion"
  | "error";

export interface BoardEvent {
  id: number;
  caseId: string | null;
  runId: string | null;
  agentId: string | null;
  kind: EventKind;
  payload: unknown;
  createdAt: string;
}
