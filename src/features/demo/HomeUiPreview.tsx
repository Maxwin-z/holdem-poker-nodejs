import { SimpleChipsRecord } from "../../ApiType";
import { CreateRoom } from "../createroom/CreateRoom";
import { RecentGameEntry } from "../createroom/RecentGameRecords";
import { Register } from "../register/Register";

const firstSession: SimpleChipsRecord[] = [
  { id: "maxwin", name: "Maxwin", chips: 124860, buyIn: 100000 },
  { id: "sora", name: "Sora", chips: 186400, buyIn: 120000 },
  { id: "momo", name: "Momo", chips: 128450, buyIn: 140000 },
  { id: "nana", name: "Nana", chips: 72210, buyIn: 80000 },
];

const secondSession: SimpleChipsRecord[] = [
  { id: "maxwin", name: "Maxwin", chips: 88400, buyIn: 100000 },
  { id: "leo", name: "Leo", chips: 116600, buyIn: 100000 },
  { id: "owen", name: "Owen", chips: 95200, buyIn: 100000 },
];

const previewRecords: RecentGameEntry[] = [
  {
    roomid: "8K21",
    date: Date.now() - 1000 * 60 * 38,
    records: firstSession,
  },
  {
    roomid: "6P7A",
    date: Date.now() - 1000 * 60 * 60 * 25,
    records: secondSession,
  },
];

export function HomeUiPreview() {
  const previewState =
    new URLSearchParams(window.location.search).get("state") || "login";

  if (previewState === "lobby") {
    return (
      <CreateRoom
        previewName="Maxwin"
        previewRecords={previewRecords}
      />
    );
  }

  return <Register />;
}
