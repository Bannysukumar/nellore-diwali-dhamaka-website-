import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requestOtp: vi.fn(async () => ({ verificationId: "vid-1" })),
  confirmOtp: vi.fn(async () => ({ needsRegistration: false })),
}));

vi.mock("@/services/authService", () => ({
  ...auth,
  isValidIndianPhone: () => true,
  normaliseIndianPhone: (phone: string) => `+91${phone}`,
  resetRecaptcha: vi.fn(),
  OTP_RESEND_COOLDOWN_SECONDS: 30,
}));
vi.mock("@/lib/firebase/config", () => ({ IS_EMULATOR: false }));

import { PhoneOtpAuth } from "./PhoneOtpAuth";

async function reachOtpStep(onCompleted = vi.fn()) {
  render(
    <MemoryRouter>
      <PhoneOtpAuth mode="login" initialPhone="9876543210" onCompleted={onCompleted} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
  return { onCompleted, input: await screen.findByLabelText(/One-time password/) };
}

describe("PhoneOtpAuth code entry", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as { OTPCredential?: unknown }).OTPCredential;
  });

  it("verifies by itself once all 6 digits are filled in, only once", async () => {
    const { input, onCompleted } = await reachOtpStep();
    fireEvent.change(input, { target: { value: "12345" } });
    expect(auth.confirmOtp).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(auth.confirmOtp).toHaveBeenCalledWith("vid-1", "123456", undefined);

    fireEvent.change(input, { target: { value: "123456" } });
    expect(auth.confirmOtp).toHaveBeenCalledTimes(1);
  });

  it("fills and verifies the code read from the SMS on Android (WebOTP)", async () => {
    (window as { OTPCredential?: unknown }).OTPCredential = class {};
    const get = vi.fn(async () => ({ code: "654321" }));
    Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });

    const { input, onCompleted } = await reachOtpStep();
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect((input as HTMLInputElement).value).toBe("654321");
    expect(auth.confirmOtp).toHaveBeenCalledWith("vid-1", "654321", undefined);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ otp: { transport: ["sms"] } }));
  });
});
