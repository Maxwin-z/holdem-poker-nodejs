import {
  createRoomInviteText,
  createRoomInviteURL,
  getInvitedRoomID,
} from "./roomInvite";

describe("room invitation", () => {
  it("reads and trims the invited room ID", () => {
    expect(getInvitedRoomID("?room=%201238%20")).toBe("1238");
    expect(getInvitedRoomID("?other=value")).toBe("");
  });

  it("creates a root-level room invitation URL", () => {
    expect(
      createRoomInviteURL(
        "1238",
        "https://codecrab.dev/current/path?old=value#section"
      )
    ).toBe("https://codecrab.dev/?room=1238");
  });

  it("creates the complete copyable invitation text", () => {
    expect(
      createRoomInviteText("1238", "https://codecrab.dev/table?old=value")
    ).toBe(
      "请加入房间：【1238】\n点击链接直接加入：【https://codecrab.dev/?room=1238】"
    );
  });
});
