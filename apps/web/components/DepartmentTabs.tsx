"use client";
import type { Department } from "@gov/shared";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/department";

interface Props {
  value: Department;
  onChange: (d: Department) => void;
}

export default function DepartmentTabs({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-white border border-gov-line rounded mb-4 p-1 text-sm">
      {DEPARTMENTS.map(d => {
        const l = DEPARTMENT_LABELS[d];
        const active = d === value;
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            className={`flex-1 px-3 py-2 rounded transition ${
              active
                ? "bg-gov-blue text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-center gap-1 font-semibold">
              <span>{l.emoji}</span>
              <span>{l.ko}</span>
            </div>
            <div className={`text-[11px] mt-0.5 ${active ? "text-white/80" : "text-gray-500"}`}>
              {l.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
