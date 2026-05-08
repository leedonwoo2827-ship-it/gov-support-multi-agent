"use client";
import { useState } from "react";
import type { SearchFilters } from "@gov/shared";

interface Props {
  onSearch: (filters: Partial<SearchFilters>) => void;
}

const FIELDS = ["창업", "금융", "기술", "인력", "수출", "내수", "경영", "기타"] as const;
const REGIONS = ["전국", "수도권", "서울", "경기", "인천", "부산", "대구", "광주", "대전"];

export default function SearchBar({ onSearch }: Props) {
  const [keyword, setKeyword] = useState("");
  const [field, setField] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [industry, setIndustry] = useState("");

  function submit() {
    const f: Partial<SearchFilters> = {};
    if (keyword.trim()) f.keyword = keyword.trim();
    if (field) f.field = field as any;
    if (region) f.region = region;
    if (industry.trim()) f.industry = industry.trim();
    onSearch(f);
  }

  return (
    <aside className="gov-card p-4 sticky top-4 self-start">
      <h2 className="font-semibold mb-3 text-gov-blue">🔍 공고 검색</h2>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs text-gray-600 mb-1">키워드</label>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="예: 스마트팩토리, AI"
            className="w-full border border-gov-line rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">분야</label>
          <select value={field} onChange={e => setField(e.target.value)}
                  className="w-full border border-gov-line rounded px-2 py-1.5">
            <option value="">전체</option>
            {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">지역</label>
          <select value={region} onChange={e => setRegion(e.target.value)}
                  className="w-full border border-gov-line rounded px-2 py-1.5">
            <option value="">전체</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">업종 (포함 검색)</label>
          <input
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            placeholder="예: 제조, AI"
            className="w-full border border-gov-line rounded px-2 py-1.5"
          />
        </div>
        <button onClick={submit} className="gov-btn w-full">검색</button>
      </div>
    </aside>
  );
}
