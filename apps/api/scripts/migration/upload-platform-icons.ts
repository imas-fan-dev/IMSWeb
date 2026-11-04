import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

import { createNodeServices } from "@/runtime/node-services";

/**
 * 一次性脚本：把站内自带的平台图标搬进对象存储，并回写成「已上传」形态，
 * 之后后台换图就是覆盖同一个键，不再有「内置图标」这一层。
 */
const SOURCE_DIR = join(process.cwd(), "..", "web", "public", "brand", "platforms");

const PLATFORMS: Array<{ id: string; file: string }> = [
    { id: "mirishita", file: "million.svg" },
    { id: "deresute", file: "deremas.svg" },
    { id: "shanison", file: "shanimas.svg" },
    { id: "gakumas", file: "gakumas.svg" },
    { id: "switch", file: "switch.svg" },
    { id: "xbox", file: "xbox.svg" },
];

async function main(): Promise<void> {
    const services = await createNodeServices();
    if (!services.storage) throw new Error("storage unavailable");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL missing");
    const client = new Client({ connectionString });
    await client.connect();
    for (const platform of PLATFORMS) {
        const body = await readFile(join(SOURCE_DIR, platform.file));
        const key = `platform/account-kinds/${platform.id}/icon.svg`;
        await services.storage.put(key, body, {
            contentType: "image/svg+xml",
            ownerToken: "system",
            metadata: { kind: "platform-account-icon", platform: platform.id },
        });
        const result = await client.query(
            `UPDATE platform_account_kinds
                SET icon_object_key=$1, updated_at=now()::text
              WHERE id=$2`,
            [key, platform.id],
        );
        console.log(platform.id, key, `${body.byteLength} bytes`, result.rowCount);
    }
    await client.end();
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
