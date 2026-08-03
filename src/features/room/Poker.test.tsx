import { render } from "@testing-library/react";
import { Poker } from "./Poker";

test("removes the previous card immediately when its value is cleared", () => {
  const { getByLabelText, getByText, queryByText, rerender } = render(
    <Poker card={{ num: 14, suit: "s" }} />
  );

  expect(getByText("A")).toBeTruthy();

  rerender(<Poker card={null} />);

  expect(queryByText("A")).toBeNull();
  expect(getByLabelText("空牌位")).toBeTruthy();
});
