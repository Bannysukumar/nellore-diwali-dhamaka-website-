import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_MESSAGE, renderShareMessage } from "./rewardService";

const values = { code: "NDD42", link: "https://example.in/register?ref=NDD42", brand: "Nellore Diwali Dhamaka" };

describe("renderShareMessage", () => {
  it("fills every placeholder in an admin template", () => {
    expect(renderShareMessage("Happy Dasara from {brand}! Use {code}: {link} ({code})", values)).toBe(
      "Happy Dasara from Nellore Diwali Dhamaka! Use NDD42: https://example.in/register?ref=NDD42 (NDD42)",
    );
  });

  it("falls back to the default message when the template is blank", () => {
    expect(renderShareMessage("   ", values)).toBe(renderShareMessage(DEFAULT_SHARE_MESSAGE, values));
    expect(renderShareMessage(undefined, values)).toContain("NDD42");
  });

  it("appends the code and link when the template leaves them out", () => {
    expect(renderShareMessage("Happy Dasara!", values)).toBe(
      "Happy Dasara!\nReferral code: NDD42\nhttps://example.in/register?ref=NDD42",
    );
  });
});
