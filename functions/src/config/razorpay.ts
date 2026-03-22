import Razorpay from "razorpay";

// Razorpay instance — initialized lazily
let _razorpay: any = null;

export function getRazorpay(): any {
  if (_razorpay) return _razorpay;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment"
    );
  }

  _razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return _razorpay;
}

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || "";
}

export function getRazorpayKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || "";
}
