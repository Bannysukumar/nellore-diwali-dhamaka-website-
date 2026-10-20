import { describe, expect, it } from "vitest";
import { supportContactFrom } from "./SettingsProvider";

describe("supportContactFrom", () => {
  it("exposes nothing when the operator has not configured support contacts", () => {
    expect(supportContactFrom({ supportPhone: "", supportEmail: "  " })).toEqual({
      phone: null,
      phoneHref: null,
      email: null,
      whatsappUrl: null,
    });
  });

  it("builds call and WhatsApp links from the configured number", () => {
    const contact = supportContactFrom({ supportPhone: "+91 98765 43210", supportEmail: "help@example.in" });
    expect(contact.phoneHref).toBe("tel:+919876543210");
    expect(contact.whatsappUrl).toBe("https://wa.me/919876543210");
    expect(contact.email).toBe("help@example.in");
  });

  it("does not build a WhatsApp link from a partial number", () => {
    expect(supportContactFrom({ supportPhone: "12345", supportEmail: "" }).whatsappUrl).toBeNull();
  });
});
