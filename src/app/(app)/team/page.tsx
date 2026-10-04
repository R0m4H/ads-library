"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { SingleSelect } from "@/components/MultiSelect";
import { useCurrentUser } from "@/components/RoleProvider";
import type { Role } from "@/lib/role";

interface Member {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
}

const ROLE_OPTIONS: Role[] = ["viewer", "editor", "owner"];

export default function TeamPage() {
  const { userId } = useCurrentUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((json) => {
        if (json.members) setMembers(json.members);
        else setError(JSON.stringify(json.error));
      })
      .finally(() => setLoading(false));
  }, []);

  async function changeRole(id: string, role: Role) {
    setSavingId(id);
    setError(null);
    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === id ? json.member : m)));
    } else {
      setError(JSON.stringify(json.error));
    }
    setSavingId(null);
  }

  return (
    <RoleGate minRole="owner">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-neutral-500">
            Viewers can see the Ad Library and Analysis tabs only. Editors can also manage brands, syncs, and themes.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{m.display_name || m.email}</p>
                  <p className="truncate text-xs text-neutral-400">{m.email}</p>
                </div>
                {m.id === userId ? (
                  <span className="shrink-0 whitespace-nowrap text-xs text-neutral-400">{m.role} (you)</span>
                ) : (
                  <div className="shrink-0">
                    <SingleSelect
                      compact
                      panelWidth={128}
                      highlightChanged={false}
                      disabled={savingId === m.id}
                      options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
                      value={m.role}
                      onChange={(v) => changeRole(m.id, v as Role)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGate>
  );
}
