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

interface Invitation {
  email: string;
  role: Role;
  created_at: string;
}

const ROLE_OPTIONS: Role[] = ["viewer", "editor", "owner"];

export default function TeamPage() {
  const { userId } = useCurrentUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((json) => {
        if (json.members) setMembers(json.members);
        else setError(JSON.stringify(json.error));
      })
      .finally(() => setLoading(false));
    fetch("/api/team/invitations")
      .then((r) => r.json())
      .then((json) => {
        if (json.invitations) setInvitations(json.invitations);
        else if (json.error) setInviteError(String(json.error));
      })
      .catch(() => {});
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteNotice(null);
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(typeof json.error === "string" ? json.error : "Could not save the invitation.");
        return;
      }
      const saved: Invitation = json.invitation;
      setInvitations((prev) => [saved, ...prev.filter((i) => i.email !== saved.email)]);
      setInviteNotice(
        `${saved.email} can now sign up as ${saved.role}. Tell them to open the site, choose "Sign up", and use exactly this address with a password of their own.`
      );
      setInviteEmail("");
    } catch {
      setInviteError("Could not reach the server. Check your connection and try again.");
    } finally {
      setInviting(false);
    }
  }

  async function revoke(email: string) {
    setInviteError(null);
    setInviteNotice(null);
    const res = await fetch(`/api/team/invitations?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    if (res.ok) setInvitations((prev) => prev.filter((i) => i.email !== email));
    else setInviteError("Could not revoke that invitation.");
  }

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

        <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">Invite a person</h2>
            <p className="text-xs text-neutral-500">
              Colleagues with a @bog.ge address can already sign up. To let someone with any other address in (for example a Gmail
              account), add it here first — only that exact address will be accepted.
            </p>
          </div>
          <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@gmail.com"
              aria-label="Email address to invite"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-bog focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <SingleSelect
                panelWidth={128}
                highlightChanged={false}
                options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
                value={inviteRole}
                onChange={(v) => setInviteRole(v as Role)}
              />
              <button
                type="submit"
                disabled={inviting}
                className="whitespace-nowrap rounded-md bg-bog px-4 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
              >
                {inviting ? "Saving…" : "Add invitation"}
              </button>
            </div>
          </form>
          {inviteError && <p className="break-words text-sm text-red-600">{inviteError}</p>}
          {inviteNotice && <p className="break-words text-sm text-green-700">{inviteNotice}</p>}

          {invitations.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Waiting to sign up</p>
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {invitations.map((i) => (
                  <li key={i.email} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-800">{i.email}</p>
                      <p className="text-xs text-neutral-400">will join as {i.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(i.email)}
                      className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

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
