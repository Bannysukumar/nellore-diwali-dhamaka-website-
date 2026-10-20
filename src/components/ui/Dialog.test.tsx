import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function Form() {
  const [name, setName] = useState("");
  return (
    <Dialog open onClose={() => undefined} title="Edit">
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
    </Dialog>
  );
}

describe("Dialog", () => {
  it("keeps focus in a field while the parent re-renders on every keystroke", async () => {
    render(<Form />);
    const input = screen.getByLabelText("Name");
    await userEvent.click(input);
    await userEvent.keyboard("Diwali");
    expect(input).toHaveValue("Diwali");
    expect(input).toHaveFocus();
  });
});
