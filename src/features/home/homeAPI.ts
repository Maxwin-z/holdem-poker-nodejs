import { ApiRsp } from "../../ApiType";

export function loadToken() {
  return localStorage["token"];
}

export async function roominfo(): Promise<ApiRsp> {
  const rsp = await fetch("/currentroom", {
    method: "GET",
    headers: {
      authorization: localStorage["token"],
    },
  });
  return await rsp.json();
}

export async function createroom(sb: number, buyin: number): Promise<ApiRsp> {
  const rsp = await fetch("/createroom", {
    method: "POST",
    body: JSON.stringify({
      sb,
      buyin,
    }),
    headers: {
      authorization: localStorage["token"],
      "Content-Type": "application/json",
    },
  });
  return await rsp.json();
}

export async function joinroom(roomid: string): Promise<ApiRsp> {
  const rsp = await fetch("/joinroom", {
    method: "POST",
    body: JSON.stringify({
      roomid,
    }),
    headers: {
      authorization: localStorage["token"],
      "Content-Type": "application/json",
    },
  });
  return await rsp.json();
}
