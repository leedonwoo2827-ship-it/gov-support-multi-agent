// 클라이언트 ↔ orchestrator API 헬퍼

import type {
  Program, SearchFilters, Case, CompanyProfile,
} from "@gov/shared";

export interface PostRow {
  id: string;
  caseId: string;
  runId: string;
  agentId: "eligibility" | "plan-draft" | "doc-checklist" | "milestone";
  title: string;
  bodyMd: string;
  payload: any;
  createdAt: string;
}

export async function searchPrograms(filters: Partial<SearchFilters>) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: 1, pageSize: 30, ...filters }),
  });
  return res.json() as Promise<{
    total: number; programs: Program[]; warnings: string[];
  }>;
}

export async function runBulk(programIds: string[]) {
  const res = await fetch("/api/runs/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ programIds }),
  });
  return res.json() as Promise<{
    bulkId: string; cases: Case[]; totalAgents: number;
  }>;
}

export async function getDemoProfile() {
  const res = await fetch("/api/profiles/demo");
  return res.json() as Promise<{ id: string; profile: CompanyProfile }>;
}

export async function getCase(id: string) {
  const res = await fetch(`/api/cases/${id}`);
  return res.json() as Promise<{
    case: Case; program: Program; profile: CompanyProfile;
    posts: PostRow[]; runs: any[];
  }>;
}

export async function listPosts(filter?: { agentId?: string }) {
  const qs = filter?.agentId ? `?agentId=${filter.agentId}` : "";
  const res = await fetch(`/api/posts${qs}`);
  return res.json() as Promise<{ posts: PostRow[] }>;
}

export async function listAllCases() {
  const res = await fetch("/api/cases");
  return res.json() as Promise<{ cases: Case[] }>;
}
