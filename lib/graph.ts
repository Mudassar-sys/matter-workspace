const GRAPH = "https://graph.microsoft.com/v1.0";

/** Standard matter folder structure. Every matter gets exactly this tree. */
export const MATTER_FOLDERS = [
  "01 Intake and Engagement",
  "02 Insurance and Coverage",
  "03 Medical Records",
  "04 Bills and Liens",
  "05 Correspondence",
  "06 Demand Package",
  "07 Litigation",
  "08 Settlement and Disbursement",
  "09 Closing and Retention",
] as const;

const ROOT_FOLDER = "Matters";

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
}

class GraphError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function graph<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GraphError(
      body?.error?.message ?? `Graph ${res.status}`,
      res.status,
      body?.error?.code,
    );
  }
  return body as T;
}

/** The document library on the tenant's root SharePoint site. */
export async function getRootDriveId(token: string): Promise<string> {
  const drive = await graph<{ id: string }>(token, "/sites/root/drive");
  return drive.id;
}

async function ensureFolder(
  token: string,
  driveId: string,
  parentPath: string,
  name: string,
): Promise<DriveItem> {
  const parent = parentPath ? `/drives/${driveId}/root:/${encodeURI(parentPath)}:` : `/drives/${driveId}/root`;
  try {
    return await graph<DriveItem>(token, `${parent}/children`, {
      method: "POST",
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
  } catch (err) {
    if (err instanceof GraphError && err.code === "nameAlreadyExists") {
      const path = parentPath ? `${parentPath}/${name}` : name;
      return graph<DriveItem>(token, `/drives/${driveId}/root:/${encodeURI(path)}`);
    }
    throw err;
  }
}

export interface ProvisionResult {
  itemId: string;
  webUrl: string;
  driveId: string;
  foldersCreated: string[];
}

/**
 * Create `Matters/<matter no> - <client>/` plus the standard sub-folders in the
 * root site's document library, using the signed-in user's delegated token.
 * Idempotent: re-running for the same matter reuses existing folders.
 */
export async function provisionMatterWorkspace(
  token: string,
  matterNo: string,
  clientName: string,
): Promise<ProvisionResult> {
  const driveId = await getRootDriveId(token);
  await ensureFolder(token, driveId, "", ROOT_FOLDER);

  const safeClient = clientName.replace(/[\\/:*?"<>|#%]/g, " ").replace(/\s+/g, " ").trim();
  const matterFolderName = `${matterNo} - ${safeClient}`;
  const matterFolder = await ensureFolder(token, driveId, ROOT_FOLDER, matterFolderName);

  const foldersCreated: string[] = [];
  for (const sub of MATTER_FOLDERS) {
    await ensureFolder(token, driveId, `${ROOT_FOLDER}/${matterFolderName}`, sub);
    foldersCreated.push(sub);
  }

  return { itemId: matterFolder.id, webUrl: matterFolder.webUrl, driveId, foldersCreated };
}

export async function listMatterFolder(token: string, driveId: string, itemId: string) {
  const res = await graph<{ value: Array<{ name: string; webUrl: string; folder?: { childCount: number } }> }>(
    token,
    `/drives/${driveId}/items/${itemId}/children?$select=name,webUrl,folder`,
  );
  return res.value;
}

export async function whoAmI(token: string) {
  return graph<{ displayName: string; mail: string; userPrincipalName: string }>(token, "/me");
}
