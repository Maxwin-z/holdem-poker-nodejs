const ROOM_INVITE_QUERY_PARAM = "room";

export function getInvitedRoomID(search: string = window.location.search) {
  return new URLSearchParams(search).get(ROOM_INVITE_QUERY_PARAM)?.trim() || "";
}

export function createRoomInviteURL(
  roomid: string,
  currentURL: string = window.location.href
) {
  const url = new URL(currentURL);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set(ROOM_INVITE_QUERY_PARAM, roomid.trim());
  return url.toString();
}

export function createRoomInviteText(
  roomid: string,
  currentURL: string = window.location.href
) {
  const normalizedRoomID = roomid.trim();
  return `请加入房间：【${normalizedRoomID}】
点击链接直接加入：【${createRoomInviteURL(normalizedRoomID, currentURL)}】`;
}

export function removeRoomInviteFromURL() {
  const url = new URL(window.location.href);
  url.searchParams.delete(ROOM_INVITE_QUERY_PARAM);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}
