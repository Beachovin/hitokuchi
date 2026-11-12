import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { removeAvatar, saveAvatar } from "~/lib/avatar.server";
import { AVATAR_STORE_MAX_BYTES } from "~/lib/profile";
import { addUser, fakeImage } from "../helpers";

const file = (bytes: Uint8Array, type = "image/webp") => new File([bytes as BlobPart], "avatar", { type });
const keyOf = async (id: string) => (await env.DB.prepare("SELECT avatar_key FROM users WHERE id = ?").bind(id).first<{ avatar_key: string | null }>())!.avatar_key;

describe("プロフィール画像の保存", () => {
  it("R2 に保存し、キーにユーザー ID を含めない", async () => {
    const user = await addUser();
    const r = await saveAvatar(env, user, null, file(fakeImage("webp")));
    expect(r).toHaveProperty("key");
    const key = await keyOf(user);
    expect(key).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);
    expect(key).not.toContain(user);
    expect((await env.IMAGES.head(key!))?.httpMetadata?.contentType).toBe("image/webp");
  });
  it("差し替えると古い画像を削除する", async () => {
    const user = await addUser();
    await saveAvatar(env, user, null, file(fakeImage("png")));
    const old = await keyOf(user);
    await saveAvatar(env, user, old, file(fakeImage("jpeg")));
    expect(await env.IMAGES.head(old!)).toBeNull();
    expect(await keyOf(user)).toMatch(/\.jpeg$/);
    await removeAvatar(env, user, await keyOf(user));
    expect(await keyOf(user)).toBeNull();
  });
  it("形式は申告（Content-Type）ではなく中身で判断する", async () => {
    const user = await addUser();
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    expect(await saveAvatar(env, user, null, file(svg, "image/png"))).toHaveProperty("error");
    expect(await keyOf(user)).toBeNull();
  });
  it("圧縮されていない大きな画像・空のファイルは受け付けない", async () => {
    const user = await addUser();
    const big = new Uint8Array(AVATAR_STORE_MAX_BYTES + 1);
    big.set(fakeImage("jpeg"));
    expect(await saveAvatar(env, user, null, file(big))).toHaveProperty("error");
    expect(await saveAvatar(env, user, null, file(new Uint8Array()))).toHaveProperty("error");
  });
});
