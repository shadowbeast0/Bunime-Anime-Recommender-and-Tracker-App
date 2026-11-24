"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { cloudSignIn, cloudSignUp, isCloudConfigured } from "@/lib/cloud";
import { linkAccount, onSyncStatus, openAccountOnThisDevice, syncNow, unlinkAccount, type SyncStatus } from "@/lib/syncEngine";

function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => onSyncStatus(setStatus), []);
  return status;
}

const timeAgo = (iso: string | null) => {
  if (!iso) return "not yet";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return new Date(iso).toLocaleString();
};

function CredentialsForm({ submitLabel, onSubmit, allowCreate }: { submitLabel: string; onSubmit: (email: string, password: string, create: boolean) => Promise<string | void>; allowCreate: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const run = async (create: boolean) => {
    setBusy(create ? "up" : "in");
    setMessage(null);
    try {
      const note = await onSubmit(email.trim(), password, create);
      if (note) setMessage({ text: note, ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Something went wrong.", ok: false });
    } finally { setBusy(null); }
  };

  return (
    <form className="sync-form" onSubmit={(event) => { event.preventDefault(); void run(false); }}>
      <div className="field"><label htmlFor="sync-email">Email</label><input id="sync-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      <div className="field"><label htmlFor="sync-password">Password</label><input id="sync-password" type="password" autoComplete="current-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      {message && <p className={`notice ${message.ok ? "ok" : ""}`} role="status">{message.text}</p>}
      <div className="toolbar">
        <button type="submit" className="btn btn-hot btn-sm" disabled={Boolean(busy)}>{busy === "in" ? <Loader2 size={15} className="spin" /> : <Cloud size={15} />} {submitLabel}</button>
        {allowCreate && <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || !email || password.length < 6} onClick={() => void run(true)}>{busy === "up" && <Loader2 size={15} className="spin" />} Create sync account</button>}
      </div>
    </form>
  );
}

export function CloudSyncPanel() {
  const status = useSyncStatus();

  if (!isCloudConfigured) {
    return (
      <div className="panel profile-card">
        <div><h3><CloudOff size={16} style={{ verticalAlign: "-3px" }} /> Sync across devices</h3><p className="help">Sync isn’t turned on for this copy of Bunime yet. Until it is, use Download backup and Restore backup to move your list.</p></div>
      </div>
    );
  }

  const linked = status && status.state !== "idle" && status.email;
  return (
    <div className="panel profile-card">
      <div><h3><Cloud size={16} style={{ verticalAlign: "-3px" }} /> Sync across devices</h3>
        <p className="help">{linked ? "Changes on any device signed in to this account show up everywhere within a few seconds." : "Sign in to a sync account to keep this list identical on your phone, laptop and any other browser. Your current list is merged in, nothing is lost."}</p></div>
      {linked ? (
        <>
          <div className="storage-meter">
            <span className={`dot ${status.state === "synced" ? "ok" : ""}`} />
            <span>
              <b>{status.email}</b><br />
              {status.state === "syncing" && "Syncing…"}
              {status.state === "synced" && `Synced ${timeAgo(status.lastSynced)}`}
              {status.state === "offline" && "Offline. Changes will sync when you reconnect."}
              {status.state === "error" && (status.message || "Sync failed.")}
            </span>
          </div>
          {status.state === "error" && /sign in again/i.test(status.message || "") && (
            <CredentialsForm submitLabel="Sign in again" allowCreate={false} onSubmit={async (email, password) => { await linkAccount(await cloudSignIn(email, password)); }} />
          )}
          <div className="toolbar">
            <button type="button" className="btn btn-ghost btn-sm" disabled={status.state === "syncing"} onClick={() => void syncNow()}><RefreshCw size={15} className={status.state === "syncing" ? "spin" : ""} /> Sync now</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void unlinkAccount()}><CloudOff size={15} /> Turn off sync on this device</button>
          </div>
        </>
      ) : (
        <CredentialsForm submitLabel="Sign in and sync" allowCreate onSubmit={async (email, password, create) => {
          if (create) {
            const { user, needsConfirmation } = await cloudSignUp(email, password);
            if (needsConfirmation || !user) return "Check your inbox and open the confirmation link, then come back and sign in here.";
            await linkAccount(user);
            return;
          }
          await linkAccount(await cloudSignIn(email, password));
        }} />
      )}
    </div>
  );
}

export function CloudSignIn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!isCloudConfigured) return null;
  return (
    <div className="sync-signin">
      {!open ? (
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}><Cloud size={16} /> Use my sync account</button>
      ) : (
        <>
          <p className="help">Sign in with your sync account to bring your list to this device.</p>
          <CredentialsForm submitLabel="Open my list" allowCreate={false} onSubmit={async (email, password) => {
            await openAccountOnThisDevice(await cloudSignIn(email, password));
            router.push("/dashboard/");
          }} />
        </>
      )}
    </div>
  );
}
