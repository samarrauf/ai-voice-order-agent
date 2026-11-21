import { describe, expect, it } from "vitest";
import { formatPostcode, normalizePhone, phoneForSpeech, postcodeForSpeech } from "@/lib/speech";

describe("spoken digits", () => {
  it("reads a UK mobile in 3-2-3-3 groups with oh, double and triple", () => {
    expect(phoneForSpeech("07700900456")).toBe("oh-double-seven, double-oh, nine-double-oh, four-five-six");
    expect(phoneForSpeech("07700900123")).toBe("oh-double-seven, double-oh, nine-double-oh, one-two-three");
    expect(phoneForSpeech("01612220000")).toBe("oh-one-six, one-two, double-two-oh, triple-oh");
  });

  it("two numbers that differ by one swapped digit sound different", () => {
    expect(phoneForSpeech("07770090456")).not.toBe(phoneForSpeech("07700900456"));
  });

  it("normalises spaces and dashes but keeps a leading plus", () => {
    expect(normalizePhone(" 07700 900-456 ")).toBe("07700900456");
    expect(normalizePhone("+44 7700 900456")).toBe("+447700900456");
  });

  it("reads a postcode letter by letter", () => {
    expect(postcodeForSpeech("M14 5TP")).toBe("M-one-four, five-T-P");
    expect(postcodeForSpeech("m145tp")).toBe("M-one-four, five-T-P");
    expect(postcodeForSpeech("sw1a 1aa")).toBe("S-W-one-A, one-A-A");
    expect(formatPostcode("m145tp")).toBe("M14 5TP");
  });
});
