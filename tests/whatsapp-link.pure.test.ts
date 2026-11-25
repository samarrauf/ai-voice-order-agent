import { describe, expect, it } from "vitest";
import {
  DEFAULT_THANKYOU_TEMPLATE,
  buildThankYouMessage,
  buildWaLink,
  isAllowedReviewUrl,
  normalizePkPhone,
} from "@/lib/whatsapp-link";

// B4d: pure parts of the WhatsApp thank-you button (no network).

describe("normalizePkPhone", () => {
  it.each([
    ["03001234567", "+923001234567"],
    ["0300 1234567", "+923001234567"],
    ["0300-123-4567", "+923001234567"],
    ["+92 300 1234567", "+923001234567"],
    ["+92-321-7654321", "+923217654321"],
    ["0092 300 1234567", "+923001234567"],
    ["00923001234567", "+923001234567"],
    ["923001234567", "+923001234567"],
    ["(0300) 123.4567", "+923001234567"],
    ["3001234567", "+923001234567"],
    ["  03451234567  ", "+923451234567"],
  ])("%s -> %s", (input, out) => {
    expect(normalizePkPhone(input)).toBe(out);
  });

  it.each([
    "", "   ", "abc", "0300123456", "030012345678", "+44 7700 900123", "07700900123",
    "0421234567", "+92 42 1234567", "92 300 12345", "0300-123-456x", "3+923001234567", "++923001234567",
    "0092 42 3571 2345", "92300123456789",
  ])("%j -> null", (input) => {
    expect(normalizePkPhone(input)).toBeNull();
  });

  it("null and undefined -> null", () => {
    expect(normalizePkPhone(null)).toBeNull();
    expect(normalizePkPhone(undefined)).toBeNull();
  });
});

describe("buildThankYouMessage", () => {
  const vars = { customer_name: "Ali", restaurant: "Olive 'n Spice", order_no: "N-1042", total: "Rs 2,450", review_link: "https://g.page/r/abc/review" };

  it("fills every placeholder of the default template", () => {
    const m = buildThankYouMessage(null, vars);
    expect(m).toContain("Assalam o alaikum Ali! Olive 'n Spice aane ka bohat shukriya.");
    expect(m).toContain("N-1042");
    expect(m).toContain("Rs 2,450");
    expect(m).toContain("1 se 5 stars");
    expect(m).toContain("https://g.page/r/abc/review");
    expect(m).toContain("Dobara tashreef layen");
    expect(m).toContain("⭐⭐⭐⭐⭐");
    expect(m).not.toMatch(/[{}]/);
  });

  it("blank template = the default", () => {
    expect(buildThankYouMessage("   ", vars)).toBe(buildThankYouMessage(DEFAULT_THANKYOU_TEMPLATE, vars));
  });

  it("a missing customer name is removed cleanly", () => {
    const m = buildThankYouMessage(null, { ...vars, customer_name: "" });
    expect(m.split("\n")[0]).toBe("Assalam o alaikum! Olive 'n Spice aane ka bohat shukriya.");
  });

  it("no review link: the review line goes, the rest stays", () => {
    const m = buildThankYouMessage(null, { ...vars, review_link: null });
    expect(m).not.toContain("1 se 5 stars");
    expect(m).not.toContain("{review_link}");
    expect(m).toContain("Dobara tashreef layen");
    expect(m.split("\n")).toHaveLength(4);
  });

  it("unknown placeholders and lines that become empty are removed", () => {
    const m = buildThankYouMessage("Hi {customer_name}, {foo} thanks!\n{customer_name}\nOrder {order_no}", { order_no: "7" });
    expect(m).toBe("Hi, thanks!\nOrder 7");
  });

  it("values are inserted as plain text (no template injection)", () => {
    const m = buildThankYouMessage("Hi {customer_name}", { customer_name: "<b>{review_link}</b>" });
    expect(m).toBe("Hi <b>{review_link}</b>");
  });
});

describe("buildWaLink", () => {
  it("with a phone: wa.me/<digits>", () => {
    expect(buildWaLink("+923001234567", "Hi")).toBe("https://wa.me/923001234567?text=Hi");
  });

  it("without a phone: wa.me/?text=", () => {
    expect(buildWaLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
    expect(buildWaLink("", "Hi")).toBe("https://wa.me/?text=Hi");
  });

  it("encodes Urdu, emoji, & # ? and new lines, and decodes back exactly", () => {
    const text = "شکریہ ⭐⭐ Fish & Chips #12? 100%\nhttps://g.page/r/x?a=1&b=2#top";
    const url = buildWaLink("+923001234567", text);
    const query = url.split("?text=")[1];
    expect(query).not.toMatch(/[&#?\s]/);
    expect(query).toContain("%26");
    expect(query).toContain("%23");
    expect(query).toContain("%3F");
    expect(query).toContain("%0A");
    expect(decodeURIComponent(query)).toBe(text);
    expect(new URL(url).searchParams.get("text")).toBe(text);
  });
});

describe("isAllowedReviewUrl", () => {
  it.each([
    "https://g.page/r/CabcDEF/review",
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/xyz",
    "https://share.google/abc",
    "https://search.google.com/local/writereview?placeid=ChIJ123",
    "https://www.google.com/maps/place/Napoli",
    "https://google.com/search?q=napoli",
  ])("allows %s", (u) => {
    expect(isAllowedReviewUrl(u)).toBe(true);
  });

  it.each([
    "http://g.page/r/abc/review",
    "https://evil.com/g.page",
    "https://g.page.evil.com/r/abc",
    "https://google.com.evil.com/x",
    "https://maps.google.com/x",
    "https://user:pass@g.page/r/abc",
    "https://g.page:8443/r/abc",
    "javascript:alert(1)",
    "g.page/r/abc",
    "https://g.page/r/a b",
    "",
    `https://g.page/${"a".repeat(300)}`,
  ])("refuses %j", (u) => {
    expect(isAllowedReviewUrl(u)).toBe(false);
  });
});
