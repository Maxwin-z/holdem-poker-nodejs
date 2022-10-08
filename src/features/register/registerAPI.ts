import { ApiRsp } from "../../ApiType";

export async function registerApi(name: string): Promise<ApiRsp> {
  const rsp = await fetch("/register", {
    method: "POST",
    body: JSON.stringify({
      name,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  return await rsp.json();
}
