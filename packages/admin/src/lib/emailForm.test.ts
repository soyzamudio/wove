import { describe, expect, test } from "bun:test";
import { emailFormDiff, type EmailStatus } from "./emailForm";

const current: EmailStatus = {
  driver: "console",
  from: "Wove <no-reply@localhost>",
  configured: false,
  source: "none",
  secretHint: null,
};

const form = (over: Partial<Parameters<typeof emailFormDiff>[1]> = {}) => ({
  driver: current.driver, from: current.from, secret: "", ...over,
});

describe("emailFormDiff", () => {
  test("an untouched form sends nothing", () => {
    expect(emailFormDiff(current, form())).toEqual({});
  });

  test("sends only the changed fields", () => {
    expect(emailFormDiff(current, form({ driver: "resend" }))).toEqual({ driver: "resend" });
    expect(emailFormDiff(current, form({ from: "Kestrel <hi@kestrel.dev>" }))).toEqual({ from: "Kestrel <hi@kestrel.dev>" });
  });

  test("never sends an empty or whitespace-only secret", () => {
    expect(emailFormDiff(current, form({ secret: "" }))).toEqual({});
    expect(emailFormDiff(current, form({ secret: "   " }))).toEqual({});
    expect(emailFormDiff(current, form({ secret: " re_abc " }))).toEqual({ secret: "re_abc" });
  });

  test("trims from, and a trim-only edit is not a change", () => {
    expect(emailFormDiff(current, form({ from: "  Wove <no-reply@localhost>  " }))).toEqual({});
  });

  test("a full switch sends driver, from and secret together", () => {
    expect(emailFormDiff(current, form({ driver: "smtp", from: "a@b.co", secret: "smtp://u:p@h:587" })))
      .toEqual({ driver: "smtp", from: "a@b.co", secret: "smtp://u:p@h:587" });
  });
});
