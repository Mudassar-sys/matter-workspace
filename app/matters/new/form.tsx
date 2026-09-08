"use client";

import { useActionState } from "react";
import { createMatter, type ActionState } from "@/lib/actions";

interface Props {
  attorneys: Array<{ email: string; display_name: string; role: string }>;
  defaultMatterNo: string;
  defaultAttorney: string;
}

export function NewMatterForm({ attorneys, defaultMatterNo, defaultAttorney }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createMatter, {});

  return (
    <form action={action} className="stack">
      {state.error && <div className="notice notice-error">{state.error}</div>}
      <div className="form-grid">
        <label className="field">
          Matter number
          <input name="matter_no" defaultValue={defaultMatterNo} pattern="\d{4}-\d{4}" required />
        </label>
        <label className="field">
          Matter type
          <select name="matter_type" defaultValue="Personal Injury">
            <option>Personal Injury</option>
            <option>Medical Malpractice</option>
            <option>Nursing Home</option>
          </select>
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          Client / caption
          <input name="client_name" placeholder="Doe v. Example Logistics" required minLength={3} />
        </label>
        <label className="field">
          Date of loss
          <input name="date_of_loss" type="date" />
        </label>
        <label className="field">
          Responsible attorney
          <select name="responsible_attorney" defaultValue={defaultAttorney}>
            {attorneys.map((a) => (
              <option key={a.email} value={a.email}>{a.display_name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Creating record and SharePoint folders..." : "Open matter and provision workspace"}
        </button>
        <span className="muted small">Takes 3 to 8 seconds: ten Graph calls run in sequence.</span>
      </div>
    </form>
  );
}
