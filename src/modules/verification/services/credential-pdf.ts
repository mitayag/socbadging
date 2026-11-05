import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import type { PublicCredential } from "../types";

function pdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(value: string, maxCharacters: number): string[] {
  const words = pdfText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(value: string | null): string {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

export async function renderCredentialPdf(
  credential: PublicCredential,
  badgeImage?: { bytes: Buffer; type: "png" | "jpeg" },
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const margin = 48;
  let y = page.getHeight() - margin;
  const textColor = rgb(0.086, 0.227, 0.388);
  const muted = rgb(0.392, 0.455, 0.545);

  page.drawText("HAU SOC BADGING SYSTEM", {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: muted,
  });
  y -= 28;
  page.drawText("Digital Credential Summary", {
    x: margin,
    y,
    size: 22,
    font: bold,
    color: textColor,
  });
  y -= 20;
  page.drawText("Human-readable representation. The signed JSON-LD credential is authoritative.", {
    x: margin,
    y,
    size: 9,
    font: regular,
    color: muted,
  });
  y -= 28;

  if (badgeImage) {
    try {
      const embedded =
        badgeImage.type === "png"
          ? await document.embedPng(badgeImage.bytes)
          : await document.embedJpg(badgeImage.bytes);
      const scaled = embedded.scaleToFit(120, 120);
      page.drawImage(embedded, { ...scaled, x: margin, y: y - scaled.height });
    } catch {
      // A malformed historical image must not prevent the PDF summary.
    }
  }

  const textX = badgeImage ? margin + 144 : margin;
  const textWidth = width - textX - margin;
  let textY = y - 8;
  for (const line of wrap(credential.achievement.name, Math.floor(textWidth / 7.2))) {
    page.drawText(line, { x: textX, y: textY, size: 18, font: bold, color: textColor });
    textY -= 22;
  }
  textY -= 4;
  for (const line of wrap(credential.achievement.description, Math.floor(textWidth / 4.8)).slice(
    0,
    4,
  )) {
    page.drawText(line, { x: textX, y: textY, size: 10, font: regular, color: textColor });
    textY -= 14;
  }
  y = Math.min(y - 144, textY) - 20;

  const rows: Array<[string, string]> = [
    ["Issuer", credential.issuer.name],
    ["Recipient", credential.recipientDisplayName],
    ["Issued", formatDate(credential.issuedAt)],
    ["Expires", formatDate(credential.expiresAt)],
    ["Status", `${credential.status[0]}${credential.status.slice(1).toLowerCase()}`],
    [
      "Course",
      `${credential.achievement.class.courseCode} - ${credential.achievement.class.title}`,
    ],
    ["Verification", credential.credential.id],
  ];
  for (const [label, value] of rows) {
    page.drawText(pdfText(label.toUpperCase()), {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: muted,
    });
    y -= 13;
    for (const line of wrap(value, 84)) {
      page.drawText(line, { x: margin, y, size: 11, font: regular, color: textColor });
      y -= 15;
    }
    y -= 8;
  }

  const qrPng = await QRCode.toBuffer(credential.credential.id, {
    type: "png",
    width: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrImage = await document.embedPng(qrPng);
  const qrSize = 118;
  page.drawImage(qrImage, {
    x: width - margin - qrSize,
    y: margin,
    width: qrSize,
    height: qrSize,
  });
  page.drawText("Scan to verify", {
    x: width - margin - qrSize,
    y: margin + qrSize + 6,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText("This PDF does not replace the signed credential JSON-LD.", {
    x: margin,
    y: margin,
    size: 8,
    font: regular,
    color: muted,
  });

  return document.save();
}
