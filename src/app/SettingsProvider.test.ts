import { describe, expect, it } from "vitest";
import { supportContactFrom, whatsappDigits } from "./SettingsProvider";

describe("supportContactFrom", () => {
  it("exposes nothing when the operator has not configured support contacts", () => {
    expect(supportContactFrom({ supportPhone: "", supportEmail: "  " })).toEqual({
      phone: null,
      phoneHref: null,
      email: null,
      whatsappUrl: null,
      whatsappChatUrl: null,
    });
  });

  it("builds call and WhatsApp links from the configured number", () => {
    const contact = supportContactFrom({ supportPhone: "+91 98765 43210", supportEmail: "help@example.in" });
    expect(contact.phoneHref).toBe("tel:+919876543210");
    expect(contact.whatsappUrl).toBe("https://wa.me/919876543210");
    expect(contact.whatsappChatUrl).toBeNull();
    expect(contact.email).toBe("help@example.in");
  });

  it("does not build a WhatsApp link from a partial number", () => {
    expect(supportContactFrom({ supportPhone: "12345", supportEmail: "" }).whatsappUrl).toBeNull();
  });

  it("prefers the dedicated WhatsApp number and pre-fills the message", () => {
    const contact = supportContactFrom({
      supportPhone: "+91 98765 43210",
      supportEmail: "",
      whatsappNumber: "90000 11111",
      whatsappMessage: "Hi, I have a question",
    });
    expect(contact.whatsappChatUrl).toBe("https://wa.me/919000011111?text=Hi%2C%20I%20have%20a%20question");
    expect(contact.whatsappUrl).toBe(contact.whatsappChatUrl);
  });
});

describe("whatsappDigits", () => {
  it("adds India's country code to a bare 10-digit number", () => {
    expect(whatsappDigits("98765 43210")).toBe("919876543210");
    expect(whatsappDigits("098765 43210")).toBe("919876543210");
    expect(whatsappDigits("+91 98765 43210")).toBe("919876543210");
  });

  it("rejects numbers that are too short or too long", () => {
    expect(whatsappDigits("12345")).toBeNull();
    expect(whatsappDigits("1234567890123456")).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
  });
});
