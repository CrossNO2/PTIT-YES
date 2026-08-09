import QRCode from "qrcode";
import crypto from "crypto";

export type QrPayload = {
  pickupId?: string;
  redemptionId?: string;
  token: string;
  type: "pickup" | "voucher";
};

export function generateCryptoToken(): { token: string; hash: string } {
  const token = crypto.randomUUID();
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function generateQrDataUri(payload: QrPayload): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  return await QRCode.toDataURL(jsonStr, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: {
      dark: "#042f2e",
      light: "#ffffff",
    },
  });
}
