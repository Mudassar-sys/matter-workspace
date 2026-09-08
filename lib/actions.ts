"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { getContext, VIEW_AS_COOKIE } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";
import { provisionMatterWorkspace } from "@/lib/graph";

export async function signInWithMicrosoft() {
  await signIn("microsoft-entra-id", { redirectTo: "/matters" });
}

export async function signOutAction() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  await signOut({ redirectTo: "/" });
}

export async function setViewAs(formData: FormData) {
  const ctx = await getContext();
  if (!ctx?.actual.isDemoAdmin) return;
  const email = String(formData.get("email") ?? "").toLowerCase();
  const jar = await cookies();
  if (!email || email === ctx.actual.email) jar.delete(VIEW_AS_COOKIE);
  else jar.set(VIEW_AS_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export interface ActionState {
  error?: string;
  ok?: boolean;
}

export async function createMatter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };
  if (ctx.effective.role === "paralegal") {
    return { error: "Paralegals cannot open matters. This is enforced by the database policy, not just the form." };
  }

  const matterNo = String(formData.get("matter_no") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const matterType = String(formData.get("matter_type") ?? "");
  const dateOfLoss = String(formData.get("date_of_loss") ?? "") || null;
  const responsible = String(formData.get("responsible_attorney") ?? "").toLowerCase();
  if (!/^\d{4}-\d{4}$/.test(matterNo)) return { error: "Matter number must look like 2026-0184." };
  if (clientName.length < 3) return { error: "Client name is required." };
  if (!responsible) return { error: "Pick a responsible attorney." };

  const db = await supabaseFor(ctx.effective);

  // 1. Insert under RLS. If the policy rejects the effective identity, stop here.
  const { data: matter, error: insertError } = await db
    .from("matters")
    .insert({
      matter_no: matterNo,
      client_name: clientName,
      matter_type: matterType,
      date_of_loss: dateOfLoss,
      responsible_attorney: responsible,
      created_by: ctx.effective.email,
    })
    .select("id")
    .single();
  if (insertError || !matter) {
    return { error: insertError?.message.includes("row-level security")
      ? "Blocked by row-level security: this role cannot create matters."
      : insertError?.message ?? "Insert failed." };
  }

  // 2. Provision the SharePoint workspace with the signed-in user's token.
  let sp: Awaited<ReturnType<typeof provisionMatterWorkspace>> | null = null;
  let provisionError: string | undefined;
  try {
    sp = await provisionMatterWorkspace(ctx.accessToken, matterNo, clientName);
  } catch (err) {
    provisionError = err instanceof Error ? err.message : "SharePoint provisioning failed";
  }

  if (sp) {
    await db
      .from("matters")
      .update({ sharepoint_url: sp.webUrl, sharepoint_drive_id: sp.driveId, sharepoint_item_id: sp.itemId })
      .eq("id", matter.id);
  }

  await db.from("audit_log").insert({
    actor_email: ctx.effective.email,
    action: sp ? "matter.created" : "matter.created.provisioning_failed",
    matter_id: matter.id,
    details: sp
      ? { matter_no: matterNo, sharepoint: sp.webUrl, folders: sp.foldersCreated.length, on_behalf_of: ctx.viewingAs ? ctx.actual.email : undefined }
      : { matter_no: matterNo, error: provisionError },
  });

  revalidatePath("/matters");
  redirect(`/matters/${matter.id}${provisionError ? "?sp_error=1" : ""}`);
}

export async function addWall(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return;
  const matterId = String(formData.get("matter_id"));
  const email = String(formData.get("email") ?? "").toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim() || "Conflict identified";
  const db = await supabaseFor(ctx.effective);
  const { error } = await db.from("matter_walls").insert({
    matter_id: matterId, email, reason, created_by: ctx.effective.email,
  });
  if (!error) {
    await db.from("audit_log").insert({
      actor_email: ctx.effective.email, action: "wall.created", matter_id: matterId, details: { email, reason },
    });
  }
  revalidatePath(`/matters/${matterId}`);
}

export async function removeWall(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return;
  const matterId = String(formData.get("matter_id"));
  const email = String(formData.get("email") ?? "").toLowerCase();
  const db = await supabaseFor(ctx.effective);
  const { error } = await db.from("matter_walls").delete().match({ matter_id: matterId, email });
  if (!error) {
    await db.from("audit_log").insert({
      actor_email: ctx.effective.email, action: "wall.removed", matter_id: matterId, details: { email },
    });
  }
  revalidatePath(`/matters/${matterId}`);
}

export async function addMember(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return;
  const matterId = String(formData.get("matter_id"));
  const email = String(formData.get("email") ?? "").toLowerCase();
  const db = await supabaseFor(ctx.effective);
  const { error } = await db.from("matter_members").insert({ matter_id: matterId, email });
  if (!error) {
    await db.from("audit_log").insert({
      actor_email: ctx.effective.email, action: "member.added", matter_id: matterId, details: { email },
    });
  }
  revalidatePath(`/matters/${matterId}`);
}

export async function advanceStage(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return;
  const matterId = String(formData.get("matter_id"));
  const stage = String(formData.get("stage"));
  const db = await supabaseFor(ctx.effective);
  const { error } = await db.from("matters").update({ stage }).eq("id", matterId);
  if (!error) {
    await db.from("audit_log").insert({
      actor_email: ctx.effective.email, action: "stage.changed", matter_id: matterId, details: { stage },
    });
  }
  revalidatePath(`/matters/${matterId}`);
  revalidatePath("/matters");
}
